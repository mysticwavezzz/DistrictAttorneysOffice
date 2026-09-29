import { redirect } from "next/navigation";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";

type CaseWithAttorney = Prisma.CaseGetPayload<{ include: { assignedAttorney: true } }>;

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "short" });

function fmt(date: Date | null): string {
  return date ? dateFormatter.format(date) : "—";
}

function text(value: string | null): string {
  return value && value.trim() !== "" ? value : "—";
}

export default async function CasesPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW)) {
    redirect("/login?error=forbidden");
  }

  const canCreate = hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE);
  const tab = searchParams.tab === "archived" ? "archived" : "ongoing";

  let cases: CaseWithAttorney[] = [];
  try {
    cases = await prisma.case.findMany({
      where: { archived: tab === "archived" },
      orderBy: { updatedAt: "desc" },
      include: { assignedAttorney: true },
    });
  } catch (error) {
    console.error("Failed to load cases", error);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <h1>Cases</h1>
        {canCreate && (
          <Link href="/dashboard/cases/new" className="govbtn">
            New Case
          </Link>
        )}
      </div>

      <div className="tabs-row">
        <Link href="/dashboard/cases?tab=ongoing" className={tab === "ongoing" ? "on" : undefined}>
          Ongoing / Pending
        </Link>
        <Link href="/dashboard/cases?tab=archived" className={tab === "archived" ? "on" : undefined}>
          Archived
        </Link>
      </div>

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
                  No {tab === "archived" ? "archived" : "ongoing"} cases on file.
                </td>
              </tr>
            ) : (
              cases.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/dashboard/cases/${c.id}`}>{c.title}</Link>
                  </td>
                  <td>{c.assignedAttorney?.displayName ?? "Unassigned"}</td>
                  <td className="mono">{c.caseNumber}</td>
                  <td>{text(c.type)}</td>
                  <td>{text(c.stage)}</td>
                  <td>{text(c.disclosures)}</td>
                  <td>{fmt(c.discGiven)}</td>
                  <td>{fmt(c.discDue)}</td>
                  <td>{fmt(c.pretrial)}</td>
                  <td>{text(c.otherDates)}</td>
                  <td>{text(c.outcome)}</td>
                  <td>{fmt(c.closedOn)}</td>
                  <td>{fmt(c.appealBy)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
