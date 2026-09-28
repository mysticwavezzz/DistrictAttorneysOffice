import { redirect, notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { CASE_STATUS_PILL, formatCaseStatus, isCaseStatus } from "@/lib/case-status";

type CaseWithRelations = Prisma.CaseGetPayload<{
  include: { assignedAttorney: true; createdBy: true };
}>;

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export default async function CaseDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW)) {
    redirect("/login?error=forbidden");
  }

  let caseRecord: CaseWithRelations | null = null;
  try {
    caseRecord = await prisma.case.findUnique({
      where: { id: params.id },
      include: { assignedAttorney: true, createdBy: true },
    });
  } catch (error) {
    console.error("Failed to load case", error);
  }

  if (!caseRecord) notFound();

  return (
    <div>
      <p className="eyebrow">{caseRecord.caseNumber}</p>
      <h1>{caseRecord.title}</h1>
      <p className="subtitle">
        <span
          className={`pill ${
            isCaseStatus(caseRecord.status) ? CASE_STATUS_PILL[caseRecord.status] : "pill-muted"
          }`}
        >
          {formatCaseStatus(caseRecord.status)}
        </span>
      </p>

      <div className="formbox">
        <div className="cards" style={{ marginBottom: 16 }}>
          <div className="card">
            <span className="card-label">Assigned Attorney</span>
            <span className="card-value" style={{ fontSize: 15 }}>
              {caseRecord.assignedAttorney?.displayName ?? "Unassigned"}
            </span>
          </div>
          <div className="card">
            <span className="card-label">Created By</span>
            <span className="card-value" style={{ fontSize: 15 }}>
              {caseRecord.createdBy.displayName}
            </span>
          </div>
          <div className="card">
            <span className="card-label">Last Updated</span>
            <span className="card-value" style={{ fontSize: 13 }}>
              {dateFormatter.format(caseRecord.updatedAt)}
            </span>
          </div>
        </div>

        <h3>Summary</h3>
        <p style={{ whiteSpace: "pre-wrap" }}>{caseRecord.summary}</p>
      </div>
    </div>
  );
}
