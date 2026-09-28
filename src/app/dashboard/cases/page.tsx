import { redirect } from "next/navigation";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { CASE_STATUS_PILL, formatCaseStatus, isCaseStatus } from "@/lib/case-status";

type CaseWithAttorney = Prisma.CaseGetPayload<{ include: { assignedAttorney: true } }>;

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default async function CasesPage() {
  const session = await auth();

  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW)) {
    redirect("/login?error=forbidden");
  }

  let cases: CaseWithAttorney[] = [];
  try {
    cases = await prisma.case.findMany({
      orderBy: { updatedAt: "desc" },
      include: { assignedAttorney: true },
    });
  } catch (error) {
    console.error("Failed to load cases", error);
  }

  return (
    <div>
      <h1>Cases</h1>

      <div className="tablewrap">
        <table className="stat">
          <thead>
            <tr>
              <th>Case #</th>
              <th>Title</th>
              <th>Status</th>
              <th>Assigned Attorney</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {cases.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                  No cases on file yet.
                </td>
              </tr>
            ) : (
              cases.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/dashboard/cases/${c.id}`}>{c.caseNumber}</Link>
                  </td>
                  <td>{c.title}</td>
                  <td>
                    <span
                      className={`pill ${
                        isCaseStatus(c.status) ? CASE_STATUS_PILL[c.status] : "pill-muted"
                      }`}
                    >
                      {formatCaseStatus(c.status)}
                    </span>
                  </td>
                  <td>{c.assignedAttorney?.displayName ?? "Unassigned"}</td>
                  <td>{dateFormatter.format(c.updatedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
