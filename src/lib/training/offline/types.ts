/** Authoring model for the versioned Criminal Division course and final mock-trial bank. */
export type PhaseId = 1 | 2 | 3;
export type Competency = "ethics" | "charging" | "procedure" | "discovery" | "motions" | "trial";

export interface TrainingSource {
  id: string;
  label: string;
  section: string;
  url: string;
  checkedOn: string;
}

export interface Choice {
  id: string;
  text: string;
  explanation: string;
  /** Selecting this answer prevents a passing result even if the percentage is high. */
  criticalError?: boolean;
}

export interface Question {
  id: string;
  competency: Competency;
  prompt: string;
  facts?: string;
  choices: [Choice, Choice, Choice, Choice];
  correctChoiceId: string;
  sourceIds: string[];
  /** A question appears only if the earlier question received one of these choices. */
  when?: { questionId: string; choiceIds: string[] };
}

export interface Lesson {
  id: string;
  title: string;
  teaching: string[];
  sourceIds: string[];
  practiceQuestionIds: string[];
}

export interface TrainingPhase {
  id: PhaseId;
  title: string;
  lessons: Lesson[];
  questions: Question[];
}

export interface MockPacketSection {
  heading: string;
  text: string;
}

export interface MockCase {
  id: string;
  version: string;
  title: string;
  fictional: true;
  sourceIds: string[];
  packet: MockPacketSection[];
  questions: Question[];
  /** Simulated plea conference outcome after a sound, proportionate offer. */
  pleaDisposition?: { accepted: boolean; explanation: string };
}

export interface PhaseResult {
  phaseId: PhaseId;
  bankVersion: string;
  correct: number;
  total: number;
  percent: number;
  criticalErrors: string[];
  passed: boolean;
}

export interface MockResult {
  caseId: string;
  caseVersion: string;
  correct: number;
  total: number;
  percent: number;
  competencyPercent: Partial<Record<Competency, number>>;
  criticalErrors: string[];
  passed: boolean;
}
