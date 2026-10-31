import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { TRAINING_PHASES, TRAINING_SOURCES } from "../src/lib/training/offline/course";
import { canStartMock, gradeMock, gradePhase, nextQuestion, validateBank } from "../src/lib/training/offline/engine";
import { PILOT_MOCK_CASES } from "../src/lib/training/offline/mock-case";
import type { Question } from "../src/lib/training/offline/types";

const errors = validateBank(TRAINING_SOURCES, TRAINING_PHASES, PILOT_MOCK_CASES);
if (errors.length) throw new Error(errors.join("\n"));
if (process.argv.includes("--validate")) {
  console.log(`Training bank valid: ${TRAINING_PHASES.length} phases, ${TRAINING_PHASES.reduce((sum, phase) => sum + phase.questions.length, 0)} course questions, ${PILOT_MOCK_CASES.length} mock cases, ${PILOT_MOCK_CASES.reduce((sum, mockCase) => sum + mockCase.questions.length, 0)} authored mock decisions.`);
  process.exit(0);
}

const caseArgIndex = process.argv.indexOf("--case");
const requestedCase = caseArgIndex >= 0 ? process.argv[caseArgIndex + 1] : undefined;
const selectedCase = (requestedCase
  ? PILOT_MOCK_CASES.find((mockCase, index) => mockCase.id === requestedCase || mockCase.title.toLowerCase().includes(requestedCase.toLowerCase()) || String(index + 1) === requestedCase)
  : PILOT_MOCK_CASES[0]) ?? (() => { throw new Error(`Unknown mock case '${requestedCase}'. Available: ${PILOT_MOCK_CASES.map((item, index) => `${index + 1}: ${item.title} (${item.id})`).join("; ")}`); })();

const io = createInterface({ input, output });
async function answer(question: Question): Promise<string> {
  console.log(`\n${question.prompt}\n${question.facts ?? ""}`);
  question.choices.forEach((choice, index) => console.log(`  ${index + 1}. ${choice.text}`));
  while (true) {
    const raw = (await io.question("Choose 1-4: ")).trim();
    const index = Number(raw) - 1;
    if (!Number.isInteger(index) || index < 0 || index > 3) continue;
    const choice = question.choices[index]!;
    console.log(`${choice.id === question.correctChoiceId ? "Correct" : "Review"}: ${choice.explanation}`);
    console.log(`Source: ${question.sourceIds.join(", ")}`);
    return choice.id;
  }
}

async function main(): Promise<void> {
try {
  console.log("Harrison County DAO Criminal Division training pilot. All mock case facts are fictional. Nothing is filed or saved to the website.");
  console.log(`Final mock case: ${selectedCase.title}. Use --case <1-${PILOT_MOCK_CASES.length}, title fragment, or case id> to choose another.`);
  const results = [];
  for (const phase of TRAINING_PHASES) {
    console.log(`\n=== Phase ${phase.id}: ${phase.title} ===`);
    for (const lesson of phase.lessons) {
      console.log(`\n${lesson.title}`);
      lesson.teaching.forEach((line) => console.log(line));
    }
    const answers: Record<string, string> = {};
    while (true) {
      const question = nextQuestion(phase.questions, answers);
      if (!question) break;
      answers[question.id] = await answer(question);
    }
    const result = gradePhase(phase, answers);
    results.push(result);
    console.log(`Phase ${phase.id}: ${result.percent}% ${result.passed ? "PASS" : "REVIEW REQUIRED"}`);
    if (!result.passed) break;
  }
  if (canStartMock(results)) {
    console.log(`\n=== Final mock trial: ${selectedCase.title} ===`);
    for (const section of selectedCase.packet) console.log(`\n${section.heading}\n${section.text}`);
    const answers: Record<string, string> = {};
    while (true) {
      const question = nextQuestion(selectedCase.questions, answers);
      if (!question) break;
      answers[question.id] = await answer(question);
    }
    const result = gradeMock(selectedCase, answers, results);
    console.log(`Mock trial: ${result.percent}% ${result.passed ? "PASS" : "REVIEW REQUIRED"}`);
    console.log(`Competencies: ${JSON.stringify(result.competencyPercent)}`);
    if (result.criticalErrors.length) console.log(`Critical errors: ${result.criticalErrors.join(", ")}`);
  }
} finally {
  io.close();
}
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
