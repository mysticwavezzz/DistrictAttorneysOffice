"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { canAccessCase, canAssignCase, localUser, requiresCriminalAssigneeGroup } from "@/lib/case-access";
import { getDivisionCaseAssignees } from "@/lib/case-assignees";
import { notify } from "@/lib/notifications";
import { logActivity } from "@/lib/activity-log";

export async function assignFromWorkload(formData: FormData) {
  const session = await auth();
  if (!session?.user?.providerUserId || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) && !hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN_DIVISION))) throw new Error("Forbidden");
  const user = await localUser(session.user);
  if (!user) throw new Error("Forbidden");
  const caseId = String(formData.get("caseId") ?? "").trim();
  const assigneeId = String(formData.get("assigneeId") ?? "").trim();
  const expectedAssignedAttorneyId = String(formData.get("expectedAssignedAttorneyId") ?? "").trim() || null;
  const record = await prisma.case.findUnique({ where: { id: caseId }, include: { assignedAttorney: { select: { displayName: true } } } });
  const assignee = assigneeId ? await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true, displayName: true, division: true, divisionGroup: true } }) : null;
  if (!record || !canAccessCase(session.user.tiers, user.id, record, user.division, user.divisionGroup) || !canAssignCase(session.user.tiers, user.division, record.division)) throw new Error("This case is outside your assignment authority.");
  if (record.assignedAttorneyId !== expectedAssignedAttorneyId) throw new Error("This case assignment changed while you were reviewing it. Refresh and try again.");
  if (assignee && assignee.division !== record.division) throw new Error("Choose an eligible attorney in the case division.");
  const restrictToGroup = session.user.tiers.includes("senior_assistant_district_attorney") && !hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) && record.division === "Criminal Division";
  if (assignee && restrictToGroup && assignee.divisionGroup !== user.divisionGroup) throw new Error("Choose an attorney in your Criminal Division group.");
  const eligibleAttorneys = await getDivisionCaseAssignees(record.division, { divisionGroup: restrictToGroup ? user.divisionGroup : record.divisionGroup, restrictToGroup });
  if (assignee && !eligibleAttorneys.some((attorney) => attorney.id === assignee.id)) throw new Error("That attorney is not on the active eligible roster.");
  if (assignee && requiresCriminalAssigneeGroup(record.division, true, record.assignedAttorneyId, assignee.id) && record.division === "Criminal Division" && !assignee.divisionGroup && !hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN)) throw new Error("Assign the attorney to a Criminal Division group first.");

  await prisma.$transaction(async (tx) => {
    const updated = await tx.case.updateMany({
      where: { id: record.id, assignedAttorneyId: expectedAssignedAttorneyId },
      data: { assignedAttorneyId: assignee?.id ?? null, divisionGroup: record.division === "Criminal Division" ? (assignee?.divisionGroup ?? record.divisionGroup) : null },
    });
    if (!updated.count) throw new Error("This case assignment changed while you were reviewing it. Refresh and try again.");
    await tx.caseComment.create({ data: { caseId, isSystem: true, body: `Assignment changed from ${record.assignedAttorney?.displayName ?? "Unassigned"} to ${assignee?.displayName ?? "Unassigned"} by ${session.user.displayName}.` } });
  });
  if (assignee && assignee.id !== user.id) await notify({ userId: assignee.id, type: "case_assigned", title: `You were assigned to ${record.caseNumber}`, body: record.title, link: `/dashboard/cases/${record.id}` });
  await logActivity(session.user.displayName, assignee ? `Assigned case to ${assignee.displayName}` : "Unassigned case for reassignment", "Case", record.caseNumber);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cases");
  revalidatePath("/dashboard/workload");
  revalidatePath(`/dashboard/cases/${record.id}`);
}
