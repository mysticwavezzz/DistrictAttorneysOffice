import { redirect } from "next/navigation";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { localUser } from "@/lib/case-access";
import { caseStatusColor } from "@/config/case-statuses";
import { bulkUpdateCases, saveCaseFilter, deleteCaseFilter } from "./actions";

type CaseWithAttorney = Prisma.CaseGetPayload<{ include: { assignedAttorney: true; filings: { select: { id: true; title: true; url: true; pdfFileName: true; createdAt: true } } } }>;

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
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW)) {
    redirect("/login?error=forbidden");
  }

  const filters = await searchParams;
  const canCreate = hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE);
  const canPropose = hasCapability(session.user.tiers, CAPABILITIES.CASES_PROPOSE_EDIT);
  const viewAll = hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW_ALL);
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

  const user = await localUser(session.user);
  const mineOnly = filters.mine === "1";
  const overdueOnly = filters.deadline === "overdue";
  const reviewOnly = filters.review === "1";

  const where: Prisma.CaseWhereInput = { archived: tab === "archived" };
  if ((!viewAll || mineOnly) && user) {
    where.OR = [{ assignedAttorneyId: user.id }, { createdById: user.id }];
  }
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
      prisma.case.findMany({ where, orderBy: { [sort]: direction }, include: { assignedAttorney: true, filings: { select: { id: true, title: true, url: true, pdfFileName: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 3 } }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.case.count({ where }),
    ]);
  } catch (error) {
    console.error("Failed to load cases", error);
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
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <h1>My Cases</h1>
        <div style={{ display: "flex", gap: 8, position: "sticky", top: 8, zIndex: 2 }}>
          {canCreate && (
            <Link href="/dashboard/cases/new" className="govbtn">
              Open a Case
            </Link>
          )}
          {!canCreate && canPropose && (
            <Link href="/dashboard/cases/new" className="govbtn">
              Open a Case
            </Link>
          )}
          <Link href={`/dashboard/cases/export${qs({})}`} className="govbtn-outline">
            Export CSV
          </Link>
          <Link href="/dashboard/cases/calendar" className="govbtn-outline">Deadline Calendar</Link>
        </div>
      </div>

      {!viewAll && (
        <p className="note-inline">Showing only cases assigned to or filed by you.</p>
      )}

      <div className="tabs-row">
        <Link href={`/dashboard/cases${qs({ tab: "ongoing" })}`} className={tab === "ongoing" ? "on" : undefined}>
          Ongoing / Pending
        </Link>
        <Link href={`/dashboard/cases${qs({ tab: "archived" })}`} className={tab === "archived" ? "on" : undefined}>
          Archived
        </Link>
      </div>

      <form className="field-row" style={{ marginBottom: 14, alignItems: "flex-end" }}>
        <input type="hidden" name="tab" value={tab} />
        <div className="field" style={{ flex: "1 1 220px" }}>
          <label htmlFor="q">Search</label>
          <input type="text" id="q" name="q" defaultValue={q} placeholder="Case #, title, attorney" />
        </div>
        <div className="field" style={{ flex: "1 1 200px" }}>
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={statusFilter}>
            <option value="">All statuses</option>
            {Array.from(new Set(cases.map((c) => c.stage).filter(Boolean))).map((s) => (
              <option key={s} value={s ?? ""}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="field"><label htmlFor="case-sort">Sort by</label><select id="case-sort" name="sort" defaultValue={sort}><option value="updatedAt">Recently updated</option><option value="caseNumber">Case number</option><option value="title">Case title</option><option value="stage">Status</option></select></div>
        <div className="field"><label htmlFor="case-direction">Order</label><select id="case-direction" name="dir" defaultValue={direction}><option value="desc">Descending</option><option value="asc">Ascending</option></select></div>
        <button type="submit" className="govbtn-outline">
          Filter
        </button>
        <Link href={`/dashboard/cases?tab=${tab}`} className="govbtn-outline">Clear filters</Link>
      </form>

      <div className="tabs-row" aria-label="Case shortcuts">
        <Link href={`/dashboard/cases${qs({ tab: "ongoing", mine: "1", deadline: "", review: "", page: "1" })}`}>My active cases</Link>
        <Link href={`/dashboard/cases${qs({ tab: "ongoing", mine: "", deadline: "overdue", review: "", page: "1" })}`}>Overdue deadlines</Link>
        <Link href={`/dashboard/cases${qs({ tab: "ongoing", mine: "", deadline: "", review: "1", page: "1" })}`}>Awaiting review</Link>
      </div>
      {user && <>
        <form action={saveCaseFilter} className="field-row" style={{ alignItems: "flex-end" }}>
          <input type="hidden" name="query" value={qs({ page: "1" })} />
          <div className="field"><label htmlFor="saved-filter-name">Save current filters</label><input id="saved-filter-name" name="name" maxLength={60} required placeholder="e.g. My active cases" /></div>
          <button className="govbtn-outline" type="submit">Save filter</button>
        </form>
        {(() => { let saved: {id:string;name:string;query:string}[]=[]; try { saved=JSON.parse(user.savedCaseFilters || "[]"); } catch {} return saved.length > 0 && <div className="tabs-row" aria-label="Saved case filters">{saved.map((item)=><span key={item.id}><Link href={`/dashboard/cases?${item.query}`}>{item.name}</Link> <form action={deleteCaseFilter} style={{display:"inline"}}><input type="hidden" name="id" value={item.id}/><button className="linklike" type="submit" aria-label={`Delete saved filter ${item.name}`}>×</button></form></span>)}</div>; })()}
      </>}

      {totalCases > 0 && <p className="note-inline" aria-live="polite">Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCases)} of {totalCases} cases</p>}
      <form action={bulkUpdateCases}>
      {cases.length ? <div className="case-card-list">{cases.map((c) => {
        const nextDeadline = [c.discDue, c.pretrial, c.appealBy].filter((date): date is Date => Boolean(date)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
        const color = caseStatusColor(c.stage);
        return <article className="case-card" key={c.id}>
          <header className="case-card-heading"><label className="case-select"><input type="checkbox" name="caseIds" value={c.id} aria-label={`Select ${c.caseNumber}: ${c.title}`} /></label><div><Link href={`/dashboard/cases/${c.id}`}><strong>{c.caseNumber} · {c.title}</strong></Link><div className="case-card-subtitle">{c.type ?? "Case"}{c.isDraft && <span className="pill pill-muted">Draft</span>}</div></div><span className={`pill ${c.archived ? "pill-muted" : c.stage ? `pill-${color}` : "pill-muted"}`}>{c.archived ? "Archived" : c.stage ?? "Open"}</span></header>
          <div className="case-card-meta"><span><small>Assigned attorney</small><strong>{c.assignedAttorney?.displayName ?? "Unassigned"}</strong></span><span><small>Assigned judge</small><strong>{c.assignedJudge ?? "Not assigned"}</strong></span><span><small>Opened</small><strong>{fmt(c.createdAt)}</strong></span><span><small>Next deadline</small><strong className={nextDeadline && nextDeadline < new Date() ? "deadline-overdue" : undefined}>{fmt(nextDeadline)}</strong></span></div>
          {c.filings.length > 0 && <div className="case-card-filings"><strong>Recent filings</strong><ul>{c.filings.map((filing) => <li key={filing.id}>{filing.url ? <a href={filing.url} target="_blank" rel="noreferrer noopener">{filing.title}</a> : <a href={`/api/cases/filings/${filing.id}/pdf`}>{filing.title}</a>}<time dateTime={filing.createdAt.toISOString()}>{dateFormatter.format(filing.createdAt)}</time></li>)}</ul></div>}
          <footer className="case-card-actions"><Link href={`/dashboard/cases/${c.id}`}>Open case</Link><Link href={`/dashboard/filings/new?caseId=${c.id}`}>File a document</Link><Link href={`/dashboard/cases/${c.id}#filings`}>All filings</Link></footer>
        </article>;
      })}</div> : <div className="empty-state"><h2>No cases found</h2><p>{q || statusFilter || overdueOnly || reviewOnly ? "Adjust or clear the filters to find a case." : "Open a case to start your docket work."}</p>{canCreate && <Link href="/dashboard/cases/new" className="govbtn-outline">Open a Case</Link>}</div>}
      <div className="field-row" style={{ alignItems: "flex-end", marginTop: 10 }}>
        {hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) && <div className="field"><label htmlFor="bulkAssignee">Assign selected to</label><select id="bulkAssignee" name="assigneeId" defaultValue=""><option value="">Unassigned</option>{await prisma.user.findMany({ where: { tiers: { not: "" } }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }).then((users) => users.map((a) => <option key={a.id} value={a.id}>{a.displayName}</option>))}</select><button className="govbtn-outline" name="operation" value="assign" type="submit">Assign selected</button></div>}
        {hasCapability(session.user.tiers, CAPABILITIES.CASES_EDIT) && <button className="govbtn-outline" name="operation" value="archive" type="submit">Archive selected</button>}
      </div>
      </form>
      <nav className="tabs-row" aria-label="Case pages">
        {page > 1 && <Link href={`/dashboard/cases${qs({ page: String(page - 1) })}`}>← Previous</Link>}
        <span aria-current="page">Page {page} of {Math.max(1, Math.ceil(totalCases / pageSize))}</span>
        {page * pageSize < totalCases && <Link href={`/dashboard/cases${qs({ page: String(page + 1) })}`}>Next →</Link>}
      </nav>
    </div>
  );
}
