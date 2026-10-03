"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { caseInputSchema, emptyToNull, toDate } from "@/lib/validation/case";
import { caseFilingSchema, caseCommentSchema } from "@/lib/validation/case-extras";
import { localUser, canAccessCase, generateCaseNumber, canAssignCase, canEditCase } from "@/lib/case-access";
import { notify, notifyMany, userIdsWithCapability } from "@/lib/notifications";
import { readCasePdf } from "@/lib/filing-upload";
import { getProceduralDeadlines } from "@/lib/procedural-deadlines";
import { runWithActionDebug } from "@/lib/action-debug";

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.providerUserId) throw new Error("Forbidden");
  const user = await localUser(session.user);
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

async function createCaseImpl(formData: FormData) {
  const { session, user } = await requireStaff();
  const canSubmit = hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE) || hasCapability(session.user.tiers, CAPABILITIES.CASES_PROPOSE_EDIT);
  if (!canSubmit) {
    throw new Error("Forbidden");
  }

  const parsed = caseInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid case data");
  const data = parsed.data;
  const canAssign = canAssignCase(session.user.tiers, user.division);
  const canApproveOpening = hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS);
  const partyRows = formData.getAll("partyName").map((value, index) => ({ name: String(value).trim(), role: String(formData.getAll("partyRole")[index] ?? "") })).filter((party) => party.name);
  if (!partyRows.length || partyRows.length > 20) throw new Error("Add at least one party and no more than 20.");
  const allowedPartyRoles = new Set(["Defendant", "Co-defendant", "Witness", "Reporting officer", "Other"]);
  const parties = partyRows.map(({ name, role }) => {
    if (name.length > 100 || !allowedPartyRoles.has(role)) throw new Error("Check the party names and roles.");
    return { name, role };
  });
  const pdf = await readCasePdf(formData.get("initialPdf"));
  const filingTitle = String(formData.get("initialFilingTitle") ?? "").trim().slice(0, 200);
  const reviseRequestId = emptyToNull(String(formData.get("reviseRequestId") ?? ""));
  type PreviousFiling = { title?: string; url?: string | null; pdfData?: string; pdfFileName?: string };
  let previousRequest: Awaited<ReturnType<typeof prisma.caseActionRequest.findUnique>> = null;
  let previousFiling: PreviousFiling | null = null;
  if (reviseRequestId) {
    previousRequest = await prisma.caseActionRequest.findUnique({ where: { id: reviseRequestId } });
    if (!previousRequest || previousRequest.kind !== "CREATE" || previousRequest.status !== "REJECTED" || previousRequest.requestedById !== user.id) {
      throw new Error("This rejected case opening cannot be revised by this account.");
    }
    try {
      const priorData = JSON.parse(previousRequest.proposedData) as Record<string, unknown>;
      const candidate = priorData.initialFiling;
      if (candidate && typeof candidate === "object" && "pdfData" in candidate) previousFiling = candidate as PreviousFiling;
    } catch {
      throw new Error("The rejected submission could not be loaded. Contact a reviewer.");
    }
  }
  const initialFiling = pdf
    ? { title: filingTitle || pdf.pdfFileName, url: null, ...pdf }
    : previousFiling
      ? { ...previousFiling, title: filingTitle || previousFiling.title || "Initial Filing" }
      : null;
  const relatedIds = await resolveRelatedCaseIds(formData.get("relatedCaseNumbers"));

  const proposedData = {
    ...data,
    assignedJudge: data.assignedJudge ?? "",
    assignedAttorneyId: canAssign ? emptyToNull(data.assignedAttorneyId) ?? user.id : user.id,
    division: user.division,
    partyDetails: JSON.stringify(parties),
    initialFiling,
    relatedCaseNumbers: String(formData.get("relatedCaseNumbers") ?? ""),
  };

  if (!canApproveOpening || reviseRequestId) {
    if (reviseRequestId) {
      const updated = await prisma.caseActionRequest.updateMany({
        where: { id: reviseRequestId, kind: "CREATE", status: "REJECTED", requestedById: user.id },
        data: { proposedData: JSON.stringify(proposedData), division: user.division, status: "PENDING", reviewedById: null, reviewNote: null, reviewedAt: null, createdAt: new Date() },
      });
      if (updated.count !== 1) throw new Error("This submission was already revised or is no longer available.");
    } else {
      await prisma.caseActionRequest.create({
        data: { kind: "CREATE", division: user.division, proposedData: JSON.stringify(proposedData), requestedById: user.id },
      });
    }
    const [globalReviewerIds, divisionReviewerIds] = await Promise.all([
      userIdsWithCapability(CAPABILITIES.CASES_APPROVE_EDITS),
      userIdsWithCapability(CAPABILITIES.CASES_APPROVE_DIVISION),
    ]);
    const divisionReviewers = user.division ? await prisma.user.findMany({ where: { id: { in: divisionReviewerIds }, division: user.division }, select: { id: true } }) : [];
    const reviewerIds = Array.from(new Set([...globalReviewerIds, ...divisionReviewers.map((reviewer) => reviewer.id)]));
    await notifyMany(reviewerIds.filter((id) => id !== user.id), {
      type: "case_request",
      title: "New case opening needs review",
      body: `${data.title}${initialFiling ? ` · document: ${initialFiling.title}` : ""}`,
      link: "/dashboard/cases/requests?status=pending",
    });
    await notify({
      userId: user.id,
      type: "case_request",
      title: reviseRequestId ? "Revised case opening submitted for review" : "Case opening submitted for review",
      body: data.title,
      link: "/dashboard/cases/requests",
    });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/cases/requests");
    redirect("/dashboard?caseSubmitted=review");
  }

  const caseNumber = emptyToNull(data.caseNumber) ?? (await generateCaseNumber());
  const created = await prisma.$transaction(async (tx) => {
    const caseRecord = await tx.case.create({
      data: {
      title: data.title,
      caseNumber,
      type: emptyToNull(data.type),
      stage: emptyToNull(data.stage),
      assignedJudge: emptyToNull(data.assignedJudge),
      partyDetails: JSON.stringify(parties),
      disclosures: emptyToNull(data.disclosures),
      discGiven: toDate(data.discGiven),
      discDue: toDate(data.discDue),
      pretrial: toDate(data.pretrial),
      otherDates: emptyToNull(data.otherDates),
      outcome: emptyToNull(data.outcome),
      closedOn: toDate(data.closedOn),
      appealBy: toDate(data.appealBy),
      arraignmentAt: toDate(data.arraignmentAt),
      proofOfServiceAt: toDate(data.proofOfServiceAt),
      discoveryOrderAt: toDate(data.discoveryOrderAt),
      discoveryRequestedAt: toDate(data.discoveryRequestedAt),
      motionServedAt: toDate(data.motionServedAt),
      verdictAt: toDate(data.verdictAt),
      sentenceAt: toDate(data.sentenceAt),
      finalJudgmentAt: toDate(data.finalJudgmentAt),
      summary: emptyToNull(data.summary) ?? "",
      assignedAttorneyId: canAssign ? emptyToNull(data.assignedAttorneyId) ?? user.id : user.id,
      division: user.division,
      createdById: user.id,
      relatedTo: relatedIds.length > 0 ? { connect: relatedIds.map((id) => ({ id })) } : undefined,
      },
    });
    if (initialFiling) {
      await tx.caseFiling.create({
        data: { caseId: caseRecord.id, title: initialFiling.title, url: initialFiling.url, pdfData: initialFiling.pdfData, pdfFileName: initialFiling.pdfFileName, addedById: user.id },
      });
    }
    return caseRecord;
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
  revalidatePath("/dashboard/filings");
  redirect(`/dashboard/cases/${created.id}`);
}

async function updateCaseImpl(formData: FormData) {
  const { session, user } = await requireStaff();

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing case id");

  const existing = await prisma.case.findUnique({ where: { id } });
  if (!existing) throw new Error("Case not found");
  if (!canAccessCase(session.user.tiers, user.id, existing, user.division) || !canEditCase(session.user.tiers, user.division, existing.division)) {
    throw new Error("Forbidden");
  }

  const parsed = caseInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid case data");
  const data = parsed.data;

  const canAssign = canAssignCase(session.user.tiers, user.division, existing.division);
  const requestedAssigneeId = canAssign ? emptyToNull(data.assignedAttorneyId) : existing.assignedAttorneyId;
  const requestedAssignee = requestedAssigneeId ? await prisma.user.findUnique({ where: { id: requestedAssigneeId }, select: { id: true, division: true } }) : null;
  if (requestedAssigneeId && (!requestedAssignee || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) && requestedAssignee.division !== user.division))) throw new Error("Invalid assignee");
  const nextAssignee = requestedAssigneeId;
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
      assignedJudge: emptyToNull(data.assignedJudge),
      disclosures: emptyToNull(data.disclosures),
      discGiven: toDate(data.discGiven),
      discDue: toDate(data.discDue),
      pretrial: toDate(data.pretrial),
      otherDates: emptyToNull(data.otherDates),
      outcome: emptyToNull(data.outcome),
      closedOn: toDate(data.closedOn),
      appealBy: toDate(data.appealBy),
      arraignmentAt: toDate(data.arraignmentAt),
      proofOfServiceAt: toDate(data.proofOfServiceAt),
      discoveryOrderAt: toDate(data.discoveryOrderAt),
      discoveryRequestedAt: toDate(data.discoveryRequestedAt),
      motionServedAt: toDate(data.motionServedAt),
      verdictAt: toDate(data.verdictAt),
      sentenceAt: toDate(data.sentenceAt),
      finalJudgmentAt: toDate(data.finalJudgmentAt),
      summary: existing.summary,
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
    const [previous, next] = await Promise.all([
      existing.assignedAttorneyId ? prisma.user.findUnique({ where: { id: existing.assignedAttorneyId }, select: { displayName: true } }) : null,
      nextAssignee ? prisma.user.findUnique({ where: { id: nextAssignee }, select: { displayName: true } }) : null,
    ]);
    systemNotes.push(`Assignment changed from ${previous?.displayName ?? "Unassigned"} to ${next?.displayName ?? "Unassigned"} by ${session.user.displayName}.`);
    if (nextAssignee) {
      if (nextAssignee !== user.id) {
        await notify({
          userId: nextAssignee,
          type: "case_assigned",
          title: `You were assigned to ${existing.caseNumber}`,
          body: existing.title,
          link: `/dashboard/cases/${id}`,
        });
      }
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

async function deleteCaseImpl(formData: FormData) {
  const { session, user } = await requireStaff();
  if (!hasCapability(session.user.tiers, CAPABILITIES.CASES_DELETE)) {
    throw new Error("Forbidden");
  }

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing case id");

  const existing = await prisma.case.findUnique({ where: { id } });
  if (!existing || !canAccessCase(session.user.tiers, user.id, existing, user.division)) throw new Error("Case not found or not accessible");
  await prisma.case.delete({ where: { id } });

  revalidatePath("/dashboard/cases");
  redirect("/dashboard/cases");
}

async function bulkUpdateCasesImpl(formData: FormData) {
  const { session, user } = await requireStaff();
  const ids = formData.getAll("caseIds").map(String).filter(Boolean).slice(0, 100);
  const operation = String(formData.get("operation") ?? "");
  if (!ids.length) throw new Error("Select at least one case");

  const canAssign = hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) || hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN_DIVISION);
  const canEdit = hasCapability(session.user.tiers, CAPABILITIES.CASES_EDIT) || hasCapability(session.user.tiers, CAPABILITIES.CASES_EDIT_DIVISION);
  if ((operation === "assign" && !canAssign) || (operation === "archive" && !canEdit)) {
    throw new Error("Forbidden");
  }
  const cases = await prisma.case.findMany({ where: { id: { in: ids } }, include: { assignedAttorney: { select: { displayName: true } } } });
  if (cases.length !== ids.length || cases.some((c) => !canAccessCase(session.user.tiers, user.id, c, user.division) || (operation === "assign" && !canAssignCase(session.user.tiers, user.division, c.division)) || (operation === "archive" && !canEditCase(session.user.tiers, user.division, c.division)))) {
    throw new Error("One or more cases are not accessible");
  }

  if (operation === "assign") {
    const assigneeId = emptyToNull(String(formData.get("assigneeId") ?? ""));
    const assigneeTarget = assigneeId ? await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true, division: true } }) : null;
    if (assigneeId && (!assigneeTarget || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) && assigneeTarget.division !== user.division))) {
      throw new Error("Invalid assignee");
    }
    const assignee = assigneeId ? await prisma.user.findUnique({ where: { id: assigneeId }, select: { displayName: true } }) : null;
    await prisma.$transaction([
      prisma.case.updateMany({ where: { id: { in: ids } }, data: { assignedAttorneyId: assigneeId } }),
      prisma.caseComment.createMany({ data: cases.map((item) => ({ caseId: item.id, body: `Assignment changed from ${item.assignedAttorney?.displayName ?? "Unassigned"} to ${assignee?.displayName ?? "Unassigned"} by ${session.user.displayName}.`, isSystem: true })) }),
    ]);
  } else if (operation === "archive") {
    await prisma.case.updateMany({ where: { id: { in: ids } }, data: { archived: true } });
  } else {
    throw new Error("Invalid bulk operation");
  }

  revalidatePath("/dashboard/cases");
}

async function saveCaseFilterImpl(formData: FormData) {
  const { user } = await requireStaff();
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const raw = String(formData.get("query") ?? "");
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  for (const key of Array.from(params.keys())) if (!["tab", "q", "status", "mine", "deadline", "review"].includes(key)) params.delete(key);
  const existing = JSON.parse(user.savedCaseFilters || "[]") as { id: string; name: string; query: string }[];
  if (!name || existing.length >= 20) throw new Error("Filter name is required; up to 20 filters may be saved.");
  existing.push({ id: crypto.randomUUID(), name, query: params.toString() });
  await prisma.user.update({ where: { id: user.id }, data: { savedCaseFilters: JSON.stringify(existing) } });
  revalidatePath("/dashboard/cases");
}

async function deleteCaseFilterImpl(formData: FormData) {
  const { user } = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const existing = JSON.parse(user.savedCaseFilters || "[]") as { id: string; name: string; query: string }[];
  await prisma.user.update({ where: { id: user.id }, data: { savedCaseFilters: JSON.stringify(existing.filter((item) => item.id !== id)) } });
  revalidatePath("/dashboard/cases");
}

async function updateDeadlineReminderStateImpl(formData: FormData) {
  const { session, user } = await requireStaff();
  if (!hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW)) throw new Error("Forbidden");
  const caseId = String(formData.get("caseId") ?? "");
  const deadlineType = String(formData.get("deadlineType") ?? "");
  const dueDateRaw = String(formData.get("dueDate") ?? "");
  const operation = String(formData.get("operation") ?? "");
  if (!deadlineType || !["acknowledge", "snooze"].includes(operation)) throw new Error("Invalid reminder action");
  const dueDate = new Date(dueDateRaw);
  if (!Number.isFinite(dueDate.getTime())) throw new Error("Invalid due date");
  const caseRecord = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseRecord || !canAccessCase(session.user.tiers, user.id, caseRecord, user.division)) throw new Error("Case not accessible");
  const currentDeadline = getProceduralDeadlines(caseRecord).find((deadline) => deadline.key === deadlineType);
  if (currentDeadline?.dueDate.getTime() !== dueDate.getTime()) throw new Error("That deadline has changed. Refresh the calendar and try again.");

  const identity = { userId: user.id, caseId, deadlineType, dueDate };
  const reminder = await prisma.deadlineReminder.upsert({ where: { userId_caseId_deadlineType_dueDate: identity }, create: identity, update: {} });
  if (operation === "acknowledge") {
    await prisma.deadlineReminder.update({ where: { id: reminder.id }, data: { acknowledgedAt: new Date(), snoozedUntil: null } });
  } else {
    const days = Number(formData.get("snoozeDays"));
    if (![1, 3, 7].includes(days)) throw new Error("Choose a valid snooze duration");
    await prisma.deadlineReminder.update({ where: { id: reminder.id }, data: { acknowledgedAt: null, snoozedUntil: new Date(Date.now() + days * 86_400_000) } });
  }
  revalidatePath("/dashboard/cases/calendar");
  revalidatePath(`/dashboard/cases/${caseId}`);
}

export async function createCase(formData: FormData) { return runWithActionDebug("createCase", [formData], () => createCaseImpl(formData)); }
export async function updateCase(formData: FormData) { return runWithActionDebug("updateCase", [formData], () => updateCaseImpl(formData)); }
export async function deleteCase(formData: FormData) { return runWithActionDebug("deleteCase", [formData], () => deleteCaseImpl(formData)); }
export async function bulkUpdateCases(formData: FormData) { return runWithActionDebug("bulkUpdateCases", [formData], () => bulkUpdateCasesImpl(formData)); }
export async function saveCaseFilter(formData: FormData) { return runWithActionDebug("saveCaseFilter", [formData], () => saveCaseFilterImpl(formData)); }
export async function deleteCaseFilter(formData: FormData) { return runWithActionDebug("deleteCaseFilter", [formData], () => deleteCaseFilterImpl(formData)); }
export async function updateDeadlineReminderState(formData: FormData) { return runWithActionDebug("updateDeadlineReminderState", [formData], () => updateDeadlineReminderStateImpl(formData)); }
export async function addFiling(formData: FormData) { return runWithActionDebug("addFiling", [formData], () => addFilingImpl(formData)); }
export async function deleteFiling(formData: FormData) { return runWithActionDebug("deleteFiling", [formData], () => deleteFilingImpl(formData)); }
export async function addComment(formData: FormData) { return runWithActionDebug("addComment", [formData], () => addCommentImpl(formData)); }

async function addFilingImpl(formData: FormData) {
  const { session, user } = await requireStaff();
  const caseId = String(formData.get("caseId") ?? "");
  const existing = await prisma.case.findUnique({ where: { id: caseId } });
  if (!existing) throw new Error("Case not found");
  if (!canAccessCase(session.user.tiers, user.id, existing, user.division) || !canEditCase(session.user.tiers, user.division, existing.division)) throw new Error("Forbidden");

  const parsed = caseFilingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid filing");

  const pdf = await readCasePdf(formData.get("pdf"));
  if (!pdf) throw new Error("Upload a PDF to file this document.");

  await prisma.caseFiling.create({
    data: { caseId, title: parsed.data.title, url: null, pdfData: pdf.pdfData, pdfFileName: pdf.pdfFileName, addedById: user.id },
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
  revalidatePath("/dashboard/filings");
  if (String(formData.get("returnTo") ?? "") === "filings") redirect("/dashboard/filings");
  redirect(`/dashboard/cases/${caseId}#filings`);
}

async function deleteFilingImpl(formData: FormData) {
  const { session, user } = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const filing = await prisma.caseFiling.findUnique({ where: { id }, include: { case: true } });
  if (!filing) throw new Error("Filing not found");
  if (!canAccessCase(session.user.tiers, user.id, filing.case, user.division) || !canEditCase(session.user.tiers, user.division, filing.case.division)) throw new Error("Forbidden");

  await prisma.caseFiling.delete({ where: { id } });
  revalidatePath(`/dashboard/cases/${filing.caseId}`);
}

async function addCommentImpl(formData: FormData) {
  const { session, user } = await requireStaff();
  const caseId = String(formData.get("caseId") ?? "");
  const existing = await prisma.case.findUnique({ where: { id: caseId } });
  if (!existing) throw new Error("Case not found");
  if (!canAccessCase(session.user.tiers, user.id, existing, user.division)) throw new Error("Forbidden");

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
