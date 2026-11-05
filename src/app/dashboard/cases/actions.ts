"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { caseInputSchema, emptyToNull, toDate } from "@/lib/validation/case";
import { caseFilingSchema, caseCommentSchema } from "@/lib/validation/case-extras";
import { localUser, canAccessCase, generateCaseNumber, canAssignCase, canEditCase, requiresCriminalAssigneeGroup } from "@/lib/case-access";
import { requiresCriminalDivisionGroupForCaseCreation } from "@/lib/criminal-case-assignment";
import { notify, notifyMany, userIdsWithCapability } from "@/lib/notifications";
import { readCasePdf, decodeCasePdf } from "@/lib/filing-upload";
import { extractPdfText } from "@/lib/pdf-text";
import { runWithActionDebug } from "@/lib/action-debug";
import { shouldRequireFilingApproval } from "@/lib/filing-approval";
import { logActivity } from "@/lib/activity-log";
import { automaticallyAssignCase } from "@/lib/automatic-case-assignment";

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
  const canCreate = hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE);
  const intakeTicketId = String(formData.get("intakeTicketId") ?? "").trim();
  let intakeTicket: { id: string; subject: string; aopcs: { documentType: string; title: string; pdfData: string | null; pdfFileName: string | null }[] } | null = null;
  if (intakeTicketId) {
    if (!canCreate || user.division !== "Criminal Division" || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN_DIVISION) && !hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN))) throw new Error("A Criminal Division supervisor with case assignment authority must open a case from investigator intake.");
    intakeTicket = await prisma.contactTicket.findFirst({ where: { id: intakeTicketId, category: "INVESTIGATOR_INTAKE", intakeStatus: "APPROVED", linkedCaseId: null }, select: { id: true, subject: true, aopcs: { where: { status: "ACCEPTED" }, orderBy: { createdAt: "asc" }, select: { documentType: true, title: true, pdfData: true, pdfFileName: true } } } });
    if (!intakeTicket || intakeTicket.aopcs.length === 0) throw new Error("This investigator intake is not approved or has already been converted.");
  }
  let assignedAttorneyId = canAssign ? emptyToNull(data.assignedAttorneyId) : null;
  let assignmentReason = "Manually selected by authorized case opener.";
  if (!assignedAttorneyId) {
    const automatic = await automaticallyAssignCase({
      division: user.division,
      divisionGroup: user.divisionGroup,
      restrictToGroup: session.user.tiers.includes("senior_assistant_district_attorney") && !hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN),
      type: data.type,
      stage: data.stage,
    });
    assignedAttorneyId = automatic.attorney.id;
    assignmentReason = `Automatically assigned to ${automatic.attorney.displayName} by workload: ${automatic.reason}.`;
  }
  const assignedAttorney = assignedAttorneyId ? await prisma.user.findUnique({ where: { id: assignedAttorneyId }, select: { id: true, division: true, divisionGroup: true } }) : null;
  if (assignedAttorneyId && (!assignedAttorney || (assignedAttorneyId !== user.id && assignedAttorney.division !== user.division))) throw new Error("Choose an attorney in your division.");
  if (assignedAttorneyId && session.user.tiers.includes("senior_assistant_district_attorney") && !hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) && assignedAttorney?.divisionGroup !== user.divisionGroup) throw new Error("You can only assign cases to attorneys in your Criminal Division group.");
  const caseGroup = user.division === "Criminal Division" ? assignedAttorney?.divisionGroup ?? user.divisionGroup : null;
  if (requiresCriminalDivisionGroupForCaseCreation(session.user.tiers, user.division) && !caseGroup && !hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN)) throw new Error("Assign the submitting attorney or selected attorney to Criminal Division Group 1 or 2 first.");
  const partyRows = formData.getAll("partyName").map((value, index) => ({ name: String(value).trim(), role: String(formData.getAll("partyRole")[index] ?? "") })).filter((party) => party.name);
  if (!partyRows.length || partyRows.length > 20) throw new Error("Add at least one party and no more than 20.");
  const allowedPartyRoles = new Set(["Defendant", "Co-defendant", "Witness", "Reporting officer", "Other"]);
  const parties = partyRows.map(({ name, role }) => {
    if (name.length > 100 || !allowedPartyRoles.has(role)) throw new Error("Check the party names and roles.");
    return { name, role };
  });
  const uploadedOpeningFiling = await readCasePdf(formData.get("openingFilingPdf") ?? formData.get("criminalInformationPdf"));
  const openingFilingTitle = String(formData.get("openingFilingTitle") ?? formData.get("criminalInformationTitle") ?? "").trim().slice(0, 200);
  const uploadedAopc = await readCasePdf(formData.get("aopcPdf"));
  const aopcTitle = String(formData.get("aopcTitle") ?? "").trim().slice(0, 200);
  const approvedAopc = intakeTicket?.aopcs.find((document) => document.documentType === "AOPC" && document.pdfData);
  let previousOpeningFiling: { title?: string; pdfData?: string; pdfFileName?: string } | null = null;
  let previousAopc: { title?: string; pdfData?: string; pdfFileName?: string } | null = null;
  const reviseRequestId = emptyToNull(String(formData.get("reviseRequestId") ?? ""));
  let previousRequest: Awaited<ReturnType<typeof prisma.caseActionRequest.findUnique>> = null;
  if (reviseRequestId) {
    previousRequest = await prisma.caseActionRequest.findUnique({ where: { id: reviseRequestId } });
    if (!previousRequest || previousRequest.kind !== "CREATE" || previousRequest.status !== "REJECTED" || previousRequest.requestedById !== user.id) {
      throw new Error("This rejected case opening cannot be revised by this account.");
    }
    try {
      const priorData = JSON.parse(previousRequest.proposedData) as Record<string, unknown>;
      const openingCandidate = priorData.openingFiling ?? priorData.criminalInformation ?? priorData.initialFiling;
      const aopcCandidate = priorData.aopcFiling;
      if (openingCandidate && typeof openingCandidate === "object" && "pdfData" in openingCandidate) previousOpeningFiling = openingCandidate as { title?: string; pdfData?: string; pdfFileName?: string };
      if (aopcCandidate && typeof aopcCandidate === "object" && "pdfData" in aopcCandidate) previousAopc = aopcCandidate as { title?: string; pdfData?: string; pdfFileName?: string };
    } catch {
      throw new Error("The rejected submission could not be loaded. Contact a reviewer.");
    }
  }
  const openingFilingPdf = uploadedOpeningFiling ?? previousOpeningFiling;
  const aopcPdf = approvedAopc?.pdfData
    ? { title: approvedAopc.title, pdfData: approvedAopc.pdfData, pdfFileName: approvedAopc.pdfFileName ?? "Affidavit of Probable Cause.pdf" }
    : uploadedAopc ?? previousAopc;
  const requiresCriminalDocuments = user.division === "Criminal Division";
  if (requiresCriminalDocuments && !aopcPdf?.pdfData) throw new Error("A separate AOPC PDF is required before a Criminal Division case can open. An investigative report cannot replace it.");
  const openingFiling = openingFilingPdf?.pdfData ? { title: openingFilingTitle || previousOpeningFiling?.title || "Initial Filing", url: null, ...openingFilingPdf } : null;
  const aopcFiling = aopcPdf?.pdfData ? { title: aopcTitle || approvedAopc?.title || previousAopc?.title || "Affidavit of Probable Cause (AOPC)", url: null, ...aopcPdf } : null;
  const relatedIds = await resolveRelatedCaseIds(formData.get("relatedCaseNumbers"));

  const proposedData = {
    ...data,
    assignedJudge: data.assignedJudge ?? "",
    assignedAttorneyId,
    division: user.division,
    divisionGroup: caseGroup,
    partyDetails: JSON.stringify(parties),
    openingFiling,
    aopcFiling,
    relatedCaseNumbers: String(formData.get("relatedCaseNumbers") ?? ""),
  };

  if (!canCreate || reviseRequestId) {
    if (reviseRequestId) {
      const updated = await prisma.caseActionRequest.updateMany({
        where: { id: reviseRequestId, kind: "CREATE", status: "REJECTED", requestedById: user.id },
        data: { proposedData: JSON.stringify(proposedData), division: user.division, divisionGroup: caseGroup, status: "PENDING", reviewedById: null, reviewNote: null, reviewedAt: null, createdAt: new Date() },
      });
      if (updated.count !== 1) throw new Error("This submission was already revised or is no longer available.");
    } else {
      await prisma.caseActionRequest.create({
        data: { kind: "CREATE", division: user.division, divisionGroup: caseGroup, proposedData: JSON.stringify(proposedData), requestedById: user.id },
      });
    }
    const [globalReviewerIds, divisionReviewerIds] = await Promise.all([
      userIdsWithCapability(CAPABILITIES.CASES_APPROVE_EDITS),
      userIdsWithCapability(CAPABILITIES.CASES_APPROVE_DIVISION),
    ]);
    const divisionReviewers = user.division ? await prisma.user.findMany({ where: { id: { in: divisionReviewerIds }, division: user.division, ...(user.division === "Criminal Division" ? { OR: [{ divisionGroup: caseGroup }, { tiers: { contains: "chief_assistant_district_attorney" } }] } : {}) }, select: { id: true } }) : [];
    const reviewerIds = Array.from(new Set([...globalReviewerIds, ...divisionReviewers.map((reviewer) => reviewer.id)]));
    await notifyMany(reviewerIds.filter((id) => id !== user.id), {
      type: "case_request",
      title: "New case opening needs review",
      body: `${data.title} · Opening filing and AOPC attached`,
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
      initialFilingDue: toDate(data.initialFilingDue),
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
      assignedAttorneyId,
      division: user.division,
      divisionGroup: caseGroup,
      createdById: user.id,
      relatedTo: relatedIds.length > 0 ? { connect: relatedIds.map((id) => ({ id })) } : undefined,
      },
    });
    const openingFilings = [
      ...(openingFiling ? [{ caseId: caseRecord.id, title: openingFiling.title, url: openingFiling.url, pdfData: openingFiling.pdfData, pdfFileName: openingFiling.pdfFileName, addedById: user.id, status: "DRAFT", isInitial: true, documentType: "OTHER" }] : []),
      ...(aopcFiling ? [{ caseId: caseRecord.id, title: aopcFiling.title, url: aopcFiling.url, pdfData: aopcFiling.pdfData, pdfFileName: aopcFiling.pdfFileName, addedById: user.id, status: approvedAopc?.pdfData ? "ACCEPTED" : "DRAFT", isInitial: false, documentType: "AOPC" }] : []),
    ];
    if (openingFilings.length) await tx.caseFiling.createMany({ data: openingFilings });
    if (intakeTicket) {
      const converted = await tx.contactTicket.updateMany({ where: { id: intakeTicket.id, intakeStatus: "APPROVED", linkedCaseId: null }, data: { linkedCaseId: caseRecord.id, intakeStatus: "CONVERTED", updatedAt: new Date() } });
      if (!converted.count) throw new Error("This investigator intake was already converted. Refresh and review the case list.");
      await tx.aopc.updateMany({ where: { intakeTicketId: intakeTicket.id, status: "ACCEPTED" }, data: { linkedCaseId: caseRecord.id } });
      await tx.contactMessage.create({ data: { ticketId: intakeTicket.id, authorId: user.id, body: `This intake was opened as ${caseRecord.caseNumber}. The case record is unfiled until the charging document is filed with the court.` } });
    }
      await tx.caseComment.create({ data: { caseId: caseRecord.id, body: `Case opened as an unfiled staff record by ${session.user.displayName}. ${assignmentReason}`, isSystem: true } });
    return caseRecord;
  });

  await logActivity(session.user.displayName, `Opened case${assignmentReason.startsWith("Automatically") ? " and auto assigned" : ""}`, "Case", `${created.caseNumber} · ${created.title}`);

  if (created.assignedAttorneyId && created.assignedAttorneyId !== user.id) {
    try {
      await notify({
        userId: created.assignedAttorneyId,
        type: "case_assigned",
        title: `You were assigned to ${created.caseNumber}`,
        body: created.title,
        link: `/dashboard/cases/${created.id}`,
      });
    } catch (error) {
      console.error(`[case creation ${created.id}] Case saved, but assignment notification failed.`, error);
    }
  }

  revalidatePath("/dashboard/cases");
  revalidatePath("/dashboard/filings");
  if (intakeTicket) {
    revalidatePath(`/investigator/intake/tickets/${intakeTicket.id}`);
    revalidatePath(`/dashboard/intake/tickets/${intakeTicket.id}`);
  }
  redirect(`/dashboard/cases/${created.id}`);
}

async function fileCaseImpl(formData: FormData) {
  const { session, user } = await requireStaff();
  const id = String(formData.get("caseId") ?? "");
  if (!id) throw new Error("Missing case id");
  const caseRecord = await prisma.case.findUnique({ where: { id }, include: { filings: { where: { isInitial: true }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, pdfFileName: true, status: true, isInitial: true } } } });
  const canFileThisCase = Boolean(caseRecord && canEditCase(session.user.tiers, user.division, caseRecord.division))
    || Boolean(caseRecord && hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE) && caseRecord.createdById === user.id);
  if (!caseRecord || !canAccessCase(session.user.tiers, user.id, caseRecord, user.division, user.divisionGroup) || !canFileThisCase) throw new Error("Case not accessible");
  const legacyWindowStart = new Date(caseRecord.createdAt.getTime() - 120_000);
  const legacyWindowEnd = new Date(caseRecord.createdAt.getTime() + 120_000);
  const legacyInitialAccepted = !caseRecord.filings.some((filing) => filing.isInitial)
    ? await prisma.caseFiling.findFirst({ where: { caseId: id, status: "ACCEPTED", isInitial: false, documentType: { not: "AOPC" }, createdAt: { gte: legacyWindowStart, lte: legacyWindowEnd } }, select: { id: true } })
    : null;
  if (caseRecord.courtFiledAt || caseRecord.filings.some((filing) => filing.isInitial && filing.status === "ACCEPTED") || legacyInitialAccepted) throw new Error("This case has already been filed with the court.");
  if (caseRecord.filings.some((filing) => filing.status === "PENDING")) throw new Error("The initial filing is already awaiting review.");

  const draftFiling = caseRecord.filings.find((filing) => filing.status === "DRAFT");
  const sourceFilingId = String(formData.get("sourceFilingId") ?? "").trim();
  if (!sourceFilingId) throw new Error("Choose a PDF filing already attached to this case.");
  const sourceFiling = await prisma.caseFiling.findFirst({
    where: {
      id: sourceFilingId,
      caseId: id,
      pdfData: { not: null },
      OR: [{ status: "ACCEPTED" }, { isInitial: true, status: { in: ["DRAFT", "REJECTED"] } }],
    },
    select: { id: true, title: true, pdfData: true, pdfFileName: true, status: true },
  });
  if (!sourceFiling?.pdfData) throw new Error("That PDF filing is not available on this case. Refresh and choose an attached PDF.");
  const title = String(formData.get("initialFilingTitle") ?? "").trim().slice(0, 200) || sourceFiling.title;
  const needsApproval = shouldRequireFilingApproval(session.user.tiers, caseRecord.division);
  const nextStatus = needsApproval ? "PENDING" : "ACCEPTED";
  const submittedAt = new Date();
  const filedAt = null;
  const reviewedAt = needsApproval ? null : submittedAt;

  await prisma.$transaction(async (tx) => {
    const activeInitial = await tx.caseFiling.findFirst({ where: { caseId: id, isInitial: true, status: { in: ["PENDING", "ACCEPTED"] } }, select: { id: true } });
    if (activeInitial) throw new Error("The initial case filing was already submitted or filed. Refresh the case before retrying.");
    if (sourceFiling.status === "DRAFT" && draftFiling?.id === sourceFiling.id) {
      const claimed = await tx.caseFiling.updateMany({
        where: { id: draftFiling.id, status: "DRAFT" },
        data: { title, status: nextStatus, reviewedById: needsApproval ? null : user.id, reviewedAt, submittedAt, filedAt, courtFilingUrl: null },
      });
      if (!claimed.count) throw new Error("This opening filing was already submitted. Refresh the case before retrying.");
    } else {
      await tx.caseFiling.create({
        data: { caseId: id, title, pdfData: sourceFiling.pdfData, pdfFileName: sourceFiling.pdfFileName, addedById: user.id, status: nextStatus, isInitial: true, reviewedById: needsApproval ? null : user.id, reviewedAt, submittedAt, filedAt, courtFilingUrl: null },
      });
    }
    await tx.case.update({ where: { id }, data: { updatedAt: new Date() } });
    await tx.caseComment.create({ data: {
      caseId: id,
      body: needsApproval ? `Opening filing submitted for portal review by ${session.user.displayName}.` : `Opening filing approved for court filing by ${session.user.displayName}. Mark it filed in court after it is filed.`,
      isSystem: true,
    } });
  });

  try {
    if (needsApproval) {
      const [globalReviewerIds, divisionReviewerIds] = await Promise.all([
        userIdsWithCapability(CAPABILITIES.CASES_APPROVE_EDITS),
        userIdsWithCapability(CAPABILITIES.CASES_APPROVE_DIVISION),
      ]);
      const divisionReviewers = caseRecord.division ? await prisma.user.findMany({ where: { id: { in: divisionReviewerIds }, division: caseRecord.division, ...(caseRecord.division === "Criminal Division" ? { OR: [{ divisionGroup: caseRecord.divisionGroup }, { tiers: { contains: "chief_assistant_district_attorney" } }] } : {}) }, select: { id: true } }) : [];
      await notifyMany(Array.from(new Set([...globalReviewerIds, ...divisionReviewers.map((reviewer) => reviewer.id)])).filter((reviewerId) => reviewerId !== user.id), {
        type: "case_filing",
        title: "Opening filing needs review",
        body: `${caseRecord.caseNumber} · ${caseRecord.title}`,
        link: "/dashboard/review?type=filing",
      });
      await notify({ userId: user.id, type: "case_filing", title: "Case filing submitted for review", body: `${caseRecord.caseNumber} · ${caseRecord.title}`, link: `/dashboard/cases/${id}#court-filing` });
    } else if (caseRecord.assignedAttorneyId && caseRecord.assignedAttorneyId !== user.id) {
      await notify({ userId: caseRecord.assignedAttorneyId, type: "case_filing", title: `Opening filing ready to file: ${caseRecord.caseNumber}`, body: caseRecord.title, link: `/dashboard/cases/${id}#court-filing` });
    }
  } catch (error) {
    console.error(`[case filing ${id}] Filing saved, but notification delivery failed`, error);
  }

  revalidatePath("/dashboard/review");
  revalidatePath("/dashboard/cases");
  revalidatePath(`/dashboard/cases/${id}`);
  redirect(`/dashboard/cases/${id}#court-filing`);
}

async function recordCourtFilingImpl(formData: FormData) {
  const { session, user } = await requireStaff();
  const id = String(formData.get("caseId") ?? "").trim();
  if (!id) throw new Error("Missing case id.");
  const caseRecord = await prisma.case.findUnique({ where: { id }, include: { filings: { where: { isInitial: true, status: "ACCEPTED" }, select: { id: true }, take: 1 } } });
  const mayRecord = Boolean(caseRecord && canEditCase(session.user.tiers, user.division, caseRecord.division))
    || Boolean(caseRecord && hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE) && caseRecord.createdById === user.id);
  if (!caseRecord || !canAccessCase(session.user.tiers, user.id, caseRecord, user.division, user.divisionGroup) || !mayRecord) throw new Error("Case not accessible.");
  if (caseRecord.courtFiledAt) throw new Error("The court filing is already recorded.");
  if (!caseRecord.filings.length) throw new Error("The opening filing must be approved in the portal before recording its court filing.");
  const initialFiling = caseRecord.filings[0];
  if (!initialFiling) throw new Error("The approved opening filing could not be loaded. Refresh this case.");
  const courtFiledAt = new Date();
  await prisma.$transaction(async (tx) => {
    const update = await tx.case.updateMany({ where: { id, courtFiledAt: null }, data: { courtFiledAt, initialFilingDue: null, updatedAt: courtFiledAt } });
    if (!update.count) throw new Error("The court filing was recorded by another staff member. Refresh this case.");
    const filingUpdate = await tx.caseFiling.updateMany({ where: { id: initialFiling.id, status: "ACCEPTED", filedAt: null }, data: { filedAt: courtFiledAt } });
    if (!filingUpdate.count) throw new Error("The initial filing record changed. Refresh this case and check the timeline.");
    await tx.caseComment.create({ data: { caseId: id, isSystem: true, body: `Opening filing marked filed in court on ${courtFiledAt.toLocaleString("en-US", { timeZone: "America/New_York" })} by ${session.user.displayName}.` } });
  });
  await logActivity(session.user.displayName, "Marked opening filing filed in court", "Case", caseRecord.caseNumber);
  revalidatePath("/dashboard/cases");
  revalidatePath("/dashboard/search");
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard/cases/calendar");
  revalidatePath(`/dashboard/cases/${id}`);
  redirect(`/dashboard/cases/${id}#court-filing`);
}

async function recordAdditionalCourtFilingImpl(formData: FormData) {
  const { session, user } = await requireStaff();
  const filingId = String(formData.get("filingId") ?? "").trim();
  const filing = filingId ? await prisma.caseFiling.findUnique({ where: { id: filingId }, include: { case: true } }) : null;
  const mayRecord = Boolean(filing && canEditCase(session.user.tiers, user.division, filing.case.division))
    || Boolean(filing && hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE) && filing.case.createdById === user.id);
  if (!filing || filing.status !== "ACCEPTED" || !canAccessCase(session.user.tiers, user.id, filing.case, user.division, user.divisionGroup) || !mayRecord) throw new Error("This filing is outside your court-filing authority.");
  if (filing.filedAt || (filing.isInitial && filing.case.courtFiledAt)) throw new Error("The court filing date is already recorded.");
  const filedAt = new Date();

  await prisma.$transaction(async (tx) => {
    const updated = await tx.caseFiling.updateMany({ where: { id: filing.id, status: "ACCEPTED", filedAt: null }, data: { filedAt } });
    if (!updated.count) throw new Error("This filing was updated by another staff member. Refresh and check the timeline.");
    if (filing.isInitial) {
      const caseUpdated = await tx.case.updateMany({ where: { id: filing.caseId, courtFiledAt: null }, data: { courtFiledAt: filedAt, initialFilingDue: null, updatedAt: filedAt } });
      if (!caseUpdated.count) throw new Error("The initial court filing was recorded by another staff member. Refresh this case.");
    } else {
      await tx.case.update({ where: { id: filing.caseId }, data: { updatedAt: new Date() } });
    }
    await tx.caseComment.create({ data: { caseId: filing.caseId, isSystem: true, body: `${filing.isInitial ? "Initial complaint" : `Filing “${filing.title}”`} marked filed in court on ${filedAt.toLocaleString("en-US", { timeZone: "America/New_York" })} by ${session.user.displayName}.` } });
  });

  await logActivity(session.user.displayName, `Marked ${filing.isInitial ? "initial complaint" : `“${filing.title}”`} filed in court`, "Case", filing.case.caseNumber);
  revalidatePath("/dashboard/cases");
  revalidatePath("/dashboard/filings");
  revalidatePath("/dashboard/cases/calendar");
  revalidatePath(`/dashboard/cases/${filing.caseId}`);
  redirect(`/dashboard/cases/${filing.caseId}#filing-${filing.id}`);
}

async function updateCaseImpl(formData: FormData) {
  const { session, user } = await requireStaff();

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing case id");

  const existing = await prisma.case.findUnique({ where: { id } });
  if (!existing) throw new Error("Case not found");
  if (!canAccessCase(session.user.tiers, user.id, existing, user.division, user.divisionGroup) || !canEditCase(session.user.tiers, user.division, existing.division)) {
    throw new Error("Forbidden");
  }

  const parsed = caseInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid case data");
  const data = parsed.data;

  const canAssign = canAssignCase(session.user.tiers, user.division, existing.division);
  const requestedAssigneeId = canAssign ? emptyToNull(data.assignedAttorneyId) : existing.assignedAttorneyId;
  const requestedAssignee = requestedAssigneeId ? await prisma.user.findUnique({ where: { id: requestedAssigneeId }, select: { id: true, division: true, divisionGroup: true } }) : null;
  if (requestedAssigneeId && (!requestedAssignee || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) && requestedAssignee.division !== user.division))) throw new Error("Invalid assignee");
  if (requestedAssigneeId && session.user.tiers.includes("senior_assistant_district_attorney") && !hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) && requestedAssignee?.divisionGroup !== user.divisionGroup) throw new Error("You can only assign cases to attorneys in your Criminal Division group.");
  const chiefAssistantSelfAssignment = existing.division === "Criminal Division"
    && requestedAssigneeId === user.id
    && session.user.tiers.includes("chief_assistant_district_attorney");
  if (requiresCriminalAssigneeGroup(existing.division, canAssign, existing.assignedAttorneyId, requestedAssigneeId) && !requestedAssignee?.divisionGroup && !hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) && !chiefAssistantSelfAssignment) throw new Error("Assign the selected attorney to Criminal Division Group 1 or 2 before assigning this case.");
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
      initialFilingDue: toDate(data.initialFilingDue),
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
      divisionGroup: existing.division === "Criminal Division" ? requestedAssignee?.divisionGroup ?? (nextAssignee ? existing.divisionGroup : existing.divisionGroup) : null,
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
  if (emptyToNull(data.stage) !== existing.stage) await logActivity(session.user.displayName, `Changed case status to ${emptyToNull(data.stage) ?? "None"}`, "Case", `${caseNumber} · ${data.title}`);
  if (canAssign && nextAssignee !== existing.assignedAttorneyId) await logActivity(session.user.displayName, "Changed case assignment", "Case", `${caseNumber} · ${data.title}`);
  if (Boolean(formData.get("archived") === "on") !== existing.archived) await logActivity(session.user.displayName, formData.get("archived") === "on" ? "Archived case" : "Restored case", "Case", `${caseNumber} · ${data.title}`);

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
  if (!existing || !canAccessCase(session.user.tiers, user.id, existing, user.division, user.divisionGroup)) throw new Error("Case not found or not accessible");
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
  if (cases.length !== ids.length || cases.some((c) => !canAccessCase(session.user.tiers, user.id, c, user.division, user.divisionGroup) || (operation === "assign" && !canAssignCase(session.user.tiers, user.division, c.division)) || (operation === "archive" && !canEditCase(session.user.tiers, user.division, c.division)))) {
    throw new Error("One or more cases are not accessible");
  }

  if (operation === "assign") {
    const assigneeId = emptyToNull(String(formData.get("assigneeId") ?? ""));
    const assigneeTarget = assigneeId ? await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true, division: true, divisionGroup: true } }) : null;
    if (assigneeId && (!assigneeTarget || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) && assigneeTarget.division !== user.division))) {
      throw new Error("Invalid assignee");
    }
    if (assigneeId && session.user.tiers.includes("senior_assistant_district_attorney") && !hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN) && assigneeTarget?.divisionGroup !== user.divisionGroup) throw new Error("You can only assign cases to attorneys in your Criminal Division group.");
    if (assigneeId && cases.some((item) => item.division === "Criminal Division") && !assigneeTarget?.divisionGroup && !hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN)) throw new Error("Assign the selected attorney to Criminal Division Group 1 or 2 before assigning criminal cases.");
    const assignee = assigneeId ? await prisma.user.findUnique({ where: { id: assigneeId }, select: { displayName: true } }) : null;
    await prisma.$transaction(async (tx) => {
      for (const item of cases) await tx.case.update({ where: { id: item.id }, data: {
        assignedAttorneyId: assigneeId,
        divisionGroup: item.division === "Criminal Division" ? (assigneeTarget?.divisionGroup ?? item.divisionGroup) : null,
      } });
      await tx.caseComment.createMany({ data: cases.map((item) => ({ caseId: item.id, body: `Assignment changed from ${item.assignedAttorney?.displayName ?? "Unassigned"} to ${assignee?.displayName ?? "Unassigned"} by ${session.user.displayName}.`, isSystem: true })) });
    });
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
  for (const key of Array.from(params.keys())) if (!["tab", "q", "status", "mine", "staff", "review"].includes(key)) params.delete(key);
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

export async function createCase(formData: FormData) { return runWithActionDebug("createCase", [formData], () => createCaseImpl(formData)); }
export async function fileCase(formData: FormData) { return runWithActionDebug("fileCase", [formData], () => fileCaseImpl(formData)); }
export async function recordCourtFiling(formData: FormData) { return runWithActionDebug("recordCourtFiling", [formData], () => recordCourtFilingImpl(formData)); }
export async function recordAdditionalCourtFiling(formData: FormData) { return runWithActionDebug("recordAdditionalCourtFiling", [formData], () => recordAdditionalCourtFilingImpl(formData)); }
export async function updateCase(formData: FormData) { return runWithActionDebug("updateCase", [formData], () => updateCaseImpl(formData)); }
export async function deleteCase(formData: FormData) { return runWithActionDebug("deleteCase", [formData], () => deleteCaseImpl(formData)); }
export async function bulkUpdateCases(formData: FormData) { return runWithActionDebug("bulkUpdateCases", [formData], () => bulkUpdateCasesImpl(formData)); }
export async function saveCaseFilter(formData: FormData) { return runWithActionDebug("saveCaseFilter", [formData], () => saveCaseFilterImpl(formData)); }
export async function deleteCaseFilter(formData: FormData) { return runWithActionDebug("deleteCaseFilter", [formData], () => deleteCaseFilterImpl(formData)); }
export async function addFiling(formData: FormData) { return runWithActionDebug("addFiling", [formData], () => addFilingImpl(formData)); }
export async function deleteFiling(formData: FormData) { return runWithActionDebug("deleteFiling", [formData], () => deleteFilingImpl(formData)); }
export async function addComment(formData: FormData) { return runWithActionDebug("addComment", [formData], () => addCommentImpl(formData)); }

async function addFilingImpl(formData: FormData) {
  const { session, user } = await requireStaff();
  const caseId = String(formData.get("caseId") ?? "");
  const existing = await prisma.case.findUnique({ where: { id: caseId } });
  if (!existing) throw new Error("Case not found");
  if (!canAccessCase(session.user.tiers, user.id, existing, user.division, user.divisionGroup) || !canEditCase(session.user.tiers, user.division, existing.division)) throw new Error("Forbidden");

  const parsed = caseFilingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid filing");

  const pdf = await readCasePdf(formData.get("pdf"));
  if (!pdf) throw new Error("Upload a PDF to file this document.");

  const supersedesId = String(formData.get("supersedesId") ?? "").trim();
  const correctionNote = String(formData.get("revisionNote") ?? "").trim().slice(0, 1200);
  let revisionNote: string | null = null;
  if (supersedesId) {
    const prior = await prisma.caseFiling.findFirst({ where: { id: supersedesId, caseId, status: "REJECTED" }, select: { id: true, title: true, pdfData: true } });
    if (!prior) throw new Error("Choose a returned filing from this case.");
    if (!correctionNote) throw new Error("Explain what was corrected before submitting a replacement.");
    const nextBytes = decodeCasePdf(pdf.pdfData);
    let comparison = "Selectable-text comparison unavailable. Review both PDFs manually.";
    if (prior.pdfData) {
      try {
        const [before, after] = await Promise.all([extractPdfText(decodeCasePdf(prior.pdfData)), extractPdfText(nextBytes)]);
        const oldWords = before.pages.map((page) => page.text).join(" ").match(/\S+\s*/g) ?? [];
        const newWords = after.pages.map((page) => page.text).join(" ").match(/\S+\s*/g) ?? [];
        let prefix = 0;
        while (prefix < oldWords.length && prefix < newWords.length && oldWords[prefix] === newWords[prefix]) prefix += 1;
        let suffix = 0;
        while (suffix < oldWords.length - prefix && suffix < newWords.length - prefix && oldWords[oldWords.length - 1 - suffix] === newWords[newWords.length - 1 - suffix]) suffix += 1;
        const removed = oldWords.slice(prefix, oldWords.length - suffix).join("").trim().slice(0, 900);
        const added = newWords.slice(prefix, newWords.length - suffix).join("").trim().slice(0, 900);
        comparison = removed || added ? `Selectable-text comparison — removed: ${removed || "(none)"}; added: ${added || "(none)"}.` : "No selectable-text differences detected.";
      } catch { /* Keep the replacement and let staff compare the PDFs visually. */ }
    }
    revisionNote = `Correction note: ${correctionNote}\n${comparison}`;
  }

  const requiresApproval = shouldRequireFilingApproval(session.user.tiers, user.division);
  const submittedAt = new Date();
  await prisma.caseFiling.create({
    data: { caseId, title: parsed.data.title, url: null, pdfData: pdf.pdfData, pdfFileName: pdf.pdfFileName, addedById: user.id, status: requiresApproval ? "PENDING" : "ACCEPTED", reviewedById: requiresApproval ? null : user.id, reviewedAt: requiresApproval ? null : submittedAt, submittedAt, supersedesId: supersedesId || null, revisionNote },
  });

  try {
    if (requiresApproval) {
      const [globalReviewerIds, divisionReviewerIds] = await Promise.all([
        userIdsWithCapability(CAPABILITIES.CASES_APPROVE_EDITS),
        userIdsWithCapability(CAPABILITIES.CASES_APPROVE_DIVISION),
      ]);
      const divisionReviewers = existing.division
        ? await prisma.user.findMany({ where: { id: { in: divisionReviewerIds }, division: existing.division, ...(existing.division === "Criminal Division" ? { OR: [{ divisionGroup: existing.divisionGroup }, { tiers: { contains: "chief_assistant_district_attorney" } }] } : {}) }, select: { id: true } })
        : [];
      const reviewerIds = Array.from(new Set([...globalReviewerIds, ...divisionReviewers.map((reviewer) => reviewer.id)]));
      await notifyMany(reviewerIds.filter((id) => id !== user.id), {
        type: "case_filing_review",
        title: `Filing needs review on ${existing.caseNumber}`,
        body: parsed.data.title,
        link: "/dashboard/review?type=filing",
      });
      await notify({ userId: user.id, type: "case_filing_review", title: "Filing submitted for approval", body: `${parsed.data.title} · ${existing.caseNumber}`, link: `/dashboard/cases/${caseId}#filings` });
    } else if (existing.assignedAttorneyId && existing.assignedAttorneyId !== user.id) {
      await notify({
        userId: existing.assignedAttorneyId,
        type: "case_filing",
        title: `New filing on ${existing.caseNumber}`,
        body: parsed.data.title,
        link: `/dashboard/cases/${caseId}`,
      });
    }
  } catch (error) {
    console.error("Filing was saved, but review notification delivery failed", error);
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
  if (!canAccessCase(session.user.tiers, user.id, filing.case, user.division, user.divisionGroup)) throw new Error("Forbidden");
  if (filing.status === "PENDING" && filing.addedById !== user.id) throw new Error("Only the submitter can withdraw a filing while it is awaiting review.");
  if (filing.status !== "PENDING" && !canEditCase(session.user.tiers, user.division, filing.case.division)) throw new Error("Forbidden");

  await prisma.caseFiling.delete({ where: { id } });
  revalidatePath(`/dashboard/cases/${filing.caseId}`);
  revalidatePath("/dashboard/filings");
}

async function addCommentImpl(formData: FormData) {
  const { session, user } = await requireStaff();
  const caseId = String(formData.get("caseId") ?? "");
  const existing = await prisma.case.findUnique({ where: { id: caseId } });
  if (!existing) throw new Error("Case not found");
  if (!canAccessCase(session.user.tiers, user.id, existing, user.division, user.divisionGroup)) throw new Error("Forbidden");

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
