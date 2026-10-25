"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { canAccessCase, canEditCase, localUser } from "@/lib/case-access";
import { CASE_AI_ACTIONS, CASE_AI_PROMPT_VERSION, CASE_AI_SOURCE_BUNDLE_VERSION, buildCaseAiSources, caseAiSourceHash, createCaseAiResult, type CaseAiAction } from "@/lib/case-ai-workbench";
import { getConfiguredGroqModel } from "@/lib/ai-model";
import { logActivity } from "@/lib/activity-log";
import { parseDateTimeInTimeZone } from "@/lib/time-zone";
import { getDocumentTemplate } from "@/config/document-templates";

const MAX_TITLE = 180;
const SAFE_EVIDENCE_KINDS = new Set(["DOCUMENT", "TEXT_RECORD", "COURT_TRANSCRIPT", "PHOTOGRAPH", "VIDEO", "OTHER"]);
const SAFE_EVENT_KINDS = new Set(["COURT_HEARING", "COURT_DEADLINE", "OFFICE_TARGET", "OTHER"]);
const READINESS_TASKS: Record<string, { title: string; details: string }> = {
  "witness-availability": { title: "Confirm witness availability and attendance", details: "Confirm each listed witness can attend and record any scheduling issue." },
  "exhibits": { title: "Review and prepare exhibits", details: "Check the exhibit list, source links, and any foundation or disclosure issues." },
  "filings": { title: "Confirm required filings and service", details: "Check required filings, portal review status, court filing dates, and service records." },
  "motions": { title: "Review pending motions and response dates", details: "Identify pending motions, response deadlines, and any hearing dates." },
};

async function requireCaseEditor(caseId: string) {
  const session = await auth();
  if (!session?.user?.providerUserId || !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW)) throw new Error("Forbidden");
  const user = await localUser(session.user);
  const caseRecord = user ? await prisma.case.findUnique({ where: { id: caseId } }) : null;
  if (!user || !caseRecord || !canAccessCase(session.user.tiers, user.id, caseRecord, user.division, user.divisionGroup)) throw new Error("Case not found or not accessible");
  if (!canEditCase(session.user.tiers, user.division, caseRecord.division)) throw new Error("Case edit permission is required");
  return { session, user, caseRecord };
}

function safeUrl(value: string) {
  const url = value.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) && url.length <= 2000 ? parsed.toString() : null;
  } catch { return null; }
}

export async function addCaseEvidence(formData: FormData) {
  const caseId = String(formData.get("caseId") ?? "").trim();
  const { session, user } = await requireCaseEditor(caseId);
  const title = String(formData.get("title") ?? "").trim().slice(0, MAX_TITLE);
  const kind = String(formData.get("kind") ?? "DOCUMENT");
  const sourceName = String(formData.get("sourceName") ?? "").trim().slice(0, 180);
  const sourceUrlRaw = String(formData.get("sourceUrl") ?? "").trim();
  const sourceUrl = safeUrl(sourceUrlRaw);
  const transcriptUpload = formData.get("transcriptFile");
  if (transcriptUpload && typeof transcriptUpload !== "string" && transcriptUpload.size > 2_000_000) throw new Error("Transcript text files must be 2 MB or smaller.");
  if (transcriptUpload && typeof transcriptUpload !== "string" && transcriptUpload.size > 0 && (!/\.txt$/i.test(transcriptUpload.name) || (transcriptUpload.type && transcriptUpload.type !== "text/plain"))) throw new Error("Import a plain-text .txt transcript only.");
  const importedTranscript = transcriptUpload && typeof transcriptUpload !== "string" ? await transcriptUpload.text() : "";
  if (importedTranscript.length > 50_000) throw new Error("Transcript text must be 50,000 characters or fewer.");
  const fileName = (String(formData.get("fileName") ?? "").trim() || (transcriptUpload && typeof transcriptUpload !== "string" ? transcriptUpload.name : "")).replace(/[\r\n"\\/]/g, "_").slice(0, 180);
  const sha256Raw = String(formData.get("sha256") ?? "").trim().toLowerCase();
  const notesInput = String(formData.get("notes") ?? "").trim();
  const notes = [notesInput, importedTranscript.trim()].filter(Boolean).join("\n\n");
  const confirmCaseAssociation = formData.get("confirmCaseAssociation") === "on";
  const receivedAtRaw = String(formData.get("receivedAt") ?? "").trim();
  const receivedAt = receivedAtRaw ? new Date(`${receivedAtRaw}T12:00:00`) : new Date();
  if (!title || !SAFE_EVIDENCE_KINDS.has(kind) || !Number.isFinite(receivedAt.getTime()) || notes.length > 50_000 || (sourceUrlRaw && !sourceUrl) || (sha256Raw && !/^[a-f0-9]{64}$/.test(sha256Raw)) || !confirmCaseAssociation) throw new Error("Confirm that this source belongs on the selected case, then check the evidence details and try again.");

  await prisma.caseEvidence.create({ data: { caseId, title, kind, sourceName, sourceUrl, fileName: fileName || null, sha256: sha256Raw || null, receivedAt, notes, createdById: user.id, createdByName: session.user.displayName } });
  await prisma.caseComment.create({ data: { caseId, isSystem: true, body: `Evidence inventory updated: ${title} (${kind.replaceAll("_", " ")}). Case association confirmed by ${session.user.displayName}.` } });
  await logActivity(session.user.displayName, "Added evidence inventory entry", "Case", caseId);
  revalidatePath(`/dashboard/cases/${caseId}/workbench`);
  revalidatePath(`/dashboard/cases/${caseId}`);
}

export async function addCaseEvent(formData: FormData) {
  const caseId = String(formData.get("caseId") ?? "").trim();
  const { session, user } = await requireCaseEditor(caseId);
  const title = String(formData.get("title") ?? "").trim().slice(0, MAX_TITLE);
  const kind = String(formData.get("kind") ?? "OTHER");
  const startsAtRaw = String(formData.get("startsAt") ?? "").trim();
  const startsAt = startsAtRaw ? parseDateTimeInTimeZone(startsAtRaw, "America/New_York") ?? new Date(NaN) : new Date(NaN);
  const endsAtRaw = String(formData.get("endsAt") ?? "").trim();
  const endsAt = endsAtRaw ? parseDateTimeInTimeZone(endsAtRaw, "America/New_York") ?? new Date(NaN) : null;
  const sourceUrlRaw = String(formData.get("sourceUrl") ?? "").trim();
  const sourceUrl = safeUrl(sourceUrlRaw);
  const details = String(formData.get("details") ?? "").trim().slice(0, 4000);
  const isCourtOrdered = formData.get("isCourtOrdered") === "on";
  if (!title || !SAFE_EVENT_KINDS.has(kind) || !Number.isFinite(startsAt.getTime()) || (endsAt && !Number.isFinite(endsAt.getTime())) || (sourceUrlRaw && !sourceUrl)) throw new Error("Check the event details and try again.");

  await prisma.caseEvent.create({ data: { caseId, title, kind, startsAt, endsAt, isCourtOrdered, details, sourceUrl, createdById: user.id, createdByName: session.user.displayName } });
  await prisma.caseComment.create({ data: { caseId, isSystem: true, body: `Calendar event added: ${title} (${isCourtOrdered ? "court-ordered" : "office target"}).` } });
  await logActivity(session.user.displayName, "Added case calendar event", "Case", caseId);
  revalidatePath(`/dashboard/cases/${caseId}/workbench`);
  revalidatePath("/dashboard/cases/calendar");
  revalidatePath(`/dashboard/cases/${caseId}`);
}

export async function addAcceptedCaseTask(formData: FormData) {
  const caseId = String(formData.get("caseId") ?? "").trim();
  const { session, user, caseRecord } = await requireCaseEditor(caseId);
  const title = String(formData.get("title") ?? "").trim().slice(0, MAX_TITLE);
  const details = String(formData.get("details") ?? "").trim().slice(0, 1500);
  const sourceReference = String(formData.get("sourceReference") ?? "").trim().slice(0, 500);
  const assigneeId = String(formData.get("assigneeId") ?? "").trim();
  const assignee = assigneeId ? await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true, displayName: true, division: true } }) : null;
  if (!title || !assignee || assignee.division !== caseRecord.division) throw new Error("Choose an eligible attorney in this case division.");
  await prisma.caseTask.create({ data: { caseId, title, details, sourceReference, status: "OPEN", assignedToId: assignee.id, assignedToName: assignee.displayName, createdById: user.id, createdByName: session.user.displayName } });
  await logActivity(session.user.displayName, "Accepted and assigned case task", "Case", caseId);
  revalidatePath(`/dashboard/cases/${caseId}/workbench`);
  revalidatePath(`/dashboard/cases/${caseId}/readiness`);
}

export async function addReadinessTask(formData: FormData) {
  const caseId = String(formData.get("caseId") ?? "").trim();
  const key = String(formData.get("key") ?? "").trim();
  const task = READINESS_TASKS[key];
  if (!task) throw new Error("Choose a valid readiness check.");
  const { session, user } = await requireCaseEditor(caseId);
  const existing = await prisma.caseTask.findFirst({ where: { caseId, sourceReference: `readiness:${key}`, status: { in: ["OPEN", "DONE"] } }, select: { id: true } });
  if (!existing) {
    await prisma.caseTask.create({ data: { caseId, title: task.title, details: task.details, sourceReference: `readiness:${key}`, status: "OPEN", createdById: user.id, createdByName: session.user.displayName } });
    await prisma.caseComment.create({ data: { caseId, isSystem: true, body: `Court readiness check added: ${task.title}. Added by ${session.user.displayName}.` } });
    await logActivity(session.user.displayName, "Added court readiness check", "Case", caseId);
  }
  revalidatePath(`/dashboard/cases/${caseId}/readiness`);
  revalidatePath(`/dashboard/cases/${caseId}/workbench`);
}

export async function updateCaseTask(formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "").trim();
  const status = String(formData.get("status") ?? "");
  if (!taskId || !["DONE", "DISMISSED", "OPEN"].includes(status)) throw new Error("Invalid task update.");
  const task = await prisma.caseTask.findUnique({ where: { id: taskId }, select: { id: true, caseId: true } });
  if (!task) throw new Error("Task not found.");
  const { session, user } = await requireCaseEditor(task.caseId);
  await prisma.caseTask.update({ where: { id: taskId }, data: { status } });
  await logActivity(session.user.displayName, `Updated case task to ${status.toLowerCase()}`, "Case", task.caseId);
  revalidatePath(`/dashboard/cases/${task.caseId}/workbench`);
  revalidatePath(`/dashboard/cases/${task.caseId}/readiness`);
}

async function processAiRun(runId: string, action: CaseAiAction, sources: Awaited<ReturnType<typeof buildCaseAiSources>>, modelId: string) {
  const run = await prisma.caseAiRun.findUnique({ where: { id: runId }, select: { status: true, caseId: true } });
  if (!run || run.status !== "QUEUED") return;
  const startedAt = Date.now();
  await prisma.caseAiRun.update({ where: { id: runId }, data: { status: "RUNNING", startedAt: new Date(startedAt) } });
  try {
    const generated = await createCaseAiResult(action, sources, modelId);
    await prisma.caseAiRun.update({ where: { id: runId }, data: { status: "COMPLETED", resultJson: JSON.stringify(generated.result), latencyMs: Date.now() - startedAt, inputTokens: generated.inputTokens ?? null, outputTokens: generated.outputTokens ?? null, completedAt: new Date() } });
  } catch (error) {
    const code = error instanceof Error && ["MISSING_API_KEY", "INVALID_MODEL_OUTPUT"].includes(error.message) ? error.message : "MODEL_UNAVAILABLE";
    await prisma.caseAiRun.update({ where: { id: runId }, data: { status: "FAILED", failureCode: code, latencyMs: Date.now() - startedAt, completedAt: new Date() } });
  }
  revalidatePath(`/dashboard/cases/${run.caseId}/workbench`);
}

export async function requestCaseAiRun(formData: FormData) {
  const caseId = String(formData.get("caseId") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim() as CaseAiAction;
  const { session, user } = await requireCaseEditor(caseId);
  if (!CASE_AI_ACTIONS.includes(action)) throw new Error("Choose a supported AI workbench action.");
  const templateId = String(formData.get("templateId") ?? "").trim();
  if (action === "DRAFT_DOCUMENT" && !getDocumentTemplate(templateId)) throw new Error("Choose a current office template before requesting a draft.");
  const sources = await buildCaseAiSources(caseId, action, templateId || undefined);
  const sourceHash = caseAiSourceHash(sources);
  const modelId = await getConfiguredGroqModel();
  const cached = await prisma.caseAiRun.findFirst({ where: { caseId, action, sourceHash, modelId, promptVersion: CASE_AI_PROMPT_VERSION, status: "COMPLETED" }, orderBy: { completedAt: "desc" }, select: { resultJson: true } });
  const run = await prisma.caseAiRun.create({ data: {
    caseId,
    requestedById: user.id,
    requestedByName: session.user.displayName,
    action,
    status: cached ? "COMPLETED" : "QUEUED",
    modelId,
    promptVersion: CASE_AI_PROMPT_VERSION,
    sourceBundleVersion: CASE_AI_SOURCE_BUNDLE_VERSION,
    sourceHash,
    cacheHit: Boolean(cached),
    ...(cached ? { resultJson: cached.resultJson, completedAt: new Date() } : {}),
  }, select: { id: true } });
  if (!cached) after(() => processAiRun(run.id, action, sources, modelId));
  await logActivity(session.user.displayName, `Requested text-only AI ${action.toLowerCase().replaceAll("_", " ")}${cached ? " (cached)" : ""}`, "Case", caseId);
  revalidatePath(`/dashboard/cases/${caseId}/workbench`);
}

export async function recordCaseAiFeedback(formData: FormData) {
  const runId = String(formData.get("runId") ?? "").trim();
  const feedback = String(formData.get("feedback") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim().slice(0, 1500);
  if (!runId || !["HELPFUL", "NEEDS_CORRECTION"].includes(feedback)) throw new Error("Choose a feedback option.");
  const run = await prisma.caseAiRun.findUnique({ where: { id: runId }, select: { id: true, caseId: true, status: true } });
  if (!run || run.status !== "COMPLETED") throw new Error("Completed AI result not found.");
  const { session, user } = await requireCaseEditor(run.caseId);
  await prisma.caseAiRun.update({ where: { id: runId }, data: { reviewerFeedback: feedback, reviewerNote: note, reviewedById: user.id, reviewedAt: new Date() } });
  await logActivity(session.user.displayName, `Recorded AI result feedback: ${feedback.toLowerCase()}`, "Case", run.caseId);
  revalidatePath(`/dashboard/cases/${run.caseId}/workbench`);
}
