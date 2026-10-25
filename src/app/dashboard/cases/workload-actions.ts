"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { canAccessCase, canAssignCase, localUser, requiresCriminalAssigneeGroup } from "@/lib/case-access";
import { notify } from "@/lib/notifications";
import { logActivity } from "@/lib/activity-log";

export async function assignFromWorkload(formData: FormData) {
  const session = await auth();
  if (!session?.user?.providerUserId || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) && !hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN_DIVISION))) throw new Error("Forbidden");
  const user = await localUser(session.user);
  if (!user) throw new Error("Forbidden");
  const caseId = String(formData.get("caseId") ?? "").trim();
  const assigneeId = String(formData.get("assigneeId") ?? "").trim();
  const record = await prisma.case.findUnique({ where: { id: caseId }, include: { assignedAttorney: { select: { displayName: true } } } });
  const assignee = assigneeId ? await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true, displayName: true, division: true, divisionGroup: true } }) : null;
  if (!record || !canAccessCase(session.user.tiers, user.id, record, user.division, user.divisionGroup) || !canAssignCase(session.user.tiers, user.division, record.division)) throw new Error("This case is outside your assignment authority.");
  if (!assignee || assignee.division !== record.division) throw new Error("Choose an eligible attorney in the case division.");
  const restrictToGroup = session.user.tiers.includes("senior_assistant_district_attorney") && !hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) && record.division === "Criminal Division";
  if (restrictToGroup && assignee.divisionGroup !== user.divisionGroup) throw new Error("Choose an attorney in your Criminal Division group.");
  if (requiresCriminalAssigneeGroup(record.division, true, record.assignedAttorneyId, assignee.id) && record.division === "Criminal Division" && !assignee.divisionGroup && !hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN)) throw new Error("Assign the attorney to a Criminal Division group first.");

  await prisma.$transaction(async (tx) => {
    await tx.case.update({ where: { id: record.id }, data: { assignedAttorneyId: assignee.id, divisionGroup: record.division === "Criminal Division" ? assignee.divisionGroup : null } });
    await tx.caseComment.create({ data: { caseId, isSystem: true, body: `Assignment changed from ${record.assignedAttorney?.displayName ?? "Unassigned"} to ${assignee.displayName} by ${session.user.displayName}.` } });
  });
  if (assignee.id !== user.id) await notify({ userId: assignee.id, type: "case_assigned", title: `You were assigned to ${record.caseNumber}`, body: record.title, link: `/dashboard/cases/${record.id}` });
  await logActivity(session.user.displayName, `Assigned case to ${assignee.displayName}`, "Case", record.caseNumber);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cases");
  revalidatePath("/dashboard/workload");
  revalidatePath(`/dashboard/cases/${record.id}`);
}
