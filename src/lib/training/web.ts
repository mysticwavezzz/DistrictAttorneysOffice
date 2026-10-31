import "server-only";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { isAssignableAttorneyRank } from "@/lib/case-assignees";
import { effectiveRosterRank } from "@/lib/staff-rank-control";
import { BANK_VERSION, canStartMock, gradeMock, gradePhase, nextQuestion } from "./offline/engine";
import { TRAINING_PHASES, TRAINING_SOURCES } from "./offline/course";
import { PILOT_MOCK_CASES } from "./offline/mock-case";
import type { MockCase, PhaseId, PhaseResult, Question } from "./offline/types";

export async function requireTrainee(robloxUserId: string) {
  const roster = await prisma.rosterEntry.findUnique({ where: { robloxUserId } });
  if (!roster?.isActive || !roster.isProsecutorInTraining || roster.unit !== "Criminal Division" || !isAssignableAttorneyRank(effectiveRosterRank(roster.rank, roster.rankOverride))) {
    throw new Error("This account is not currently enrolled in the Criminal Division course.");
  }
  const user = await prisma.user.findUnique({ where: { robloxUserId } });
  if (!user) throw new Error("Your staff account is not linked yet. Sign out and back in, then try again.");
  return { roster, user };
}

export async function getActiveAttempt(userId: string) {
  return prisma.trainingAttempt.findUnique({ where: { activeForUserId: userId } });
}

export async function ensureAttempt(userId: string) {
  const attempt = await prisma.trainingAttempt.upsert({
    where: { activeForUserId: userId },
    create: { userId, activeForUserId: userId, status: "IN_PROGRESS", currentPhase: 1, bankVersion: BANK_VERSION },
    update: {},
  });
  if (attempt.bankVersion !== BANK_VERSION && attempt.status !== "COMPLETED") {
    return prisma.trainingAttempt.update({
      where: { id: attempt.id },
      data: { status: "IN_PROGRESS", currentPhase: 1, phaseAnswersJson: "{}", phaseResultsJson: "[]", mockCaseId: null, mockCaseVersion: null, mockCaseSnapshotJson: null, mockSeed: null, mockAnswersJson: "{}", mockResultJson: null, bankVersion: BANK_VERSION },
    });
  }
  return attempt;
}

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function publicQuestion(question: Question) {
  return {
    id: question.id,
    competency: question.competency,
    prompt: question.prompt,
    facts: question.facts,
    sourceIds: question.sourceIds,
    choices: question.choices.map(({ id, text }) => ({ id, text })),
  };
}

function sourceVersions(sourceIds: string[]) {
  const sources = new Map(TRAINING_SOURCES.map((source) => [source.id, source]));
  return Object.fromEntries(sourceIds.flatMap((id) => {
    const source = sources.get(id);
    return source ? [[id, { url: source.url, section: source.section, checkedOn: source.checkedOn }]] : [];
  }));
}

function chooseMockCase(seed: number, excludeId?: string): MockCase {
  const available = excludeId ? PILOT_MOCK_CASES.filter((item) => item.id !== excludeId) : PILOT_MOCK_CASES;
  return available[seed % available.length]!;
}

export async function getTrainingSnapshot(userId: string) {
  const activeAttempt = await ensureAttempt(userId);
  const phaseAnswers = parseJson<Record<string, Record<string, string>>>(activeAttempt.phaseAnswersJson, {});
  const phaseResults = parseJson<PhaseResult[]>(activeAttempt.phaseResultsJson, []);
  const sources = new Map(TRAINING_SOURCES.map((source) => [source.id, source]));
  if (activeAttempt.status === "PLACEMENT_PENDING") {
    return {
      status: "PLACEMENT_PENDING" as const,
      phaseResults,
      result: parseJson(activeAttempt.mockResultJson ?? "{}", null),
      pleaDisposition: PILOT_MOCK_CASES.find((item) => item.id === activeAttempt.mockCaseId)?.pleaDisposition ?? null,
      needsSupervisorReview: activeAttempt.needsSupervisorReview,
      mockFailures: activeAttempt.mockFailures,
    };
  }
  if (activeAttempt.status === "MOCK" && activeAttempt.mockCaseId) {
    const mockCase = PILOT_MOCK_CASES.find((item) => item.id === activeAttempt.mockCaseId);
    if (!mockCase) throw new Error("The assigned mock case is no longer in the current training bank.");
    const answers = parseJson<Record<string, string>>(activeAttempt.mockAnswersJson, {});
    const question = nextQuestion(mockCase.questions, answers);
    const result = question ? null : gradeMock(mockCase, answers, phaseResults);
    return {
      status: "MOCK" as const,
      phaseResults,
      mockFailures: activeAttempt.mockFailures,
      needsSupervisorReview: activeAttempt.needsSupervisorReview,
      case: { title: mockCase.title, packet: mockCase.packet, sourceIds: mockCase.sourceIds, sources: mockCase.sourceIds.map((id) => sources.get(id)).filter(Boolean), pleaDisposition: mockCase.pleaDisposition ?? null },
      question: question ? publicQuestion(question) : null,
      result,
    };
  }
  const phaseId = Math.min(3, Math.max(1, activeAttempt.currentPhase)) as PhaseId;
  const phase = TRAINING_PHASES[phaseId - 1]!;
  const answers = phaseAnswers[String(phaseId)] ?? {};
  const question = nextQuestion(phase.questions, answers);
  const phaseResult = question ? null : gradePhase(phase, answers);
  return {
    status: "IN_PROGRESS" as const,
    currentPhase: phaseId,
    phaseResults,
    phase: {
      id: phase.id,
      title: phase.title,
      lessons: phase.lessons.map((lesson) => ({ ...lesson, sources: lesson.sourceIds.map((id) => sources.get(id)).filter(Boolean) })),
      sources: [...new Set(phase.questions.flatMap((item) => item.sourceIds))].map((id) => sources.get(id)).filter(Boolean),
    },
    question: question ? publicQuestion(question) : null,
    result: phaseResult,
  };
}

export async function recordTrainingAnswer(userId: string, body: { phaseId?: number; questionId?: string; choiceId?: string; action?: string }) {
  const attempt = await ensureAttempt(userId);
  if (body.action === "retry-phase") {
    if (attempt.status !== "IN_PROGRESS") throw new Error("No phase is awaiting a retry.");
    const phaseAnswers = parseJson<Record<string, Record<string, string>>>(attempt.phaseAnswersJson, {});
    delete phaseAnswers[String(attempt.currentPhase)];
    await prisma.trainingAttempt.update({ where: { id: attempt.id }, data: { phaseAnswersJson: JSON.stringify(phaseAnswers) } });
    return getTrainingSnapshot(userId);
  }
  if (body.action === "retry-mock") {
    if (attempt.status !== "MOCK") throw new Error("No mock trial is awaiting a retry.");
    const mockSeed = randomInt(1, 2_147_483_647);
    const mockCase = chooseMockCase(mockSeed, attempt.mockCaseId ?? undefined);
    const caseSnapshot = { id: mockCase.id, version: mockCase.version, title: mockCase.title, packet: mockCase.packet, sourceIds: mockCase.sourceIds, sourceVersions: sourceVersions(mockCase.sourceIds) };
    await prisma.trainingAttempt.update({ where: { id: attempt.id }, data: { mockAnswersJson: "{}", mockResultJson: null, mockCaseId: mockCase.id, mockCaseVersion: mockCase.version, mockCaseSnapshotJson: JSON.stringify(caseSnapshot), mockSeed, bankVersion: BANK_VERSION } });
    return getTrainingSnapshot(userId);
  }
  if (!body.questionId || !body.choiceId) throw new Error("Select an answer first.");
  if (attempt.status === "IN_PROGRESS") {
  const phaseId = Math.min(3, Math.max(1, attempt.currentPhase)) as PhaseId;
    if (body.phaseId !== phaseId) throw new Error("The submitted course phase is out of date.");
    const phase = TRAINING_PHASES[phaseId - 1]!;
    const allPhaseAnswers = parseJson<Record<string, Record<string, string>>>(attempt.phaseAnswersJson, {});
    const answers = allPhaseAnswers[String(phaseId)] ?? {};
    const question = nextQuestion(phase.questions, answers);
    if (!question || question.id !== body.questionId || !question.choices.some((choice) => choice.id === body.choiceId)) throw new Error("That question is not the next available decision.");
    answers[question.id] = body.choiceId;
    allPhaseAnswers[String(phaseId)] = answers;
    const result = nextQuestion(phase.questions, answers) ? null : gradePhase(phase, answers);
    const decisionLog = parseJson<Array<Record<string, unknown>>>(attempt.decisionLogJson, []);
    decisionLog.push({ stage: `phase-${phaseId}`, bankVersion: BANK_VERSION, questionId: question.id, prompt: question.prompt, facts: question.facts ?? null, presentedChoices: question.choices.map(({ id, text }) => ({ id, text })), choiceId: body.choiceId, choiceText: question.choices.find((choice) => choice.id === body.choiceId)?.text, sourceIds: question.sourceIds, sourceVersions: sourceVersions(question.sourceIds), submittedAt: new Date().toISOString() });
    const phaseResults = parseJson<PhaseResult[]>(attempt.phaseResultsJson, []).filter((item) => item.phaseId !== phaseId);
    if (result?.passed) phaseResults.push(result);
    if (result?.passed && phaseId === 3) {
      if (!canStartMock(phaseResults)) throw new Error("All three course phases must pass before the mock trial.");
      const mockSeed = randomInt(1, 2_147_483_647);
      const mockCase = chooseMockCase(mockSeed);
      const caseSnapshot = { id: mockCase.id, version: mockCase.version, title: mockCase.title, packet: mockCase.packet, sourceIds: mockCase.sourceIds, sourceVersions: sourceVersions(mockCase.sourceIds) };
      await prisma.trainingAttempt.update({ where: { id: attempt.id }, data: { status: "MOCK", phaseAnswersJson: JSON.stringify(allPhaseAnswers), phaseResultsJson: JSON.stringify(phaseResults), mockCaseId: mockCase.id, mockCaseVersion: mockCase.version, mockCaseSnapshotJson: JSON.stringify(caseSnapshot), mockSeed, bankVersion: BANK_VERSION, mockAnswersJson: "{}", decisionLogJson: JSON.stringify(decisionLog) } });
    } else if (result?.passed) {
      await prisma.trainingAttempt.update({ where: { id: attempt.id }, data: { currentPhase: phaseId + 1, phaseAnswersJson: JSON.stringify(allPhaseAnswers), phaseResultsJson: JSON.stringify(phaseResults), decisionLogJson: JSON.stringify(decisionLog) } });
    } else {
      await prisma.trainingAttempt.update({ where: { id: attempt.id }, data: { phaseAnswersJson: JSON.stringify(allPhaseAnswers), decisionLogJson: JSON.stringify(decisionLog) } });
    }
    return { snapshot: await getTrainingSnapshot(userId), submitted: { questionId: question.id, selectedChoiceId: body.choiceId, feedback: question.choices.find((choice) => choice.id === body.choiceId)?.explanation, result } };
  }
  if (attempt.status === "MOCK" && attempt.mockCaseId) {
    const mockCase = PILOT_MOCK_CASES.find((item) => item.id === attempt.mockCaseId);
    if (!mockCase) throw new Error("Assigned mock trial unavailable.");
    const answers = parseJson<Record<string, string>>(attempt.mockAnswersJson, {});
    const question = nextQuestion(mockCase.questions, answers);
    if (!question || question.id !== body.questionId || !question.choices.some((choice) => choice.id === body.choiceId)) throw new Error("That is not the next available trial decision.");
    answers[question.id] = body.choiceId;
    const next = nextQuestion(mockCase.questions, answers);
    const phaseResults = parseJson<PhaseResult[]>(attempt.phaseResultsJson, []);
    const result = next ? null : gradeMock(mockCase, answers, phaseResults);
    const decisionLog = parseJson<Array<Record<string, unknown>>>(attempt.decisionLogJson, []);
    decisionLog.push({ stage: "mock", trialNumber: attempt.mockFailures + 1, bankVersion: BANK_VERSION, caseId: mockCase.id, caseVersion: mockCase.version, questionId: question.id, prompt: question.prompt, facts: question.facts ?? null, presentedChoices: question.choices.map(({ id, text }) => ({ id, text })), choiceId: body.choiceId, choiceText: question.choices.find((choice) => choice.id === body.choiceId)?.text, sourceIds: question.sourceIds, sourceVersions: sourceVersions(question.sourceIds), submittedAt: new Date().toISOString() });
    await prisma.trainingAttempt.update({ where: { id: attempt.id }, data: { mockAnswersJson: JSON.stringify(answers), decisionLogJson: JSON.stringify(decisionLog), ...(result ? { mockResultJson: JSON.stringify(result) } : {}) } });
    if (result?.passed) {
      const placement = await completeTraining(userId, attempt.id, result);
      return { snapshot: placement, submitted: { questionId: question.id, selectedChoiceId: body.choiceId, feedback: question.choices.find((choice) => choice.id === body.choiceId)?.explanation, result } };
    }
    if (result && !result.passed) {
      const failures = attempt.mockFailures + 1;
      await prisma.trainingAttempt.update({ where: { id: attempt.id }, data: { mockFailures: failures, needsSupervisorReview: failures >= 2 } });
    }
    return { snapshot: await getTrainingSnapshot(userId), submitted: { questionId: question.id, selectedChoiceId: body.choiceId, feedback: question.choices.find((choice) => choice.id === body.choiceId)?.explanation, result } };
  }
  throw new Error("The course attempt is not accepting answers.");
}

async function completeTraining(userId: string, attemptId: string, result: NonNullable<ReturnType<typeof gradeMock>>) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { robloxUserId: true } });
  if (!user?.robloxUserId) throw new Error("Trainee account is not linked to a Roblox identity.");
  const roster = await prisma.rosterEntry.findUnique({ where: { robloxUserId: user.robloxUserId } });
  if (!roster?.isActive || !roster.isProsecutorInTraining || roster.unit !== "Criminal Division") throw new Error("The roster training flag changed before graduation could be recorded.");
  const groups = ["1", "2"] as const;
  const [members, cases, lastPlacement] = await Promise.all([
    prisma.rosterEntry.findMany({ where: { isActive: true, unit: "Criminal Division", divisionGroup: { in: [...groups] } }, select: { rank: true, divisionGroup: true } }),
    prisma.case.findMany({ where: { division: "Criminal Division", divisionGroup: { in: [...groups] }, archived: false, isDraft: false, closedOn: null }, select: { divisionGroup: true, initialFilingDue: true, discDue: true, pretrial: true } }),
    prisma.trainingAttempt.findFirst({ where: { status: "COMPLETED", placedGroup: { in: [...groups] } }, orderBy: { completedAt: "desc" }, select: { placedGroup: true } }),
  ]);
  const today = new Date();
  const soon = new Date(today.getTime() + 7 * 24 * 60 * 60_000);
  const eligible = groups.map((divisionGroup) => {
    const groupMembers = members.filter((member) => member.divisionGroup === divisionGroup);
    const supervised = groupMembers.some((member) => ["Senior Assistant District Attorney", "Supervisory Assistant District Attorney", "Chief Assistant District Attorney", "Deputy District Attorney", "District Attorney"].includes(member.rank ?? ""));
    const activeCases = cases.filter((item) => item.divisionGroup === divisionGroup);
    const upcoming = activeCases.filter((item) => [item.initialFilingDue, item.discDue, item.pretrial].some((date) => date && date >= today && date <= soon)).length;
    return { divisionGroup, supervised, score: groupMembers.filter((member) => isAssignableAttorneyRank(member.rank)).length * 3 + activeCases.length * 2 + upcoming * 2 };
  }).filter((item) => item.supervised);
  const chosen = eligible.sort((a, b) => a.score - b.score);
  if (!chosen.length) {
    await prisma.trainingAttempt.update({ where: { id: attemptId }, data: { status: "PLACEMENT_PENDING", mockResultJson: JSON.stringify(result) } });
    await prisma.rosterEntry.update({ where: { id: roster.id }, data: { trainingPlacementStatus: "PLACEMENT_PENDING" } });
    await prisma.activityLog.create({ data: { actorName: "Criminal Division Training System", action: "passed final mock trial; placement pending supervisor group", targetType: "roster entry", targetLabel: roster.name } });
    return { status: "PLACEMENT_PENDING" as const, result, pleaDisposition: PILOT_MOCK_CASES.find((item) => item.id === result.caseId)?.pleaDisposition ?? null, needsSupervisorReview: false };
  }
  if (chosen.length > 1 && chosen[0]!.score === chosen[1]!.score && lastPlacement?.placedGroup) {
    chosen.sort((a, b) => (a.divisionGroup === lastPlacement.placedGroup ? 1 : 0) - (b.divisionGroup === lastPlacement.placedGroup ? 1 : 0));
  }
  const divisionGroup = chosen[0]!.divisionGroup;
  const nextRankOverride = roster.robloxSynced && !roster.rankOverride && roster.rank !== "Assistant District Attorney" ? "Assistant District Attorney" : null;
  const rankNeedsReview = Boolean(roster.rankOverride && roster.rankOverride !== "Assistant District Attorney") || (!roster.robloxSynced && roster.rank !== "Assistant District Attorney");
  await prisma.$transaction([
    prisma.trainingAttempt.update({ where: { id: attemptId }, data: { status: "COMPLETED", activeForUserId: null, completedAt: new Date(), placedGroup: divisionGroup, mockResultJson: JSON.stringify(result) } }),
    prisma.rosterEntry.update({ where: { id: roster.id }, data: { isProsecutorInTraining: false, divisionGroup, onboardingRoute: "TRAINING", trainingPlacementStatus: rankNeedsReview ? "PLACED_RANK_REVIEW" : "PLACED", trainingGraduatedAt: new Date(), orientationPending: true, ...(nextRankOverride ? { rankOverride: nextRankOverride, trainingAutoRankOverride: true } : {}) } }),
    prisma.user.update({ where: { id: userId }, data: { division: "Criminal Division", divisionGroup } }),
    prisma.activityLog.create({ data: { actorName: "Criminal Division Training System", action: "passed final mock trial and placed in group; orientation required", targetType: "roster entry", targetLabel: `${roster.name} · Group ${divisionGroup}` } }),
  ]);
  return { status: "COMPLETED" as const, completedAt: new Date().toISOString(), divisionGroup, result, pleaDisposition: PILOT_MOCK_CASES.find((item) => item.id === result.caseId)?.pleaDisposition ?? null };
}

export function getCourseSourceLink(id: string) { return TRAINING_SOURCES.find((item) => item.id === id) ?? null; }
export function getCourseBankVersion() { return BANK_VERSION; }
