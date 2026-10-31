import type { Choice, Competency, MockCase, Question } from "./types";

type Four<T> = [T, T, T, T];
function decision(id: string, competency: Competency, prompt: string, facts: string, sourceIds: string[], correct: number, texts: Four<string>, explanations: Four<string>, critical: number[] = [], when?: Question["when"]): Question {
  const choices = texts.map((text, index) => ({ id: `${id}-${index + 1}`, text, explanation: explanations[index]!, ...(critical.includes(index) ? { criticalError: true } : {}) })) as Four<Choice>;
  return { id, competency, prompt, facts, sourceIds, choices, correctChoiceId: choices[correct]!.id, ...(when ? { when } : {}) };
}

/** Pilot 1. All people, records, dates, and exhibits below are fictitious training material. */
export const MOCK_CASE_THEFT: MockCase = {
  id: "training-cid-theft-01",
  version: "2026-10-30-2",
  title: "People v. RivenHart84 (training simulation)",
  fictional: true,
  sourceIds: ["theft", "rule-3", "rule-5", "rule-6", "rule-10", "rule-11", "rule-12", "rule-13", "rule-14", "rule-15"],
  packet: [
    { heading: "TRAINING SIMULATION — CID probable cause statement", text: "HCSO Criminal Investigations Division | Supporting People v. RivenHart84 | Date: October 14, 2026 | Case reference: TRAIN-CID-004. Affiant: Detective CedarVale, CID. Knowing that a false statement is punishable, I declare under penalty of perjury that the facts below are true to the best of my knowledge. Proposed offense: Theft, 1 H.C.S. § 5003. This is a fictional exercise, not a court filing." },
    { heading: "Affiant's numbered facts", text: "1. I investigated a camera missing from Junction Supply on October 12. 2. Clerk MaraField told me the store owned camera JS-44 and that RivenHart84 took it out without permission after being allowed to inspect it at the counter. 3. A store receipt lists the camera at $420. 4. I received a 22-second export from the store camera. It shows the named avatar leaving with the camera; the store retains the four-minute original. I have not yet received that original. 5. The defendant's account sent MaraField a message that night: 'I took it. I am selling it, not bringing it back.' The account was linked to the defendant in a signed interview. 6. The defendant's signed interview says, 'I thought she said I could borrow it.' The camera was recovered from a buyer on October 13. 7. MaraField first told investigators she never handed the camera over. A later store note says she let the defendant hold it for inspection. Both accounts are included in the investigative report." },
    { heading: "Investigative report and exhibit inventory", text: "Exhibit A: 22-second exported store clip, source identified but full original not yet obtained. Exhibit B: signed defendant interview. Exhibit C: account message with account-link record. Exhibit D: $420 store receipt. Exhibit E: MaraField's first statement and later store note. Exhibit F: recovery record from the buyer. The report says the clip shows removal; it does not show what the clerk said or whether the camera was loaned." },
    { heading: "Defense request and later development", text: "On October 15 the defense requests all reports, recordings, witness accounts, and material tending to reduce guilt. On October 16 the store provides the full four-minute video. It shows MaraField handing the camera to the defendant to inspect it and then the defendant leaving with it. The video has no audio. Defense counsel later moves to exclude Exhibit A as an incomplete export and argues that the facts do not show intent to steal. The court has not adopted a federal evidence rule in this exercise." },
    { heading: "Status", text: "No Criminal Information, probable cause statement, summons, or warrant has yet been filed or issued. No arraignment has occurred. The trainee must decide what to request and what to disclose. All usernames and events are fictional." },
  ],
  questions: [
    decision("m-01", "charging", "The CID packet is ready for review. Which filing should the People submit to start this case? Read each proposed document before choosing.", "This is the first filing decision. One option is a supported Criminal Information accompanied by the sworn probable-cause statement.", ["theft", "rule-5", "justice-manual"], 2, [
      "CRIMINAL INFORMATION · COUNT 1 — Grand Theft, 1 H.C.S. § 5004. On October 12, RivenHart84 took Junction Supply's camera worth $620 intending to keep it. /s/ ADA Harbor. Separate sworn probable-cause statement attached.",
      "CRIMINAL INFORMATION · COUNT 1 — Theft, 1 H.C.S. § 5003. On October 12 in Harrison County, RivenHart84 committed Theft involving a camera. /s/ ADA Harbor. Separate sworn probable-cause statement attached.",
      "CRIMINAL INFORMATION · COUNT 1 — Theft, 1 H.C.S. § 5003. On October 12 at Junction Supply in Harrison County, RivenHart84, knowing camera JS-44 belonged to the store and without its consent to take it away, carried it out intending to sell it and not return it. /s/ ADA Harbor. Separate sworn probable-cause statement attached.",
      "PEOPLE'S MOTION IN LIMINE · The People ask the Court to exclude the defense's evidence. No Criminal Information or probable-cause statement is filed."
    ], ["The receipt lists $420, not $620, so the value alternative is unsupported.", "This count omits facts showing lack of consent and intent to permanently deprive.", "This count states the supported Theft theory, citation, attorney signature, and required separate sworn statement.", "A motion in limine does not commence a criminal case."], [0, 1, 3]),
    decision("m-02a", "motions", "The defense attacks the supported Theft count, arguing the store allowed an inspection and intent is disputed. What should the People say?", "The full video shows inspection and departure; the account-linked message says the defendant planned to sell rather than return the camera. A signed interview gives a contrary account.", ["theft", "rule-12"], 1, ["The charge itself proves guilt, so the motion should be denied without review.", "Answer from the record: permission to inspect is not permission to take away; address the sale message and the contrary interview, and ask the Court to decide the disputed evidence under the proper standard.", "Withhold the interview because it conflicts with the message.", "Ask the Court to treat the clerk's first account as conclusive."], ["A CI is not proof at trial.", "This meets the defense's point while addressing evidence both ways.", "The conflicting account must not be concealed.", "The Court decides the facts from the full record."], [0, 2, 3], { questionId: "m-01", choiceIds: ["m-01-3"] }),
    decision("m-02b", "motions", "The defense moves to dismiss the Grand Theft count because the receipt lists $420, not $620. What should the People do?", "The value alternative requires more than $500 or a firearm; this packet shows neither for the camera.", ["theft", "rule-5", "rule-12"], 2, ["Insist the estimate in the CI is enough, even though it conflicts with the receipt.", "Keep the amount because the buyer recovered the camera.", "Acknowledge the unsupported amount and seek only the correction or narrower charge the Court permits without prejudice; do not proceed on the unsupported enhancement.", "Delete the court filing without telling the Court."], ["The file does not support $620.", "Recovery does not establish the value threshold.", "This candidly addresses the defect and preserves the defendant's rights.", "The court record must remain accurate."], [0, 1, 3], { questionId: "m-01", choiceIds: ["m-01-1"] }),
    decision("m-02c", "motions", "The defense challenges the bare Theft count and the missing attorney signature or sworn statement. What is the proper response?", "The count states only a label, and the investigator signed it without a separate probable-cause statement.", ["rule-5", "rule-12"], 2, ["Say the title 'Theft' supplies the missing elements.", "Proceed because an investigator prepared the report.", "Acknowledge the filing defects and ask the supervisor and Court for only the correction or new filing Rule 5 permits without prejudice; otherwise do not proceed on it.", "Remove the deficient version from the docket without notice."], ["A charge label does not supply essential facts.", "The investigator's report does not replace the required attorney signature and sworn AOPC.", "This addresses the defects openly and respects the rule.", "The docket must be corrected transparently."], [0, 1, 3], { questionId: "m-01", choiceIds: ["m-01-2"] }),
    decision("m-02d", "motions", "The defense moves to dismiss because the People filed a motion in limine but no charge or probable-cause statement. What should the People do?", "No valid charging document has been filed in this simulation.", ["rule-5", "rule-12"], 2, ["Tell the Court that an internal portal entry is enough.", "Argue the motion in limine is equivalent to an Information.", "Acknowledge the case was not commenced by that filing and seek to file a proper CI and sworn statement only through the process the Court allows.", "Delete the motion and claim it was never filed."], ["The portal does not commence a prosecution.", "A motion is not a charging instrument.", "This corrects the error without misrepresenting the docket or bypassing procedure.", "The court record must remain accurate."], [0, 1, 3], { questionId: "m-01", choiceIds: ["m-01-4"] }),
    decision("m-03", "charging", "What must accompany the selected Information?", "The CID statement is signed by its affiant under penalty of perjury.", ["rule-5"], 0, ["The separate CID statement setting out facts for probable cause.", "The 22-second clip alone, without any statement.", "An unsworn prosecutor summary replacing the CID statement.", "Nothing, because the count lists the charge."], ["Rule 5(b) requires a written probable cause statement under oath or penalty of perjury.", "A clip alone does not meet Rule 5(b).", "An unsworn summary does not meet Rule 5(b).", "Rule 5(b) is a separate requirement."], [1, 2, 3]),
    decision("m-04", "procedure", "What process should the People request first if probable cause is found?", "The packet gives no reason to believe the defendant will fail to appear or create another listed warrant risk.", ["rule-6"], 1, ["A warrant automatically because Theft is a crime.", "A summons, subject to the judge's Rule 6 decision.", "Immediate sentencing.", "No process; the DAO portal case entry is enough."], ["Rule 6 prefers a summons absent an enumerated reason.", "This follows the Rule 6 preference.", "The defendant has not been convicted.", "An internal case record is not court process."]),
    decision("m-05", "procedure", "The court issues a summons. What should be tracked next?", "The defendant has not appeared.", ["rule-6", "rule-9"], 2, ["Mark the defendant convicted.", "Assume service from the issuance date.", "Service and proof of service, then the scheduled appearance.", "Ask the store clerk to enter the defendant's plea."], ["Issuance is not guilt.", "Service is a separate act.", "Rule 6 addresses service and return; Rule 9 governs arraignment.", "The clerk does not take a plea from a witness."], [0, 1]),
    decision("m-06", "discovery", "Defense has requested discovery. Which production inventory is accurate on October 15?", "The full store video is not yet in CID's hands.", ["rule-11"], 0, ["Identify A as an export, B through F by source, include both clerk accounts, and say the full original has been requested but not received.", "Produce only the 22-second export because it favors the charge.", "Describe A as the full original video and omit the later clerk note.", "Say the original was destroyed without asking the store."], ["This describes the actual files and the known gap.", "Rule 11 reaches other case material on request.", "The export is incomplete and the contradictory note matters.", "Not received is not destroyed."], [1, 2, 3]),
    decision("m-07", "discovery", "The store provides the four-minute video on October 16. What do you do?", "It shows the clerk handed over the camera for inspection; it has no audio.", ["rule-11"], 3, ["Hold it until trial because it complicates the clerk's first account.", "Delete the short export and say it never existed.", "Describe it as proving that the clerk consented to removal.", "Preserve and promptly disclose it, identify its source and limits, and reassess the charge."], ["Rule 11(d) requires prompt disclosure of newly found covered material.", "The short export is part of the record.", "The silent video does not prove consent to remove it.", "This meets the continuing duty and avoids overstatement."], [0, 1, 2]),
    decision("m-08", "discovery", "How should you correct the clerk's first account in the disclosure?", "Her initial statement denied handing over the camera; her later note and the video show she did hand it over for inspection.", ["rule-11"], 1, ["Keep only the initial account because it came first.", "Identify both accounts and the video; do not claim either proves permission to leave with it.", "Call the later note a sworn transcript though it is not.", "Tell the clerk to retract the later note."], ["The later account and video are responsive.", "This gives the defense the conflict without inventing audio or consent.", "That would misdescribe the document.", "A prosecutor cannot erase a contradiction."], [0, 2, 3]),
    decision("m-09", "discovery", "The prosecutor's first notice called Exhibit A an original, complete recording. What correction is needed?", "A was a 22-second export; the original four-minute recording is now available.", ["rule-11"], 2, ["No correction because the same event appears in both.", "Say only that more video exists, without identifying it.", "Identify the inaccurate notice, correct A's description, and produce the four-minute source file.", "Replace A's filename with 'original' and leave the notice alone."], ["Completeness and identity are material descriptions.", "The defense needs to know what file was produced.", "This corrects the record and supplements production.", "Renaming does not change what A is."], [0, 3]),
    decision("m-10", "motions", "The defense moves to exclude the short clip because the full original was not initially produced. How should the People respond?", "The store has now supplied the four-minute original. The short export remains a separate file.", ["rule-10", "rule-11", "rule-12"], 1, ["Call both files the complete original and say there is no issue.", "Correct the disclosure, identify and produce both files accurately, explain source and preservation, and ask for a focused hearing if a material foundation dispute remains.", "Withhold the original because the short export supports the charge.", "Ask the Court to rule without seeing either file."], ["The files differ in length and history.", "This corrects the record and gives the Court the actual materials.", "The original and any favorable material must be disclosed.", "The Court should decide from the actual record."], [0, 2, 3]),
    decision("m-11", "motions", "Which authority should a response to the defense motion rely on?", "No local adoption of federal evidence rules is established in this exercise.", ["rule-5", "rule-10", "rule-12"], 0, ["The controlling Chesapeake charging and motion rules, with facts from this file.", "Federal Rules of Evidence as binding Harrison law without a local adoption source.", "An unrelated Ridgeway court order as controlling law.", "No authority; the prosecutor's title is enough."], ["The local rules govern the motion's procedure.", "The exercise provides no basis to call federal rules binding.", "Another jurisdiction's order is not controlling here.", "Rule 12 requires pertinent authority."], [1, 2]),
    decision("m-12", "motions", "What support does the People's own pretrial motion need if it asserts facts outside the current record?", "The People plan to seek an evidentiary ruling.", ["rule-12"], 3, ["Only counsel's unsworn confidence.", "A press article.", "A blank exhibit list.", "A factual affidavit signed by someone with a basis for the asserted facts."], ["Rule 12(a)(2) requires an affidavit.", "An article does not replace a factual affidavit.", "A blank list supplies no facts.", "This follows Rule 12(a)(2)."], [0, 2]),
    decision("m-13", "motions", "What should the prosecutor request when the source and completeness of Exhibit A remain disputed?", "The full recording arrived after the export and requires identification.", ["rule-10", "rule-12"], 1, ["Automatic admission of A as the original.", "A focused hearing on the files' identity, source, and preservation, with testimony if needed.", "A ban on all defense questions about the video.", "A ruling based on a file that has not been identified."], ["A is an export, not the original.", "Rules 10 and 12 allow the issue to be heard on an actual record.", "The defense may contest the foundation.", "The Court needs the file and factual basis."], [0, 3]),
    decision("m-14", "trial", "What is a sound opening for the People?", "The judge will hear a Theft charge, and the clerk's accounts conflict.", ["theft", "rule-13", "rule-14"], 2, ["Promise that the video has audio of a confession.", "Tell the judge the clerk never handled the camera.", "Outline the taking, lack of permission to remove it, and the verified message, while leaving the conflicting account for the evidence.", "Argue that a jury will be angry at the defendant."], ["The video is silent.", "The full video shows she handed it over for inspection.", "This previews the supported theory without suppressing a conflict.", "There is no jury in this Circuit."], [0, 1, 3]),
    decision("m-15", "trial", "Which direct-examination question fits MaraField's actual knowledge?", "She handed the camera over to be inspected.", ["rule-14"], 0, ["What did you permit the defendant to do with the camera, and what did you see next?", "You never touched the camera, correct?", "The defendant intended to steal from the first second, right?", "Tell the judge the video contains an audio confession."], ["This asks for what she did and observed.", "The video contradicts that premise.", "She cannot directly observe the defendant's internal intent.", "The video has no audio."], [1, 3]),
    decision("m-16", "trial", "How should the People establish the video evidence?", "A is a short export; the store supplied the four-minute source later.", ["rule-10", "rule-11"], 1, ["Call both files the same complete original.", "Identify each file separately, who supplied it, what it depicts, and how it was preserved.", "Offer the files without identifying their source.", "Replace a missing segment with counsel's summary and call that the source file."], ["The files differ in length and provenance.", "This presents the actual identity and preservation of each item.", "The source is a disputed foundation fact.", "Counsel's summary does not become source video."], [0, 2, 3]),
    decision("m-17", "trial", "Defense cross-examines the clerk about her first false description. What is the proper prosecution response?", "She first said she never handed over the camera.", ["rule-11", "rule-14"], 3, ["Object because unfavorable facts are off limits.", "Ask her to deny the video.", "Tell the Court the later note was never disclosed.", "Allow the contradiction to be tested and clarify, without rewriting either account, what she says happened."], ["The defense may test the witness's account.", "The video shows the handover.", "The note was part of disclosure.", "This respects the record and allows explanation."], [0, 1, 2]),
    decision("m-18", "trial", "What is a sound closing theory?", "The full video shows inspection and removal; the account-linked message says the defendant planned to sell rather than return the camera.", ["theft", "rule-14"], 0, ["Permission to inspect did not include permission to take away; the later message supports permanent deprivation, subject to the judge's assessment of the conflicting interview.", "A $420 receipt proves Grand Theft on value.", "The video contains words it does not record.", "The clerk's first account must be treated as unchanged."], ["This applies the Theft elements to admitted facts and acknowledges the conflict.", "Grand Theft's value alternative exceeds $500.", "The video has no audio.", "The full recording and later note contradict that claim."], [1, 2, 3]),
    decision("m-19", "trial", "If the Court finds guilt, what should the People do at sentencing?", "The defendant has not yet addressed the court.", ["rule-15"], 1, ["Demand an unrecorded sentence immediately.", "Make a supported recommendation and allow the defendant the Rule 15 opportunity to address the court.", "Treat the original charge proposal as the sentence.", "Ask to skip explanation of probation terms."], ["The court must pronounce and explain its sentence.", "Rule 15(a) gives the defendant that opportunity.", "The charging proposal is not judgment.", "The court must explain sentence or probation terms."], [0, 3]),
    decision("m-20", "procedure", "The DAO supervisor approved a training PDF. What is its court-filing status?", "No clerk transmission has occurred; this remains a simulation.", ["rule-3"], 2, ["Filed in court automatically.", "Served on the fictional defense automatically.", "Approved internally only; the simulated case is never filed in a real court.", "A binding conviction."], ["Portal approval is not filing under Rule 3.", "Service is a separate act.", "This preserves the simulation boundary and correct filing state.", "A PDF approval is not a verdict."], [0, 3]),
  ],
};

import { ADDITIONAL_MOCK_CASES } from "./additional-cases";
import { CASE_BATCH_02 } from "./case-batch-02";
import { CASE_BATCH_03 } from "./case-batch-03";
import { CASE_BATCH_04 } from "./case-batch-04";
import { CASE_BATCH_05 } from "./case-batch-05";
import { CASE_BATCH_06 } from "./case-batch-06";
import { CASE_BATCH_07 } from "./case-batch-07";
import { CASE_BATCH_08 } from "./case-batch-08";

const BASE_MOCK_CASES: MockCase[] = [MOCK_CASE_THEFT, ...ADDITIONAL_MOCK_CASES, ...CASE_BATCH_02, ...CASE_BATCH_03, ...CASE_BATCH_04, ...CASE_BATCH_05, ...CASE_BATCH_06, ...CASE_BATCH_07, ...CASE_BATCH_08];

const PLEA_READY_CASES = new Set([
  "training-cid-theft-01",
  "training-cid-robbery-05",
  "training-cid-burglary-06",
  "training-cid-simple-assault-13",
  "training-cid-battery-14",
]);

function stableChoicePosition(seed: string): number {
  return [...seed].reduce((value, char) => (value * 33 + char.charCodeAt(0)) >>> 0, 11) % 4;
}

function addFilingChoice(mockCase: MockCase): MockCase {
  if (mockCase.questions[0]?.prompt.startsWith("The CID packet is ready for review.")) return mockCase;

  const charge = mockCase.questions.find((question) => question.competency === "charging") ?? mockCase.questions[0]!;
  const supportedCharge = charge.choices.find((choice) => choice.id === charge.correctChoiceId) ?? charge.choices[0]!;
  const wrongChoices = charge.choices.filter((choice) => choice.id !== supportedCharge.id);
  const primaryBad = wrongChoices[0]!;
  const secondaryBad = wrongChoices[1] ?? wrongChoices[0]!;
  const fileOptions = [
    { kind: "supported", text: `CRIMINAL INFORMATION · COUNT 1\n${supportedCharge.text}\n/s/ ADA Harbor\nSeparate sworn probable-cause statement attached.`, explanation: "This filing uses the packet's supported count, a government attorney signature, and the separate sworn probable-cause statement required for this exercise." },
    { kind: "overcharge", text: `CRIMINAL INFORMATION · COUNT 1\n${primaryBad.text}\n/s/ ADA Harbor\nSeparate sworn probable-cause statement attached.`, explanation: `This count is not supported as written: ${primaryBad.explanation}` },
    { kind: "defect", text: `CRIMINAL INFORMATION · COUNT 1\n${secondaryBad.text}\n/s/ Detective CedarVale\nNo separate sworn probable-cause statement attached.`, explanation: `The count uses an investigator's signature and omits the separate sworn statement. ${secondaryBad.explanation}` },
    { kind: "wrong-document", text: "PEOPLE'S MOTION IN LIMINE\nThe People ask to exclude defense evidence. No Criminal Information or probable-cause statement is filed.", explanation: "A motion in limine does not start a criminal case. Rule 5 requires a Criminal Information and separate probable-cause statement." },
  ];
  const correctIndex = stableChoicePosition(`${mockCase.id}:filing`);
  const ordered = [...fileOptions];
  [ordered[0], ordered[correctIndex]] = [ordered[correctIndex]!, ordered[0]!];
  const filingQuestionId = `${mockCase.id}-filing-choice`;
  const filingQuestion: Question = {
    id: filingQuestionId,
    competency: "charging",
    prompt: "The CID packet is ready for review. Which filing should the People submit to start this case? Read each proposed document before choosing.",
    facts: "The four options are fictional proposed filings. Only one is a proper, supported Criminal Information with its required separate probable-cause statement.",
    sourceIds: ["rule-5", "justice-manual", ...mockCase.sourceIds.filter((id) => !id.startsWith("rule-"))],
    choices: ordered.map((option, index) => ({
      id: `${filingQuestionId}-${index + 1}`,
      text: option.text,
      explanation: option.explanation,
      ...(option.kind !== "supported" ? { criticalError: true } : {}),
    })) as [Choice, Choice, Choice, Choice],
    correctChoiceId: `${filingQuestionId}-${correctIndex + 1}`,
  };

  const attackQuestions: Question[] = ordered.flatMap<Question>((option, index) => {
    if (option.kind === "supported") {
      return [{
        id: `${mockCase.id}-defense-response-${index + 1}`,
        competency: "motions",
        prompt: "The defense moves to dismiss, pointing to the disputed facts and weaknesses in the packet. How should the People respond?",
        facts: "The selected Information is facially sufficient. The defense may still challenge whether admissible evidence proves every element beyond a reasonable doubt.",
        sourceIds: ["rule-12", "rule-11", ...mockCase.sourceIds.filter((id) => !id.startsWith("rule-"))],
        choices: [
          { id: `${mockCase.id}-response-${index + 1}-1`, text: "Tell the judge the charge itself proves guilt.", explanation: "A charging document is not proof at trial.", criticalError: true },
          { id: `${mockCase.id}-response-${index + 1}-2`, text: "Answer the motion from the record, address the strongest contrary fact, and ask for a focused hearing only if a material factual issue needs testimony.", explanation: "This answers the actual challenge without overstating the evidence." },
          { id: `${mockCase.id}-response-${index + 1}-3`, text: "Keep favorable material from the defense until trial.", explanation: "Covered favorable material must be disclosed.", criticalError: true },
          { id: `${mockCase.id}-response-${index + 1}-4`, text: "Ask the Court to treat the allegation as an established fact.", explanation: "An allegation is not a finding.", criticalError: true },
        ],
        correctChoiceId: `${mockCase.id}-response-${index + 1}-2`,
        when: { questionId: filingQuestionId, choiceIds: [`${filingQuestionId}-${index + 1}`] },
      }];
    }
    const wrongDocument = option.kind === "wrong-document";
    const defective = option.kind === "defect";
    const prompt = wrongDocument
      ? "Defense moves to dismiss because the People filed a motion in limine but no charge or probable-cause statement. What do you do?"
      : defective
        ? "Defense challenges the CI's signature and the missing sworn probable-cause statement. How should the People respond?"
        : "Defense moves to dismiss the unsupported count you selected. What is the proper response?";
    const correctText = wrongDocument
      ? "Acknowledge that the motion did not commence the case, consult the supervisor, and seek to file a proper CI and sworn statement only through the procedure the Court permits."
      : "Acknowledge the defect, consult the supervisor, and seek only a correction or new filing the rule permits without prejudicing the defendant; do not proceed on an unsupported count.";
    return [{
      id: `${mockCase.id}-defense-response-${index + 1}`,
      competency: "motions",
      prompt,
      facts: `The defense relies on the filing you selected: ${option.explanation}`,
      sourceIds: ["rule-5", "rule-12"],
      choices: [
        { id: `${mockCase.id}-response-${index + 1}-1`, text: "Insist the filing is valid because it was uploaded to the DAO portal.", explanation: "Portal upload does not cure a defective court filing.", criticalError: true },
        { id: `${mockCase.id}-response-${index + 1}-2`, text: "Hide the defect and proceed as though the proper document was filed.", explanation: "The People must not conceal a material defect.", criticalError: true },
        { id: `${mockCase.id}-response-${index + 1}-3`, text: correctText, explanation: "This addresses the problem openly and respects Rule 5(d) and the defendant's rights." },
        { id: `${mockCase.id}-response-${index + 1}-4`, text: "Delete the filing from the case record without notifying the Court.", explanation: "The court record must remain accurate.", criticalError: true },
      ],
      correctChoiceId: `${mockCase.id}-response-${index + 1}-3`,
      when: { questionId: filingQuestionId, choiceIds: [`${filingQuestionId}-${index + 1}`] },
    }];
  });

  return { ...mockCase, questions: [filingQuestion, ...attackQuestions, ...mockCase.questions] };
}

function addPleaDecision(mockCase: MockCase): MockCase {
  const accepted = PLEA_READY_CASES.has(mockCase.id);
  const position = stableChoicePosition(`${mockCase.id}:plea`);
  const options = accepted ? [
    { text: "After mapping admissible proof to every element, request the relevant CADA's approval and offer a proportionate plea to the supported count. Do not promise immunity or a result.", good: true, explanation: "For this simulation, the disclosed evidence proves each element beyond a reasonable doubt. The offer is proportionate and approved by the supervising CADA; the defense accepts." },
    { text: "Threaten the maximum sentence unless the defendant pleads to every proposed count, including unsupported ones.", good: false, explanation: "An offer must reflect the evidence and offense, not use unsupported counts as leverage." },
    { text: "Promise immunity and a pardon without asking anyone.", good: false, explanation: "The Justice Manual reserves immunity to the District Attorney; a prosecutor cannot promise a pardon." },
    { text: "Offer a deal before reviewing the full disclosure and evidence inventory.", good: false, explanation: "The offer must follow a fair assessment of the evidence." },
  ] : [
    { text: "Do not offer a plea on this record yet. Disclose the unresolved material, investigate the identified gap, and decline or narrow any count the evidence cannot prove.", good: true, explanation: "The packet leaves a material proof gap. A plea cannot replace proof; the People should not bargain as though the missing element were established." },
    { text: "Offer the highest charge anyway and ask the defendant to resolve the uncertainty by pleading.", good: false, explanation: "The People must assess whether the evidence supports each element before offering a plea." },
    { text: "Hide the favorable or missing-source information until after the plea is entered.", good: false, explanation: "Covered material must be disclosed; an offer cannot depend on concealment." },
    { text: "Promise immunity to make the offer more attractive.", good: false, explanation: "The Justice Manual reserves immunity to the District Attorney." },
  ];
  const ordered = [...options];
  [ordered[0], ordered[position]] = [ordered[position]!, ordered[0]!];
  const questionId = `${mockCase.id}-plea-offer`;
  const choices = ordered.map((option, index) => ({
    id: `${questionId}-${index + 1}`,
    text: option.text,
    explanation: option.explanation,
    ...(!option.good ? { criticalError: true } : {}),
  })) as [Choice, Choice, Choice, Choice];
  const pleaQuestion: Question = {
    id: questionId,
    competency: "procedure",
    prompt: "Final pretrial conference: decide whether to offer a plea.",
    facts: accepted
      ? "The packet has been fully reviewed and favorable material disclosed. For this exercise, admissible evidence proves each element of the supported count beyond a reasonable doubt. The Justice Manual requires a fair assessment and approval from the relevant Chief Assistant District Attorney."
      : "The packet still has an unresolved evidentiary gap identified in the charging and trial decisions. Do not treat probable cause as proof beyond a reasonable doubt. A plea must serve justice and be based on a fair assessment of the evidence.",
    sourceIds: ["justice-manual", "rule-11", ...mockCase.sourceIds.filter((id) => !id.startsWith("rule-"))],
    choices,
    correctChoiceId: `${questionId}-${position + 1}`,
  };
  const explanation = accepted
    ? "The defense accepts the approved, proportionate offer in this simulation because the disclosed admissible evidence proves the supported count beyond a reasonable doubt."
    : "No plea is offered on this record. You identified the proof gap and preserved the option to investigate, narrow, or decline the charge.";
  return { ...mockCase, pleaDisposition: { accepted, explanation }, questions: [...mockCase.questions, pleaQuestion] };
}

export const PILOT_MOCK_CASES: MockCase[] = BASE_MOCK_CASES.map((mockCase) => addPleaDecision(addFilingChoice(mockCase)));
