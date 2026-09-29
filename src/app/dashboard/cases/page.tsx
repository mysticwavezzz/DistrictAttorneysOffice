import { redirect } from "next/navigation";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { localUser } from "@/lib/case-access";
import { caseStatusColor } from "@/config/case-statuses";

type CaseWithAttorney = Prisma.CaseGetPayload<{ include: { assignedAttorney: true } }>;

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "short" });
const DUE_SOON_DAYS = 3;

function fmt(date: Date | null): string {
  return date ? dateFormatter.format(date) : "—";
}

function text(value: string | null): string {
  return value && value.trim() !== "" ? value : "—";
}

function deadlinePill(date: Date | null): string | null {
  if (!date) return null;
  const now = new Date();
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "pill-red";
  if (diffDays <= DUE_SOON_DAYS) return "pill-gold";
  return null;
}

export default async function CasesPage({
  searchParams,
}: {
  searchParams: { tab?: string; q?: string; status?: string };
}) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW)) {
    redirect("/login?error=forbidden");
  }

  const canCreate = hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE);
  const canPropose = hasCapability(session.user.tiers, CAPABILITIES.CASES_PROPOSE_EDIT);
  const viewAll = hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW_ALL);
  const tab = searchParams.tab === "archived" ? "archived" : "ongoing";
  const q = (searchParams.q ?? "").trim();
  const statusFilter = (searchParams.status ?? "").trim();

  const user = await localUser(session.user.discordUserId);

  const where: Prisma.CaseWhereInput = { archived: tab === "archived" };
  if (!viewAll && user) {
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

  let cases: CaseWithAttorney[] = [];
  try {
    cases = await prisma.case.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: { assignedAttorney: true },
    });
  } catch (error) {
    console.error("Failed to load cases", error);
  }

  const qs = (overrides: Record<string, string>) => {
    const params = new URLSearchParams({ tab, q, status: statusFilter, ...overrides });
    for (const [key, value] of Array.from(params.entries())) {
      if (!value) params.delete(key);
    }
    const str = params.toString();
    return str ? `?${str}` : "";
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <h1>Cases</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {canCreate && (
            <Link href="/dashboard/cases/new" className="govbtn">
              New Case
            </Link>
          )}
          {!canCreate && canPropose && (
            <Link href="/dashboard/cases/new" className="govbtn">
              Propose New Case
            </Link>
          )}
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
        <button type="submit" className="govbtn-outline" style={{ color: "var(--link)", border: "1px solid var(--bd)" }}>
          Filter
        </button>
      </form>

      <div className="tablewrap">
        <table className="stat">
          <thead>
            <tr>
              <th>Case</th>
              <th>Assigned</th>
              <th>Case #</th>
              <th>Type</th>
              <th>Stage</th>
              <th>Disclosures</th>
              <th>Disc. Given</th>
              <th>Disc. Due</th>
              <th>Pretrial</th>
              <th>Other Dates</th>
              <th>Outcome</th>
              <th>Closed On</th>
              <th>Appeal By</th>
            </tr>
          </thead>
          <tbody>
            {cases.length === 0 ? (
              <tr>
                <td colSpan={13} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                  No cases found.
                </td>
              </tr>
            ) : (
              cases.map((c) => {
                const color = caseStatusColor(c.stage);
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/dashboard/cases/${c.id}`}>{c.title}</Link>
                    </td>
                    <td>{c.assignedAttorney?.displayName ?? "Unassigned"}</td>
                    <td className="mono">{c.caseNumber}</td>
                    <td>{text(c.type)}</td>
                    <td>
                      {c.stage ? <span className={`pill pill-${color}`}>{c.stage}</span> : "—"}
                    </td>
                    <td>{text(c.disclosures)}</td>
                    <td>{fmt(c.discGiven)}</td>
                    <td>
                      {fmt(c.discDue)}
                      {deadlinePill(c.discDue) && <span className={`pill ${deadlinePill(c.discDue)}`} style={{ marginLeft: 4 }}>!</span>}
                    </td>
                    <td>
                      {fmt(c.pretrial)}
                      {deadlinePill(c.pretrial) && <span className={`pill ${deadlinePill(c.pretrial)}`} style={{ marginLeft: 4 }}>!</span>}
                    </td>
                    <td>{text(c.otherDates)}</td>
                    <td>{text(c.outcome)}</td>
                    <td>{fmt(c.closedOn)}</td>
                    <td>
                      {fmt(c.appealBy)}
                      {deadlinePill(c.appealBy) && <span className={`pill ${deadlinePill(c.appealBy)}`} style={{ marginLeft: 4 }}>!</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
