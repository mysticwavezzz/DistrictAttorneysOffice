import type { Choice, Competency, MockCase, Question } from "./types";

type Four<T> = [T, T, T, T];

export interface AuthoredQuestion {
  competency: Competency;
  prompt: string;
  facts: string;
  sourceIds: string[];
  correct: number;
  choices: Four<string>;
  explanations: Four<string>;
  critical?: number[];
}

export interface CaseScenario {
  id: string;
  title: string;
  offense: string;
  statute: string;
  statuteSource: string;
  sourceIds: string[];
  packet: MockCase["packet"];
  elements: AuthoredQuestion;
  charge: AuthoredQuestion;
  distinction: AuthoredQuestion;
  evidence: AuthoredQuestion;
  defense: string;
  disputedFact: string;
  favorableMaterial: string;
  exhibit: string;
  exhibitLimit: string;
  direct: string;
  directChoices: Four<string>;
  directExplanations: Four<string>;
  directCorrect: number;
  closing: Four<string>;
  closingExplanations: Four<string>;
  closingCorrect: number;
}

function makeQuestion(prefix: string, suffix: string, authored: AuthoredQuestion, when?: Question["when"]): Question {
  const choices = authored.choices.map((text, index) => ({
    id: `${prefix}-${suffix}-choice-${index + 1}`,
    text,
    explanation: authored.explanations[index]!,
    ...(authored.critical?.includes(index) ? { criticalError: true } : {}),
  })) as Four<Choice>;
  return {
    id: `${prefix}-${suffix}`,
    competency: authored.competency,
    prompt: authored.prompt,
    facts: authored.facts,
    sourceIds: authored.sourceIds,
    choices,
    correctChoiceId: choices[authored.correct]!.id,
    ...(when ? { when } : {}),
  };
}

export function makeCaseBatchScenario(s: CaseScenario): MockCase {
  const prefix = s.id;
  const rules = ["rule-3", "rule-5", "rule-6", "rule-9", "rule-10", "rule-11", "rule-12", "rule-13", "rule-14", "rule-15"];
  const legalSources = [s.statuteSource, ...rules];
  const wrongChargeIndexes = [0, 1, 2, 3].filter((index) => index !== s.charge.correct);
  const chargeOne = wrongChargeIndexes[0]!;
  const chargeTwo = wrongChargeIndexes[1]!;
  const fileOptions = [
    { kind: "supported-ci", text: `CRIMINAL INFORMATION · COUNT 1\n${s.charge.choices[s.charge.correct]}\n/s/ ADA Harbor\nSeparate sworn probable-cause statement attached.`, explanation: `This is the supported charging theory in the packet. ${s.charge.explanations[s.charge.correct]}` },
    { kind: "overcharge", text: `CRIMINAL INFORMATION · COUNT 1\n${s.charge.choices[chargeOne]}\n/s/ ADA Harbor\nSeparate sworn probable-cause statement attached.`, explanation: s.charge.explanations[chargeOne]! },
    { kind: "defective-ci", text: `CRIMINAL INFORMATION · COUNT 1\n${s.charge.choices[chargeTwo]}\n/s/ Detective CedarVale\nNo separate sworn probable-cause statement attached.`, explanation: `The filing uses an investigator's signature and has no separate sworn probable-cause statement. ${s.charge.explanations[chargeTwo]}` },
    { kind: "wrong-filing", text: `PEOPLE'S MOTION IN LIMINE\nThe People ask to exclude the defense's evidence. No Criminal Information or probable-cause statement is filed.`, explanation: "A motion in limine does not commence a criminal case. Rule 5 requires a Criminal Information and a separate probable-cause statement." },
  ];
  const hash = [...prefix].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7);
  const correctFileIndex = hash % 4;
  const orderedFiles = [...fileOptions];
  [orderedFiles[0], orderedFiles[correctFileIndex]] = [orderedFiles[correctFileIndex]!, orderedFiles[0]!];
  const fileQuestionId = `${prefix}-01`;
  const procedure = (suffix: string, competency: Competency, prompt: string, facts: string, correct: number, choices: Four<string>, explanations: Four<string>, critical: number[] = [], sources: string[] = ["rule-5"]): Question =>
    makeQuestion(prefix, suffix, { competency, prompt, facts, sourceIds: sources, correct, choices, explanations, critical });

  const questions: Question[] = [
    makeQuestion(prefix, "01", {
      competency: "charging",
      prompt: "The CID packet is ready for review. Which filing should the People submit to start this case? Read each proposed document before choosing.",
      facts: `${s.charge.facts} Each option is a proposed filing. The case has not yet been filed with the Court.`,
      sourceIds: [s.statuteSource, "rule-5", "justice-manual"],
      correct: correctFileIndex,
      choices: orderedFiles.map((item) => item.text) as Four<string>,
      explanations: orderedFiles.map((item) => item.explanation) as Four<string>,
      critical: orderedFiles.flatMap((item, index) => item.kind === "supported-ci" ? [] : [index]),
    }),
    makeQuestion(prefix, "02-supported", {
      competency: "motions", prompt: `The defense challenges the filed count, arguing: ${s.defense} What is the People's best response?`,
      facts: `${s.disputedFact} The filing was facially sufficient, but the People still must prove every element beyond a reasonable doubt at trial.`,
      sourceIds: [s.statuteSource, "rule-5", "rule-12"], correct: 1,
      choices: ["Tell the judge the charge itself proves guilt.", "Answer the actual argument from the packet, address facts both ways, and ask for a focused hearing only if a material dispute needs testimony.", "Keep favorable material from the defense until trial.", "Ask the Court to treat the allegation as an established fact."],
      explanations: ["A charging document is not proof at trial.", "The response meets the motion without overstating the evidence.", "Covered favorable material must be disclosed.", "An allegation is not a finding."], critical: [0, 2, 3],
    }, { questionId: fileQuestionId, choiceIds: [`${fileQuestionId}-choice-${correctFileIndex + 1}`] }),
    ...orderedFiles.flatMap((file, index) => file.kind === "supported-ci" ? [] : [makeQuestion(prefix, `02-${file.kind}`, {
      competency: "motions", prompt: file.kind === "wrong-filing"
        ? "The defense moves to dismiss because the People filed a motion in limine but no charging instrument or probable-cause statement. What should you do?"
        : file.kind === "overcharge"
          ? `The defense moves to dismiss the unsupported count: ${file.text.split("\n")[1]}. What is the proper response?`
          : "The defense challenges the CI's signature and the missing sworn probable-cause statement. How should the People respond?",
      facts: file.kind === "wrong-filing" ? "The case has not been commenced by a Criminal Information." : `The defect is: ${file.explanation}`,
      sourceIds: ["rule-5", "rule-12"], correct: 2,
      choices: ["Insist the filing is valid because it was uploaded to the portal.", "Hide the defect and proceed as though the proper document was filed.", "Acknowledge the problem, consult the supervisor, and seek only a correction or new filing the rule permits without prejudicing the defendant's rights; do not proceed on an unsupported count.", "Delete the filing from the case record without telling the Court."],
      explanations: ["Portal upload does not cure a defective court filing.", "The People must not conceal a material defect.", "This addresses the defect openly and respects Rule 5(d) and the defendant's rights.", "The court record must remain accurate."], critical: [0, 1, 3],
    }, { questionId: fileQuestionId, choiceIds: [`${fileQuestionId}-choice-${index + 1}`] })]),
    makeQuestion(prefix, "03", s.elements),
    makeQuestion(prefix, "04", s.distinction),
    makeQuestion(prefix, "05", s.evidence),
    procedure("06", "procedure", "What document must accompany the Criminal Information?", "The CID affiant has prepared a separate factual statement.", 1,
      ["A news release describing the charge.", "A separate written probable-cause statement under oath or penalty of perjury.", "A sentence recommendation.", "The police report alone, whether or not it is sworn."],
      ["A public statement is not a Rule 5(b) filing.", "Rule 5(b) requires this separate statement.", "Sentencing follows adjudication.", "The rule specifies oath or penalty of perjury."], [0, 2, 3], ["rule-5"]),
    procedure("07", "procedure", "If the judge finds probable cause, what process is ordinarily requested?", "The packet identifies no listed warrant ground.", 2,
      ["An arrest warrant in every case.", "Immediate conviction.", "A summons, subject to the judge's Rule 6 determination.", "No court process because the DAO portal contains the case."],
      ["The supplied rule does not make warrants automatic.", "Probable cause is not guilt.", "This follows Rule 6's summons preference.", "An internal case entry is not judicial process."], [0, 1, 3], ["rule-6"]),
    procedure("08", "discovery", "The defense requested all reports, recordings, and favorable information. What is the proper approach?", s.favorableMaterial, 0,
      ["Preserve and disclose responsive material, identify its source and limits, and promptly supplement when additional material is obtained.", "Produce only what supports the charge.", "Wait until trial to disclose anything unfavorable.", "Omit a witness statement if another witness disagrees."],
      ["This follows the request-triggered and continuing disclosure duties.", "The request is not limited to inculpatory evidence.", "That would delay required disclosure.", "Conflicts do not excuse withholding."], [1, 2, 3], ["rule-11"]),
    procedure("09", "procedure", "The office dashboard says 'approved,' but no clerk receipt appears. What status is established?", "No court-filing confirmation is in the record.", 3,
      ["Filed and served.", "A summons issued.", "The defendant was arraigned.", "Internal approval only; court filing is unconfirmed."],
      ["Internal approval does not establish filing or service.", "No process was issued.", "No appearance is recorded.", "This distinguishes office review from filing with the clerk."], [0, 1, 2], ["rule-3"]),
    procedure("10", "motions", "What factual support should accompany a People's pretrial motion?", "The motion relies on a disputed source, timing, or witness account.", 1,
      ["Counsel's unsworn description alone.", "A signed affidavit from a person with a factual basis, identifying the source records and what the affiant knows.", "The case title and charge table.", "A proposed ruling without supporting facts."],
      ["Rule 12(a)(2) requires factual support.", "This supplies a competent factual basis.", "A caption proves no fact.", "A proposed order is not evidence."], [0, 2, 3], ["rule-12"]),
    makeQuestion(prefix, "11", {
      competency: "trial", prompt: s.direct, facts: "Ask only for facts within the witness's personal knowledge.", sourceIds: ["rule-14"], correct: s.directCorrect,
      choices: s.directChoices, explanations: s.directExplanations, critical: s.directExplanations.map((_, i) => i).filter((i) => i !== s.directCorrect),
    }),
    procedure("12", "trial", "How should the People present the identified exhibit?", `${s.exhibit}. ${s.exhibitLimit}`, s.exhibitLimit.length > 0 ? 2 : 2,
      ["Call an export the complete original without explaining its source.", "Show only the favorable portion and omit the original.", "Identify the source, original and any export, preservation, and what the exhibit does and does not depict.", "Use counsel's description in place of a foundation."],
      ["That misstates the file.", "The original and any edit must be accounted for.", "This gives the Court a fair basis to assess the exhibit.", "Argument is not source evidence."], [0, 1, 3], ["rule-10", "rule-11"]),
    makeQuestion(prefix, "13", {
      competency: "trial", prompt: "Which closing position is supported by this record?", facts: s.disputedFact,
      sourceIds: [s.statuteSource], correct: s.closingCorrect, choices: s.closing, explanations: s.closingExplanations,
      critical: s.closingExplanations.map((_, i) => i).filter((i) => i !== s.closingCorrect),
    }),
    procedure("14", "trial", "Who decides the case and when does sentencing occur?", "This is a Harrison County criminal bench trial.", 0,
      ["The judge decides after hearing the evidence and arguments; sentencing follows a guilty finding.", "The prosecutor decides guilt when selecting a charge.", "The investigating officer enters the verdict.", "The complaining witness chooses the sentence."],
      ["This follows the local bench-trial procedure.", "Charging and adjudication are separate.", "An investigator is a witness.", "A complaining witness does not decide guilt or sentence."], [1, 2, 3], ["rule-13", "rule-14", "rule-15"]),
    procedure("15", "procedure", "What should happen at arraignment after valid service?", "The accused has not yet entered a plea.", 3,
      ["The prosecutor enters a guilty plea for the accused.", "The witness chooses whether the case proceeds.", "The court imposes sentence before taking a plea.", "The Court advises the charge and rights, takes the plea, and addresses counsel and scheduling under Rule 9."],
      ["The accused enters a plea personally or through counsel as permitted.", "The witness is not a party.", "Sentencing follows conviction.", "This describes the arraignment function."], [0, 1, 2], ["rule-9"]),
  ];

  return {
    id: s.id,
    version: "2026-10-30-2",
    title: `${s.title} (training simulation)`,
    fictional: true,
    sourceIds: [...new Set([...s.sourceIds, ...rules])],
    packet: s.packet,
    questions,
  };
}
