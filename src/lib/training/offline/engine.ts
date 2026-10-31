import type { Choice, Competency, MockCase, MockResult, PhaseId, PhaseResult, Question, TrainingPhase, TrainingSource } from "./types";

export const BANK_VERSION = "2026-10-30-course-redesign-2";
export const PHASE_PASS_PERCENT = 85;
export const MOCK_PASS_PERCENT = 85;
export const MOCK_MIN_COMPETENCY_PERCENT = 75;
const MOCK_REQUIRED_COMPETENCIES: Competency[] = ["charging", "discovery", "motions", "trial"];

export type Answers = Readonly<Record<string, string>>;

function percent(correct: number, total: number): number {
  return total ? Math.round((correct / total) * 10000) / 100 : 0;
}

function applicable(question: Question, answers: Answers): boolean {
  return !question.when || question.when.choiceIds.includes(answers[question.when.questionId] ?? "");
}

export function visibleQuestions(questions: readonly Question[], answers: Answers): Question[] {
  const visible: Question[] = [];
  for (const question of questions) {
    if (question.when && answers[question.when.questionId] === undefined) break;
    if (applicable(question, answers)) visible.push(question);
  }
  return visible;
}

export function nextQuestion(questions: readonly Question[], answers: Answers): Question | null {
  return visibleQuestions(questions, answers).find((question) => answers[question.id] === undefined) ?? null;
}

function requireComplete(questions: readonly Question[], answers: Answers): void {
  const visible = visibleQuestions(questions, answers);
  const missing = visible.find((question) => answers[question.id] === undefined);
  if (missing) throw new Error(`Missing answer for ${missing.id}`);
  const allowedIds = new Set(visible.map((question) => question.id));
  for (const [id, choiceId] of Object.entries(answers)) {
    const question = visible.find((item) => item.id === id);
    if (!allowedIds.has(id) || !question?.choices.some((choice) => choice.id === choiceId)) {
      throw new Error(`Invalid or out-of-branch answer for ${id}`);
    }
  }
}

function grade(questions: readonly Question[], answers: Answers) {
  requireComplete(questions, answers);
  const presented = visibleQuestions(questions, answers);
  const correct = presented.filter((question) => answers[question.id] === question.correctChoiceId).length;
  const criticalErrors = presented.filter((question) => question.choices.some((choice) => choice.id === answers[question.id] && choice.criticalError)).map((question) => question.id);
  return { presented, correct, total: presented.length, percent: percent(correct, presented.length), criticalErrors };
}

export function gradePhase(phase: TrainingPhase, answers: Answers): PhaseResult {
  const score = grade(phase.questions, answers);
  return { phaseId: phase.id, bankVersion: BANK_VERSION, correct: score.correct, total: score.total, percent: score.percent, criticalErrors: score.criticalErrors, passed: score.percent >= PHASE_PASS_PERCENT && score.criticalErrors.length === 0 };
}

export function canStartMock(results: readonly PhaseResult[]): boolean {
  return ([1, 2, 3] as PhaseId[]).every((id) => results.some((result) => result.phaseId === id && result.bankVersion === BANK_VERSION && result.passed));
}

export function gradeMock(mockCase: MockCase, answers: Answers, phaseResults: readonly PhaseResult[]): MockResult {
  if (!canStartMock(phaseResults)) throw new Error("All three current course phases must pass before the final mock trial");
  const score = grade(mockCase.questions, answers);
  const competencyPercent: Partial<Record<Competency, number>> = {};
  for (const competency of MOCK_REQUIRED_COMPETENCIES) {
    const questions = score.presented.filter((question) => question.competency === competency);
    competencyPercent[competency] = percent(questions.filter((question) => answers[question.id] === question.correctChoiceId).length, questions.length);
  }
  const passed = score.percent >= MOCK_PASS_PERCENT && score.criticalErrors.length === 0 && MOCK_REQUIRED_COMPETENCIES.every((item) => (competencyPercent[item] ?? 0) >= MOCK_MIN_COMPETENCY_PERCENT);
  return { caseId: mockCase.id, caseVersion: mockCase.version, correct: score.correct, total: score.total, percent: score.percent, competencyPercent, criticalErrors: score.criticalErrors, passed };
}

/** Fail authoring checks before an answer key can be served by a future website route. */
export function validateBank(sources: readonly TrainingSource[], phases: readonly TrainingPhase[], cases: readonly MockCase[]): string[] {
  const errors: string[] = [];
  const sourceIds = new Set(sources.map((source) => source.id));
  if (sourceIds.size !== sources.length) errors.push("Duplicate source ID");
  const ids = new Set<string>();
  const checkSources = (owner: string, refs: readonly string[]) => refs.forEach((id) => { if (!sourceIds.has(id)) errors.push(`${owner}: unknown source ${id}`); });
  const checkQuestion = (question: Question, previous: readonly Question[]) => {
    if (ids.has(question.id)) errors.push(`Duplicate question ID ${question.id}`);
    ids.add(question.id);
    if (question.choices.length !== 4 || new Set(question.choices.map((choice) => choice.id)).size !== 4) errors.push(`${question.id}: four distinct choices required`);
    if (!question.choices.some((choice) => choice.id === question.correctChoiceId)) errors.push(`${question.id}: correct choice missing`);
    if (question.choices.some((choice: Choice) => !choice.text.trim() || !choice.explanation.trim())) errors.push(`${question.id}: empty choice or explanation`);
    if (!question.sourceIds.length) errors.push(`${question.id}: source required`);
    checkSources(question.id, question.sourceIds);
    if (question.when && !previous.some((item) => item.id === question.when?.questionId && question.when.choiceIds.every((id) => item.choices.some((choice) => choice.id === id)))) errors.push(`${question.id}: invalid branch dependency`);
  };
  for (const phase of phases) {
    const prior: Question[] = [];
    for (const question of phase.questions) { checkQuestion(question, prior); prior.push(question); }
    for (const lesson of phase.lessons) {
      checkSources(lesson.id, lesson.sourceIds);
      if (!lesson.teaching.length || !lesson.practiceQuestionIds.length) errors.push(`${lesson.id}: content or practice missing`);
      for (const id of lesson.practiceQuestionIds) if (!phase.questions.some((question) => question.id === id)) errors.push(`${lesson.id}: unknown practice question ${id}`);
    }
    try {
      const correctAnswers = Object.fromEntries(phase.questions.map((question) => [question.id, question.correctChoiceId]));
      if (!gradePhase(phase, correctAnswers).passed) errors.push(`Phase ${phase.id}: authored answer key does not pass its own phase`);
    } catch (error) {
      errors.push(`Phase ${phase.id}: authored answer key is not gradeable (${error instanceof Error ? error.message : "unknown error"})`);
    }
  }
  for (const mockCase of cases) {
    if (!mockCase.fictional) errors.push(`${mockCase.id}: simulation label missing`);
    if (mockCase.questions.length < 16) errors.push(`${mockCase.id}: fewer than 16 graded decisions`);
    if (!mockCase.packet.length) errors.push(`${mockCase.id}: case packet missing`);
    checkSources(mockCase.id, mockCase.sourceIds);
    const prior: Question[] = [];
    for (const question of mockCase.questions) { checkQuestion(question, prior); prior.push(question); }
    try {
      const answers: Record<string, string> = {};
      for (const question of mockCase.questions) {
        if (!question.when || question.when.choiceIds.includes(answers[question.when.questionId] ?? "")) answers[question.id] = question.correctChoiceId;
      }
      const score = grade(mockCase.questions, answers);
      if (score.percent !== 100 || score.criticalErrors.length) errors.push(`${mockCase.id}: correct-answer path does not produce a clean passing score`);
    } catch (error) {
      errors.push(`${mockCase.id}: correct-answer path is not gradeable (${error instanceof Error ? error.message : "unknown error"})`);
    }
  }
  return errors;
}
