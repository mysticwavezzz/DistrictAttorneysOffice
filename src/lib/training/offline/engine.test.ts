import { describe, expect, it } from "vitest";
import { TRAINING_PHASES, TRAINING_SOURCES } from "./course";
import { BANK_VERSION, canStartMock, gradeMock, gradePhase, nextQuestion, validateBank } from "./engine";
import { PILOT_MOCK_CASES } from "./mock-case";
import type { PhaseResult, Question } from "./types";

function correctAnswers(questions: readonly Question[]): Record<string, string> {
  return Object.fromEntries(questions.filter((question) => !question.when || question.when.choiceIds.includes(questions.find((item) => item.id === question.when?.questionId)?.correctChoiceId ?? "")).map((question) => [question.id, question.correctChoiceId]));
}

function passedPhases(): PhaseResult[] {
  return TRAINING_PHASES.map((phase) => gradePhase(phase, correctAnswers(phase.questions)));
}

describe("offline Criminal Division training bank", () => {
  it("has source-linked, four-option items and a complete authored pilot trial", () => {
    expect(validateBank(TRAINING_SOURCES, TRAINING_PHASES, PILOT_MOCK_CASES)).toEqual([]);
    expect(TRAINING_PHASES.map((phase) => phase.questions.length)).toEqual([10, 10, 10]);
    expect(PILOT_MOCK_CASES).toHaveLength(24);
    expect(PILOT_MOCK_CASES.every((mockCase) => mockCase.questions.length >= 16)).toBe(true);
  });

  it("requires all three current phases before the mock trial", () => {
    const results = passedPhases();
    expect(results.every((result) => result.passed)).toBe(true);
    expect(canStartMock(results)).toBe(true);
    expect(canStartMock(results.slice(0, 2))).toBe(false);
    expect(canStartMock([{ ...results[0]!, bankVersion: "old-version" }, ...results.slice(1)])).toBe(false);
    expect(() => gradeMock(PILOT_MOCK_CASES[0]!, correctAnswers(PILOT_MOCK_CASES[0]!.questions), results.slice(0, 2))).toThrow(/three current course phases/);
  });

  it("scores a phase by actual answers and blocks a critical disclosure error", () => {
    const phase = TRAINING_PHASES[0];
    const answers = correctAnswers(phase.questions);
    const result = gradePhase(phase, answers);
    expect(result).toMatchObject({ bankVersion: BANK_VERSION, total: 10, correct: 10, passed: true });
    answers["p1-03"] = "p1-03-2";
    expect(gradePhase(phase, answers)).toMatchObject({ correct: 9, percent: 90, passed: true });
    answers["p1-04"] = "p1-04-2";
    expect(gradePhase(phase, answers)).toMatchObject({ correct: 8, percent: 80, passed: false });
    answers["p1-01"] = "p1-01-1";
    expect(gradePhase(phase, answers).criticalErrors).toContain("p1-01");
  });

  it("branches each mock from its selected Information and grades only that path", () => {
    for (const mockCase of PILOT_MOCK_CASES) {
      const answers = correctAnswers(mockCase.questions);
      const result = gradeMock(mockCase, answers, passedPhases());
      expect(result.passed, mockCase.id).toBe(true);
      expect(result.correct, mockCase.id).toBe(result.total);

      const branches = mockCase.questions.filter((question) => question.when);
      expect(branches.length, mockCase.id).toBeGreaterThanOrEqual(2);
      const parent = mockCase.questions.find((question) => question.id === branches[0]!.when!.questionId)!;
      expect(parent.choices, mockCase.id).toHaveLength(4);
      expect(parent.prompt, mockCase.id).toContain("Which filing should the People submit");
      for (const choice of parent.choices) {
        expect(branches.some((question) => question.when?.choiceIds.includes(choice.id)), `${mockCase.id}:${choice.id}`).toBe(true);
      }
      const alternateChoice = parent.choices.find((choice) => choice.id !== parent.correctChoiceId)!;
      const alternateBranch = mockCase.questions.find((question) => question.when?.questionId === parent.id && question.when.choiceIds.includes(alternateChoice.id));
      expect(alternateBranch, mockCase.id).toBeDefined();
      expect(branches.some((question) => answers[question.id] === question.correctChoiceId), mockCase.id).toBe(true);
      expect(alternateBranch!.choices).toHaveLength(4);
    }
  });

  it("rejects a wrong branch answer and refuses answers from the unselected branch", () => {
    const mockCase = PILOT_MOCK_CASES[0]!;
    const answers = correctAnswers(mockCase.questions);
    const branches = mockCase.questions.filter((question) => question.when);
    const branch = branches[0]!;
    const parent = mockCase.questions.find((question) => question.id === branch.when!.questionId)!;
    const alternateChoice = parent.choices.find((choice) => choice.id !== parent.correctChoiceId)!;
    const alternateBranch = mockCase.questions.find((question) => question.when?.questionId === parent.id && question.when.choiceIds.includes(alternateChoice.id))!;
    const wrong = { ...answers, [parent.id]: alternateChoice.id, [alternateBranch.id]: alternateBranch.correctChoiceId };
    for (const item of branches) if (item.when?.choiceIds.includes(parent.correctChoiceId)) delete wrong[item.id];
    const wrongResult = gradeMock(mockCase, wrong, passedPhases());
    expect(wrongResult.passed).toBe(false);
    const selectedBranch = branches.find((item) => item.when?.choiceIds.includes(parent.correctChoiceId))!;
    expect(() => gradeMock(mockCase, { ...wrong, [selectedBranch.id]: selectedBranch.correctChoiceId }, passedPhases())).toThrow(/out-of-branch/);
  });

  it("does not score missing answers or unlock later questions early", () => {
    expect(nextQuestion(PILOT_MOCK_CASES[0]!.questions, {})?.id).toBe("m-01");
    expect(() => gradePhase(TRAINING_PHASES[1], {})).toThrow(/Missing answer/);
    expect(() => gradeMock(PILOT_MOCK_CASES[0]!, {}, passedPhases())).toThrow(/Missing answer/);
  });

  it("records the plea outcome only after a complete mock path", () => {
    const pleaReady = PILOT_MOCK_CASES.find((mockCase) => mockCase.pleaDisposition?.accepted);
    const notReady = PILOT_MOCK_CASES.find((mockCase) => mockCase.pleaDisposition && !mockCase.pleaDisposition.accepted);
    expect(pleaReady?.questions.at(-1)?.prompt).toBe("Final pretrial conference: decide whether to offer a plea.");
    expect(pleaReady?.pleaDisposition?.explanation).toContain("beyond a reasonable doubt");
    expect(notReady?.pleaDisposition?.explanation).toContain("No plea is offered");
  });
});
