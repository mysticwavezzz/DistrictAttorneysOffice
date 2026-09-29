"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { caseInputSchema, emptyToNull, toDate } from "@/lib/validation/case";
import { caseFilingSchema, caseCommentSchema } from "@/lib/validation/case-extras";
import { localUser, canAccessCase, generateCaseNumber } from "@/lib/case-access";
import { notify } from "@/lib/notifications";

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.discordUserId) throw new Error("Forbidden");
  const user = await localUser(session.user.discordUserId);
  if (!user) throw new Error("Local staff record not found");
  return { session, user };
}

async function resolveRelatedCaseIds(raw: FormDataEntryValue | null, selfId?: string): Promise<string[]> {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  const numbers = text
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  if (numbers.length === 0) return [];
  const matches = await prisma.case.findMany({
    where: { caseNumber: { in: numbers } },
    select: { id: true },
  });
  return matches.map((m) => m.id).filter((id) => id !== selfId);
}

export async function createCase(formData: FormData) {
  const { session, user } = await requireStaff();
  if (!hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE)) {
    throw new Error("Forbidden");
  }

  const parsed = caseInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid case data");
  const data = parsed.data;

  const canAssign = hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN);
  const caseNumber = emptyToNull(data.caseNumber) ?? (await generateCaseNumber());
  const relatedIds = await resolveRelatedCaseIds(formData.get("relatedCaseNumbers"));

  const created = await prisma.case.create({
    data: {
      title: data.title,
      caseNumber,
      type: emptyToNull(data.type),
      stage: emptyToNull(data.stage),
      disclosures: emptyToNull(data.disclosures),
      discGiven: toDate(data.discGiven),
      discDue: toDate(data.discDue),
      pretrial: toDate(data.pretrial),
      otherDates: emptyToNull(data.otherDates),
      outcome: emptyToNull(data.outcome),
      closedOn: toDate(data.closedOn),
      appealBy: toDate(data.appealBy),
      summary: emptyToNull(data.summary) ?? "",
      assignedAttorneyId: canAssign ? emptyToNull(data.assignedAttorneyId) : user.id,
      createdById: user.id,
      isDraft: formData.get("isDraft") === "on",
      relatedTo: relatedIds.length > 0 ? { connect: relatedIds.map((id) => ({ id })) } : undefined,
    },
  });

  if (created.assignedAttorneyId && created.assignedAttorneyId !== user.id) {
    await notify({
      userId: created.assignedAttorneyId,
      type: "case_assigned",
      title: `You were assigned to ${created.caseNumber}`,
      body: created.title,
      link: `/dashboard/cases/${created.id}`,
    });
  }

  revalidatePath("/dashboard/cases");
  redirect(`/dashboard/cases/${created.id}`);
}

export async function updateCase(formData: FormData) {
  const { session, user } = await requireStaff();
  if (!hasCapability(session.user.tiers, CAPABILITIES.CASES_EDIT)) {
    throw new Error("Forbidden");
  }

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing case id");

  const existing = await prisma.case.findUnique({ where: { id } });
  if (!existing) throw new Error("Case not found");
  if (!canAccessCase(session.user.tiers, user.id, existing)) {
    throw new Error("Forbidden");
  }

  const parsed = caseInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid case data");
  const data = parsed.data;

  const canAssign = hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN);
  const nextAssignee = canAssign ? emptyToNull(data.assignedAttorneyId) : existing.assignedAttorneyId;
  const caseNumber = emptyToNull(data.caseNumber) ?? existing.caseNumber;
  const relatedIds = await resolveRelatedCaseIds(formData.get("relatedCaseNumbers"), id);
  const nextIsDraft = formData.get("isDraft") === "on";

  await prisma.case.update({
    where: { id },
    data: {
      title: data.title,
      caseNumber,
      type: emptyToNull(data.type),
      stage: emptyToNull(data.stage),
      disclosures: emptyToNull(data.disclosures),
      discGiven: toDate(data.discGiven),
      discDue: toDate(data.discDue),
      pretrial: toDate(data.pretrial),
      otherDates: emptyToNull(data.otherDates),
      outcome: emptyToNull(data.outcome),
      closedOn: toDate(data.closedOn),
      appealBy: toDate(data.appealBy),
      summary: emptyToNull(data.summary) ?? "",
      assignedAttorneyId: nextAssignee,
      archived: formData.get("archived") === "on",
      isDraft: nextIsDraft,
      relatedTo: { set: relatedIds.map((rid) => ({ id: rid })) },
    },
  });

  const systemNotes: string[] = [];
  if (emptyToNull(data.stage) !== existing.stage) {
    systemNotes.push(`Status changed to "${emptyToNull(data.stage) ?? "None"}" by ${session.user.displayName}.`);
  }
  if (existing.isDraft && !nextIsDraft) {
    systemNotes.push(`Published from draft by ${session.user.displayName}.`);
  }
  if (canAssign && nextAssignee !== existing.assignedAttorneyId) {
    if (nextAssignee) {
      const assignee = await prisma.user.findUnique({ where: { id: nextAssignee } });
      systemNotes.push(`Assigned to ${assignee?.displayName ?? "someone"} by ${session.user.displayName}.`);
      if (nextAssignee !== user.id) {
        await notify({
          userId: nextAssignee,
          type: "case_assigned",
          title: `You were assigned to ${existing.caseNumber}`,
          body: existing.title,
          link: `/dashboard/cases/${id}`,
        });
      }
    } else {
      systemNotes.push(`Unassigned by ${session.user.displayName}.`);
    }
  }
  if (systemNotes.length > 0) {
    await prisma.caseComment.createMany({
      data: systemNotes.map((body) => ({ caseId: id, body, isSystem: true })),
    });
  }

  revalidatePath("/dashboard/cases");
  revalidatePath(`/dashboard/cases/${id}`);
  redirect(`/dashboard/cases/${id}`);
}

export async function deleteCase(formData: FormData) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_DELETE)) {
    throw new Error("Forbidden");
  }

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing case id");

  await prisma.case.delete({ where: { id } });

  revalidatePath("/dashboard/cases");
  redirect("/dashboard/cases");
}

export async function bulkUpdateCases(formData: FormData) {
  const { session, user } = await requireStaff();
  const ids = formData.getAll("caseIds").map(String).filter(Boolean).slice(0, 100);
  const operation = String(formData.get("operation") ?? "");
  if (!ids.length) throw new Error("Select at least one case");

  const canAssign = hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN);
  const canEdit = hasCapability(session.user.tiers, CAPABILITIES.CASES_EDIT);
  if ((operation === "assign" && !canAssign) || (operation === "archive" && !canEdit)) {
    throw new Error("Forbidden");
  }
  const cases = await prisma.case.findMany({ where: { id: { in: ids } } });
  if (cases.length !== ids.length || cases.some((c) => !canAccessCase(session.user.tiers, user.id, c))) {
    throw new Error("One or more cases are not accessible");
  }

  if (operation === "assign") {
    const assigneeId = emptyToNull(String(formData.get("assigneeId") ?? ""));
    if (assigneeId && !(await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true } }))) {
      throw new Error("Invalid assignee");
    }
    await prisma.case.updateMany({ where: { id: { in: ids } }, data: { assignedAttorneyId: assigneeId } });
  } else if (operation === "archive") {
    await prisma.case.updateMany({ where: { id: { in: ids } }, data: { archived: true } });
  } else {
    throw new Error("Invalid bulk operation");
  }

  revalidatePath("/dashboard/cases");
}

export async function addFiling(formData: FormData) {
  const { session, user } = await requireStaff();
  const caseId = String(formData.get("caseId") ?? "");
  const existing = await prisma.case.findUnique({ where: { id: caseId } });
  if (!existing) throw new Error("Case not found");
  if (!canAccessCase(session.user.tiers, user.id, existing)) throw new Error("Forbidden");

  const parsed = caseFilingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid filing");

  await prisma.caseFiling.create({
    data: { caseId, title: parsed.data.title, url: parsed.data.url, addedById: user.id },
  });

  if (existing.assignedAttorneyId && existing.assignedAttorneyId !== user.id) {
    await notify({
      userId: existing.assignedAttorneyId,
      type: "case_filing",
      title: `New filing on ${existing.caseNumber}`,
      body: parsed.data.title,
      link: `/dashboard/cases/${caseId}`,
    });
  }

  revalidatePath(`/dashboard/cases/${caseId}`);
}

export async function deleteFiling(formData: FormData) {
  const { session, user } = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const filing = await prisma.caseFiling.findUnique({ where: { id }, include: { case: true } });
  if (!filing) throw new Error("Filing not found");
  if (!canAccessCase(session.user.tiers, user.id, filing.case)) throw new Error("Forbidden");

  await prisma.caseFiling.delete({ where: { id } });
  revalidatePath(`/dashboard/cases/${filing.caseId}`);
}

export async function addComment(formData: FormData) {
  const { session, user } = await requireStaff();
  const caseId = String(formData.get("caseId") ?? "");
  const existing = await prisma.case.findUnique({ where: { id: caseId } });
  if (!existing) throw new Error("Case not found");
  if (!canAccessCase(session.user.tiers, user.id, existing)) throw new Error("Forbidden");

  const parsed = caseCommentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid comment");

  await prisma.caseComment.create({
    data: { caseId, body: parsed.data.body, authorId: user.id },
  });

  const recipients = [existing.assignedAttorneyId, existing.createdById].filter(
    (id): id is string => Boolean(id) && id !== user.id
  );
  for (const recipientId of Array.from(new Set(recipients))) {
    await notify({
      userId: recipientId,
      type: "case_comment",
      title: `New comment on ${existing.caseNumber}`,
      body: parsed.data.body.slice(0, 140),
      link: `/dashboard/cases/${caseId}`,
    });
  }

  revalidatePath(`/dashboard/cases/${caseId}`);
}
