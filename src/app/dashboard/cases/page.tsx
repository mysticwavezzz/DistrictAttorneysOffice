import { redirect } from "next/navigation";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { caseVisibilityWhere, localUser, canViewCases, canAssignCase } from "@/lib/case-access";
import { caseStatusColor } from "@/config/case-statuses";
import { bulkUpdateCases, saveCaseFilter, deleteCaseFilter } from "./actions";
import { getProceduralDeadlines } from "@/lib/procedural-deadlines";
import { shareMetadata } from "@/lib/share-metadata";

export const metadata = shareMetadata("My Cases", "Search assigned and accessible cases, review their status, and continue casework.", "/dashboard/cases");

type CaseWithAttorney = Prisma.CaseGetPayload<{ include: { assignedAttorney: true; filings: { select: { id: true; title: true; url: true; pdfFileName: true; status: true; isInitial: true; createdAt: true } } } }>;

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "short" });
function fmt(date: Date | null): string {
  return date ? dateFormatter.format(date) : "Not set";
}

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; status?: string; page?: string; sort?: string; dir?: string; mine?: string; deadline?: string; review?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !canViewCases(session.user.tiers)) {
    redirect("/login?error=forbidden");
  }

  const filters = await searchParams;
  const user = await localUser(session.user);
  if (!user) redirect("/login?error=forbidden");
  const canCreate = hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE);
  const canPropose = hasCapability(session.user.tiers, CAPABILITIES.CASES_PROPOSE_EDIT);
  const viewAll = hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW_ALL);
  const canBulkAssign = canAssignCase(session.user.tiers, user.division);
  const canBulkArchive = hasCapability(session.user.tiers, CAPABILITIES.CASES_EDIT) || hasCapability(session.user.tiers, CAPABILITIES.CASES_EDIT_DIVISION);
  const tab = filters.tab === "archived" ? "archived" : "ongoing";
  const q = (filters.q ?? "").trim();
  const statusFilter = (filters.status ?? "").trim();
  const page = Math.max(1, Number.parseInt(filters.page ?? "1", 10) || 1);
  const sortable = ["caseNumber", "title", "stage", "updatedAt"] as const;
  const sort = sortable.includes(filters.sort as (typeof sortable)[number])
    ? (filters.sort as (typeof sortable)[number])
    : "updatedAt";
  const direction = filters.dir === "asc" ? "asc" : "desc";
  const pageSize = 25;

  const mineOnly = filters.mine === "1";
  const overdueOnly = filters.deadline === "overdue";
  const reviewOnly = filters.review === "1";
  const assignableUsers = canBulkAssign ? await prisma.user.findMany({
    where: { tiers: { not: "" }, ...(hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) ? {} : { division: user.division }) },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  }).catch((error) => {
    console.error("Failed to load case assignees", error);
    return [];
  }) : [];

  const where: Prisma.CaseWhereInput = { archived: tab === "archived" };
  const visibility = mineOnly
    ? { OR: [{ assignedAttorneyId: user.id }, { createdById: user.id }] }
    : caseVisibilityWhere(session.user.tiers, user.id, user.division);
  if (!visibility) redirect("/login?error=forbidden");
  Object.assign(where, visibility);
  if (q) {
    where.AND = [
      {
        OR: [
          { title: { contains: q } },
          { caseNumber: { contains: q } },
          { assignedAttorney: { displayName: { contains: q } } },
        ],
      },
    ];
  }
  if (statusFilter) {
    where.stage = statusFilter;
  }
  if (overdueOnly) where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { OR: [{ discDue: { lt: new Date() } }, { pretrial: { lt: new Date() } }, { appealBy: { lt: new Date() } }] }];
  if (reviewOnly) where.actionRequests = { some: { status: "PENDING" } };

  let cases: CaseWithAttorney[] = [];
  let totalCases = 0;
  try {
    [cases, totalCases] = await Promise.all([
      prisma.case.findMany({ where, orderBy: { [sort]: direction }, include: { assignedAttorney: true, filings: { select: { id: true, title: true, url: true, pdfFileName: true, status: true, isInitial: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 3 } }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.case.count({ where }),
    ]);
  } catch (error) {
    console.error("Failed to load cases", error);
  }
  const legacyFiledAt = new Map<string, Date>();
  if (cases.length) {
    const legacyFilings = await prisma.caseFiling.findMany({ where: { caseId: { in: cases.map((item) => item.id) }, status: "ACCEPTED", isInitial: false }, select: { caseId: true, createdAt: true }, orderBy: { createdAt: "asc" } }).catch(() => []);
    const createdAtByCase = new Map(cases.map((item) => [item.id, item.createdAt]));
    for (const filing of legacyFilings) {
      const openedAt = createdAtByCase.get(filing.caseId);
      if (openedAt && Math.abs(filing.createdAt.getTime() - openedAt.getTime()) <= 120_000 && !legacyFiledAt.has(filing.caseId)) legacyFiledAt.set(filing.caseId, filing.createdAt);
    }
  }

  const qs = (overrides: Record<string, string>) => {
    const params = new URLSearchParams({ tab, q, status: statusFilter, page: String(page), sort, dir: direction, ...(mineOnly ? { mine: "1" } : {}), ...(overdueOnly ? { deadline: "overdue" } : {}), ...(reviewOnly ? { review: "1" } : {}), ...overrides });
    for (const [key, value] of Array.from(params.entries())) {
      if (!value) params.delete(key);
    }
    const str = params.toString();
    return str ? `?${str}` : "";
  };

  return (
    <div className="cases-page">
      <header className="cases-page-header">
        <div className="cases-page-title"><p className="eyebrow">Casework</p><h1>My Cases</h1><p className="lede">Find a case, check its next deadline, or continue assigned work.</p></div>
        <div className="cases-page-actions">
          {(canCreate || canPropose) && <Link href="/dashboard/cases/new" className="govbtn">Open a Case</Link>}
          <Link href={`/dashboard/cases/export${qs({})}`} className="govbtn-outline">Export CSV</Link>
          <Link href="/dashboard/cases/calendar" className="govbtn-outline">Deadline Calendar</Link>
        </div>
      </header>

      {!viewAll && <p className="case-scope-note">Showing cases assigned to or filed by you.</p>}

      <nav className="tabs-row cases-tabs" aria-label="Case status">
        <Link href={`/dashboard/cases${qs({ tab: "ongoing" })}`} className={tab === "ongoing" ? "on" : undefined}>Ongoing / Pending</Link>
        <Link href={`/dashboard/cases${qs({ tab: "archived" })}`} className={tab === "archived" ? "on" : undefined}>Archived</Link>
      </nav>

      <details className="case-docket-tools">
      <summary>Search, saved views, and quick filters</summary>
      <form className="case-filter-panel">
        <input type="hidden" name="tab" value={tab} />
        <div className="case-filter-grid">
          <div className="field"><label htmlFor="q">Search</label><input type="text" id="q" name="q" defaultValue={q} placeholder="Case #, title, attorney" /></div>
          <div className="field"><label htmlFor="status">Status</label><select id="status" name="status" defaultValue={statusFilter}><option value="">All statuses</option>{Array.from(new Set(cases.map((c) => c.stage).filter(Boolean))).map((s) => <option key={s} value={s ?? ""}>{s}</option>)}</select></div>
          <div className="field"><label htmlFor="case-sort">Sort by</label><select id="case-sort" name="sort" defaultValue={sort}><option value="updatedAt">Recently updated</option><option value="caseNumber">Case number</option><option value="title">Case title</option><option value="stage">Status</option></select></div>
          <div className="field"><label htmlFor="case-direction">Order</label><select id="case-direction" name="dir" defaultValue={direction}><option value="desc">Descending</option><option value="asc">Ascending</option></select></div>
        </div>
        <div className="case-filter-actions"><button type="submit" className="govbtn">Apply filters</button><Link href={`/dashboard/cases?tab=${tab}`} className="govbtn-outline">Clear filters</Link></div>
      </form>

      <section className="case-tools-panel" aria-label="Case filter shortcuts">
        <div className="case-presets"><h2>Quick filters</h2><nav className="case-shortcut-links" aria-label="Case shortcuts">
          <Link href={`/dashboard/cases${qs({ tab: "ongoing", mine: "1", deadline: "", review: "", page: "1" })}`}>My active cases</Link>
          <Link href={`/dashboard/cases${qs({ tab: "ongoing", mine: "", deadline: "overdue", review: "", page: "1" })}`}>Overdue deadlines</Link>
          <Link href={`/dashboard/cases${qs({ tab: "ongoing", mine: "", deadline: "", review: "1", page: "1" })}`}>Awaiting review</Link>
        </nav></div>
        {user && <div className="case-saved-filters">
          <form action={saveCaseFilter} className="case-save-filter-form"><input type="hidden" name="query" value={qs({ page: "1" })} /><div className="field"><label htmlFor="saved-filter-name">Save this view</label><input id="saved-filter-name" name="name" maxLength={60} required placeholder="Name this filter" /></div><button className="govbtn-outline" type="submit">Save view</button></form>
          {(() => { let saved: {id:string;name:string;query:string}[]=[]; try { saved=JSON.parse(user.savedCaseFilters || "[]"); } catch {} return saved.length > 0 && <nav className="case-saved-links" aria-label="Saved case filters">{saved.map((item)=><span className="case-saved-chip" key={item.id}><Link href={`/dashboard/cases?${item.query}`}>{item.name}</Link><form action={deleteCaseFilter}><input type="hidden" name="id" value={item.id}/><button className="linklike" type="submit" aria-label={`Delete saved filter ${item.name}`}>×</button></form></span>)}</nav>; })()}
        </div>}
      </section>
      </details>

      <section className="case-results" aria-label="Case results">
        <div className="case-results-heading"><h2>{tab === "archived" ? "Archived cases" : "Case docket"}</h2>{totalCases > 0 && <p aria-live="polite">Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCases)} of {totalCases} cases</p>}</div>
        {cases.length ? <form action={bulkUpdateCases} className="case-bulk-form">
          <details className="case-bulk-details"><summary>Manage selected cases <span>Select case cards below to assign or archive multiple records.</span></summary><div className="case-bulk-toolbar"><div><strong>Bulk actions</strong><span>Select cases below, then choose an action.</span></div><div className="case-bulk-controls">
            {canBulkAssign && <div className="field"><label htmlFor="bulkAssignee">Assign selected to</label><select id="bulkAssignee" name="assigneeId" defaultValue=""><option value="">Unassigned</option>{assignableUsers.map((a) => <option key={a.id} value={a.id}>{a.displayName}</option>)}</select><button className="govbtn-outline" name="operation" value="assign" type="submit">Assign selected</button></div>}
            {canBulkArchive && tab !== "archived" && <button className="govbtn-outline" name="operation" value="archive" type="submit">Archive selected</button>}
          </div></div></details>
          <div className="case-card-list">{cases.map((c) => {
            const initialFiling = c.filings.find((filing) => filing.isInitial);
            const courtFiledAt = c.courtFiledAt ?? (initialFiling?.status === "ACCEPTED" ? initialFiling.createdAt : legacyFiledAt.get(c.id) ?? null);
            const initialPending = initialFiling?.status === "PENDING";
            const initialRejected = initialFiling?.status === "REJECTED";
            const courtStatus = courtFiledAt ? "Filed with court" : initialPending ? "Awaiting review" : initialRejected ? "Returned for correction" : "Unfiled in court";
            const deadlineOptions = getProceduralDeadlines({ ...c, courtFiledAt });
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const nextDeadline = deadlineOptions.find((item) => item.dueDate >= today) ?? deadlineOptions.at(-1) ?? null;
            const color = caseStatusColor(c.stage);
            let partyRole = "";
            try {
              const rows = JSON.parse(c.partyDetails) as { name?: string; role?: string }[];
              const identities = [session.user.username, session.user.displayName].filter(Boolean).map((name) => name!.trim().toLocaleLowerCase());
              partyRole = rows.find((party) => party.name && identities.includes(party.name.trim().toLocaleLowerCase()))?.role ?? "";
            } catch { partyRole = ""; }
            const yourRole = partyRole || (user && c.assignedAttorneyId === user.id ? "Assigned attorney" : user && c.createdById === user.id ? "Submitting officer" : "Office staff");
            return <article className="case-card" key={c.id}>
              <header className="case-card-heading"><label className="case-select"><input type="checkbox" name="caseIds" value={c.id} aria-label={`Select ${c.caseNumber}: ${c.title}`} /></label><div><Link href={`/dashboard/cases/${c.id}`}><strong>{c.caseNumber} · {c.title}</strong></Link><div className="case-card-subtitle">{c.type ?? "Case"}{c.isDraft && <span className="pill pill-muted">Internal draft</span>}</div></div><div className="case-card-statuses"><span className={`pill ${courtFiledAt ? "pill-green" : initialPending ? "pill-gold" : initialRejected ? "pill-red" : "pill-muted"}`}>{courtStatus}</span><span className={`pill ${c.archived ? "pill-muted" : c.stage ? `pill-${color}` : "pill-muted"}`}>{c.archived ? "Archived" : c.stage ?? "No case status"}</span></div></header>
              <div className="case-card-meta"><span><small>Court filing</small><strong>{fmt(courtFiledAt)}</strong></span><span><small>Assigned judge</small><strong>{c.assignedJudge ?? "Not assigned"}</strong></span><span><small>Your role</small><strong>{yourRole}</strong></span><span><small>{nextDeadline?.label ?? "Next deadline"}</small><strong className={nextDeadline && nextDeadline.dueDate < today ? "deadline-overdue" : undefined}>{fmt(nextDeadline?.dueDate ?? null)}</strong></span></div>
              <details className="case-card-expand">
                <summary aria-label={`Toggle details for ${c.caseNumber}`}><span className="case-card-expand-open">Hide case details</span><span className="case-card-expand-closed">Show recent filings and actions</span></summary>
                {c.filings.length > 0 && <div className="case-card-filings"><strong>Recent filings</strong><ul>{c.filings.map((filing) => <li key={filing.id}><span>{filing.title}{filing.pdfFileName && <> <a href={`/api/cases/filings/${filing.id}/pdf`} target="_blank" rel="noreferrer noopener">View PDF</a></>}</span><time dateTime={filing.createdAt.toISOString()}>{dateFormatter.format(filing.createdAt)}</time></li>)}</ul></div>}
                <footer className="case-card-actions"><Link className="govbtn-outline" href={`/dashboard/cases/${c.id}`}>Open case</Link>{!courtFiledAt && <Link className="govbtn-outline" href={`/dashboard/cases/${c.id}#court-filing`}>{initialPending ? "Filing awaiting review" : "File with court"}</Link>}<Link className="govbtn-outline" href={`/dashboard/filings/new?caseId=${c.id}`}>File a document</Link></footer>
              </details>
            </article>;
          })}</div>
        </form> : <div className="empty-state case-empty-state"><h2>No cases found</h2><p>{q || statusFilter || overdueOnly || reviewOnly ? "Adjust or clear the filters to find a case." : "Open a case to start your docket work."}</p>{(canCreate || canPropose) && <Link href="/dashboard/cases/new" className="govbtn-outline">Open a Case</Link>}</div>}
        {totalCases > pageSize && <nav className="tabs-row case-pagination" aria-label="Case pages">
          {page > 1 && <Link href={`/dashboard/cases${qs({ page: String(page - 1) })}`}>← Previous</Link>}
          <span aria-current="page">Page {page} of {Math.ceil(totalCases / pageSize)}</span>
          {page * pageSize < totalCases && <Link href={`/dashboard/cases${qs({ page: String(page + 1) })}`}>Next →</Link>}
        </nav>}
      </section>
    </div>
  );
}
