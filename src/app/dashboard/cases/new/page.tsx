import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { CaseOpeningForm } from "@/components/case-opening-form";
import type { RevisionDraft } from "@/components/case-opening-form";
import { localUser, canAssignCase } from "@/lib/case-access";
import { staffPageMetadata } from "@/lib/staff-metadata";

export const metadata = staffPageMetadata("Open a Case", "Submit a case opening and its supporting complaint for the required review.", "/dashboard/cases/new");

export default async function NewCasePage({ searchParams }: { searchParams: Promise<{ reviseRequestId?: string }> }) {
  const session = await auth();
  if (!session?.user || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE) && !hasCapability(session.user.tiers, CAPABILITIES.CASES_PROPOSE_EDIT))) {
    redirect("/login?error=forbidden");
  }

  const user = await localUser(session.user);
  if (!user) redirect("/login?error=forbidden");
  const canAssign = canAssignCase(session.user.tiers, user.division);
  const reviewersCanAutoApprove = hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS);
  const attorneys = canAssign ? await prisma.user.findMany({
    where: { tiers: { not: "" }, ...(hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) ? {} : { division: user.division }) },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  }).catch((error) => {
    console.error("Failed to load case assignees", error);
    return [];
  }) : [];

  let revision: RevisionDraft | undefined;
  const { reviseRequestId } = await searchParams;
  if (reviseRequestId) {
    const request = user ? await prisma.caseActionRequest.findFirst({
      where: { id: reviseRequestId, requestedById: user.id, kind: "CREATE", status: "REJECTED" },
    }) : null;
    if (!request) redirect("/dashboard/cases");

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(request.proposedData) as Record<string, unknown>;
    } catch {
      redirect("/dashboard/cases");
    }
    const filing = data.initialFiling && typeof data.initialFiling === "object"
      ? data.initialFiling as { title?: string; pdfData?: string; pdfFileName?: string }
      : null;
    let partyData: unknown = [];
    try {
      partyData = typeof data.partyDetails === "string" ? JSON.parse(data.partyDetails) : [];
    } catch {
      partyData = [];
    }
    const parties = Array.isArray(partyData) ? partyData.flatMap((party) => {
      if (!party || typeof party !== "object") return [];
      const row = party as { name?: unknown; role?: unknown };
      const allowedRoles = ["Defendant", "Co-defendant", "Witness", "Reporting officer", "Other"] as const;
      if (typeof row.name !== "string" || typeof row.role !== "string" || !allowedRoles.includes(row.role as (typeof allowedRoles)[number])) return [];
      return [{ name: row.name, role: row.role as (typeof allowedRoles)[number] }];
    }) : [];
    const asText = (value: unknown) => typeof value === "string" ? value : "";
    revision = {
      requestId: request.id,
      rejectionNote: request.reviewNote ?? "",
      title: asText(data.title),
      caseNumber: asText(data.caseNumber),
      type: asText(data.type),
      assignedJudge: asText(data.assignedJudge),
      assignedAttorneyId: asText(data.assignedAttorneyId),
      summary: asText(data.summary),
      discDue: asText(data.discDue),
      pretrial: asText(data.pretrial),
      appealBy: asText(data.appealBy),
      parties,
      filingTitle: filing?.title ?? "",
      filingName: filing?.pdfFileName ?? "",
    };
  }

  return <CaseOpeningForm officerName={session.user.displayName} canAssign={canAssign} reviewersCanAutoApprove={reviewersCanAutoApprove} attorneys={attorneys} revision={revision} />;
}
