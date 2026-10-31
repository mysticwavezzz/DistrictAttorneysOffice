import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { effectiveOnboardingRank, requiresCriminalDivisionGroupForOrientation, requiresCriminalDivisionOrientation } from "@/lib/onboarding-policy";
import { acknowledgeOrientation } from "./actions";
import { staffPageMetadata } from "@/lib/staff-metadata";

export const metadata = staffPageMetadata("Criminal Division Orientation", "Required, practical orientation for Criminal Division attorneys.", "/dashboard/orientation");

const JUSTICE_MANUAL = "https://drive.google.com/file/d/1ki6cBI_IWBHMavUpDM45sgA_ayviuBB8/view";
const CRIMINAL_RULES = "https://hackmd.io/aRLtX1mRT1GsheNyP1eUIg";
const CODE_OF_STATUTES = "https://docs.google.com/spreadsheets/d/1djyPYIhVZFxuS9ifpqu85d2Zr0T18ndRk9tNrE__BAY/edit?usp=sharing";
const CI_TEMPLATE = "https://docs.google.com/document/d/1yD1dZAkKRrfJUT1KcloSHOjJmSbYSbjF7Ut0n57DZWM/edit";
const DISCOVERY_TEMPLATE = "https://docs.google.com/document/d/1o8NMAcqizxGzl_idEB3w7HhUjO7BZ91eZma4Ou03Tio/edit";
const RESPONSE_TEMPLATE = "https://docs.google.com/document/d/1S4K5Cpw06thFh9Fv8qMPl6M5yEQSfYpC2eQJEe56Hrc/edit";

const modules: Array<{
  title: string;
  citation: string;
  intro: string;
  steps: string[];
  example?: string;
  checklist?: string[];
  link?: { label: string; href: string };
}> = [
  {
    title: "1. The office, your authority, and who decides what",
    citation: "Justice Manual §§ 1-2, 1-5, 4-1 to 4-3",
    intro: "The portal gives you tools. It does not enlarge your authority. A case assignment makes you responsible for the work shown in the record; office-wide decisions and charging approvals remain with the officials named in the Manual.",
    steps: [
      "Read the assignment, bureau, group, supervisor, and current case stage before doing case work. If one is missing or conflicts with the referral, ask the supervisor to resolve it and record the confirmed assignment.",
      "Route a case about a government or municipal official or someone entrusted with public trust to Public Integrity; a criminal enterprise or multi-actor criminal activity to Organized Crime; all other criminal matters to Trial Bureau. When facts overlap, raise the jurisdiction question before filing.",
      "The relevant bureau's Chief Assistant District Attorney approves criminal charges. Plea agreements and deferred prosecutions also require that CADA's approval. Only the District Attorney may grant immunity.",
      "Keep your supervisor informed when a deadline, evidence problem, missed appearance, conflict, or proposed concession could materially affect the case. Do not promise an outcome on behalf of the office without authority.",
    ],
    example: "Before filing: 'I have the case assigned to Trial Bureau. The report is complete, but the sworn statement does not address identity. I have asked the investigator to confirm that fact and have not submitted charges yet.'",
  },
  {
    title: "2. Ethics, conflicts, confidentiality, and professional conduct",
    citation: "Justice Manual §§ 2-1 to 2-5, 3-1 to 3-6",
    intro: "A prosecutor's access to a case carries duties. The Manual bars misuse of office, conflicting financial interests, improper gifts, unauthorized release of protected information, and acting for a defendant charged by this office.",
    steps: [
      "Disclose a personal relationship, financial interest, outside position, or prior involvement that could affect your impartiality. Stop substantive work on the issue until a supervisor tells you how to proceed.",
      "The Manual restricts certain concurrent roles, including law-enforcement work at or above Sergeant and law-enforcement work tasked with investigating criminal offenses. Check §§ 2-4 and 2-5 before taking or continuing a role that could overlap; report the facts to your supervisor.",
      "Treat investigative reports, evidence, witness information, internal discussions, and nonpublic filings as protected. Share case material only through authorized case channels and with people authorized to receive it.",
      "The DA and Deputy DA are the office spokespersons. Refer media questions to them unless they specifically authorize you to speak. Promptly report a suspected unauthorized disclosure or other Manual violation to the DA.",
      "Do not contact a Council member or County Executive about DAO interests or recommend an executive or legislative initiative unless the DA has directly approved it.",
    ],
  },
  {
    title: "3. Open and organize the case before reviewing it",
    citation: "Case-First Workflow; Justice Manual §§ 3-4, 4-2",
    intro: "Create or update the internal case record first. It should be the index to the source material and the action history, not a substitute for reviewing the source material itself.",
    steps: [
      "Confirm the defendant's exact username, referring agency, investigator, incident date, location, proposed counts, case owner, bureau, group, and supervisor. Mark anything uncertain as unverified.",
      "Attach or link the referral, signed probable-cause statement, investigative report, original recordings, exports, statements, photographs, and evidence index. Keep the original filename and say whether each item is an original, copy, edit, screenshot, transcript, or summary.",
      "Write a neutral summary and event timeline. Each entry should identify the date or time, the source, who observed the event, and whether the point is disputed. Separate allegation from confirmed record fact.",
      "Add a witness list and an evidence inventory. For each item, record its source, custodian or creator, date received, condition, access link, disclosure status, and any gap or contradiction.",
      "Record the next required action, its source, the due date, and who owns it. Do not enter a court-filed date merely because a draft was created, submitted internally, approved, or uploaded to Drive.",
    ],
    checklist: ["Case note exists before substantive review", "Correct identity and bureau confirmed", "Source files linked", "Deadlines traced to a rule or order", "Unknown facts labeled, not guessed"],
  },
  {
    title: "4. Read the evidence and build a reliable timeline",
    citation: "Justice Manual §§ 4-2, 4-3, 7-1 to 7-3; Ches. R. Crim. P. 11",
    intro: "Start with the underlying records. A report's conclusion, an exhibit label, or a witness's second-hand summary does not establish what an unseen file contains.",
    steps: [
      "Read the full investigative report and affidavit, then open each available source file. For video, note the file name, duration, start and end, audio, visible usernames, cuts, and whether the original is available.",
      "For every statement, identify who made it, whether it was written, recorded, sworn, summarized, or transcribed, when it was made, and whether a complete source exists. Never call a photo a transcript or an unsworn note a sworn interview.",
      "Compare accounts against each other and against the underlying recording or document. Record inconsistencies and facts that favor the accused with the same care as inculpatory facts.",
      "If the source is missing, edited, incomplete, inaccessible, or inconsistent with the report, ask the investigator for the original and preservation history. Do not describe the source as complete until checked.",
      "Do not infer a spoken statement from silent video, intent from possession alone, identity from an avatar without an account link, or a weapon discharge from an animation without support in the record.",
    ],
    example: "Evidence log entry: 'Exhibit A, 22-second export received Oct. 15 from Officer X. No audio. The report says the original was four minutes; the original is not in the file. Identity and completeness remain unverified.'",
  },
  {
    title: "5. Make the charging decision count by count",
    citation: "Justice Manual §§ 4-2, 4-3; current Code of Statutes; Ches. R. Crim. P. 5",
    intro: "A charge is a legal conclusion drawn from evidence. It is not a reward for a thorough report or a way to gain leverage in negotiations.",
    steps: [
      "Open the current Code of Statutes and copy the exact offense name, citation, classification, and elements. Do not rely on an old spreadsheet export, a remembered section number, or a similar offense from another jurisdiction.",
      "Build an element chart: one row per element; columns for supporting fact, source, contrary fact, and follow-up needed. Identify which witness or exhibit can prove each fact and how it can be presented in court.",
      "Check special facts separately: value threshold, location, weapon, injury, victim status, intent, identity, and any enhancement. Do not use a value estimate that conflicts with a receipt without resolving the conflict.",
      "Compare every proposed count to the conduct and to every other count. Flag duplicate counts, lesser-included offenses, overlapping punishment, jurisdiction, limitations, prior jeopardy, and any unsupported enhancement for supervisor review.",
      "If an element has no reasonable evidentiary support, seek a focused investigation, narrow the proposed charge if authorized, or decline that count. The CADA reviews and approves the final charges.",
    ],
    example: "Element worksheet: 'Intent to deprive — support: account-linked message saying “I am selling it”; source: Exhibit C; contrary evidence: witness allowed defendant to inspect the item; follow-up: obtain the complete interview and full video.'",
  },
  {
    title: "6. Draft the Criminal Information (CI)",
    citation: "Approved DAO Criminal Information template; Ches. R. Crim. P. 5(a)",
    intro: "The CI is the charging paper. Rule 5(a) calls for a plain, concise, and definite statement of the essential facts, signed and presented by a government attorney, with the official or customary legal citation for each count.",
    steps: [
      "Make a copy of the approved CI template. Preserve its caption and formatting. For an initial CI, do not add a presiding-judge line or invent an action number; leave the action number for the Court.",
      "Use one count for each offense. State the exact statute and offense title. In the allegation, identify the defendant, approximate date, place, conduct, and facts that make the charged elements understandable.",
      "Use direct factual language. Avoid argument, evidence summaries, conclusions such as 'clearly guilty,' unnecessary adjectives, unsupported intent, or a list of every detail in the police report.",
      "Compare name, username, date, place, statute, grade, and count number to the original referral and current statute. Confirm the facts support this charge rather than a neighboring offense.",
      "Use the approved attorney signature block. Leave unfilled fields as placeholders only while drafting; remove or complete every placeholder before approval. Do not invent a sworn signature for the officer.",
    ],
    example: "Illustrative structure only: 'On or about [date], in [location], [defendant] is alleged to have [specific conduct], with [element-specific fact], in violation of [exact statute], [offense name].' The bracketed facts must come from the record; this is not a charge to file.",
    link: { label: "Open the Criminal Information template", href: CI_TEMPLATE },
  },
  {
    title: "7. Prepare the separate probable-cause statement (AOPC)",
    citation: "Ches. R. Crim. P. 5(b); approved supporting-affidavit template",
    intro: "The CI and probable-cause statement serve different purposes and stay in separate documents. The officer or other authorized affiant supplies the sworn factual basis; the prosecutor prepares and signs the CI.",
    steps: [
      "Identify the affiant and the basis for their knowledge. The statement must be under oath before a judicial officer or signed under penalty of perjury as Rule 5(b) permits.",
      "Write facts in chronological order. State what the affiant personally did or saw, what a named witness reported, and what a document or recording shows. Attribute each source instead of blending them together.",
      "Tie the facts to the alleged offense and the defendant's identity. Include the facts that support probable cause; do not turn the statement into advocacy or claim the affiant personally observed what they learned from someone else.",
      "Preserve any recording or document on which the statement relies and identify it accurately. If a fact is second-hand, say whose statement it is and how it was obtained.",
      "The actual affiant must review and adopt the statement. Never put words in an officer's mouth, sign for an affiant, or certify facts the signer does not know.",
    ],
    example: "Use source attribution: 'I reviewed the store's recording, which shows [visible event]. Clerk [name] told me [reported fact] during an interview on [date]. I did not personally witness the taking.' Do not claim the video has audio if it does not.",
  },
  {
    title: "8. Reconcile the CI, AOPC, and proposed process",
    citation: "Ches. R. Crim. P. 5(a)-(d), 6",
    intro: "Before submission, confirm the charging paper, sworn support, and requested process describe the same defendant, conduct, dates, location, and offenses.",
    steps: [
      "Read the CI and AOPC side by side. Each CI count should have supporting facts in the AOPC; the AOPC should not silently introduce a different charge or defendant.",
      "Confirm the AOPC identifies the offense and defendant and has an actual oath or valid penalty-of-perjury declaration. An investigative report or an attachment link by itself does not replace it.",
      "If an error is found before filing, correct the draft and have the correct signer review it. If it is already filed, tell the supervisor and address the court record through the procedure the Court permits; do not silently replace the filed copy.",
      "After probable cause is determined, Rule 6 directs the Court to issue a summons in preference to a warrant unless a listed ground supports a warrant. The Court issues and signs the process; do not represent that an unissued warrant exists.",
    ],
    checklist: ["Same defendant and username", "Each count matches the statute", "AOPC facts support each count", "Affiant and oath verified", "No missing attachment or invented number", "Proposed process is for the Court to issue"],
  },
  {
    title: "9. Submit internally, obtain approval, then file with the Court",
    citation: "DAO portal workflow; Ches. R. Crim. P. 3(b), 5",
    intro: "The DAO website, Google Drive, and the clerk's docket are three different records. Only transmission to the clerk, or permitted direct submission to a judge, constitutes filing under Rule 3(b).",
    steps: [
      "Attach each document to the correct DAO case, with a clear document title, correct version, accessible source link, and the required supporting attachments. Keep a CI and AOPC as separate files.",
      "Submit the draft to the review inbox. Resolve edits and obtain the required internal approval. An approval is permission to file; it is not a court filing.",
      "Export the approved court copy to PDF and inspect every page. Check that the signature, caption, counts, attachments, page breaks, hyperlinks, and text are legible and complete.",
      "Transmit the approved version to the clerk or use a judge-directed route allowed by Rule 3(b). Save the sent message, receipt, clerk acknowledgment, or court docket link showing transmission.",
      "Only then enter the actual court-filed date, action number, and court link in the DAO system. Mark 'submitted,' 'approved,' and 'filed' as separate events. A Drive share link alone does not prove that the Court received the filing.",
    ],
    example: "Portal timeline: Oct. 30, 7:12 PM — submitted for DAO review; Oct. 30, 7:40 PM — approved; Oct. 30, 8:03 PM — transmitted to clerk; Oct. 30, 8:05 PM — clerk receipt linked. The final two entries are supported by the actual receipt, not inferred from approval.",
  },
  {
    title: "10. Calculate deadlines and keep the docket current",
    citation: "Ches. R. Crim. P. 3-4, 7, 9-12; case orders",
    intro: "Every deadline needs a source. Do not copy a date from an old case or assume the portal's target date is a court-ordered deadline.",
    steps: [
      "Save the order, rule, notice, or docket event that creates the deadline. Write down the triggering event, the calculation method, due date, timezone, and any order-specific change.",
      "Under Rule 4(a), for periods stated in days, exclude the triggering day, count every day, and include the last day. Unless another rule, statute, or order sets a different time, the last day ends at midnight in the New York City timezone.",
      "Ask the Court for an extension before the deadline expires whenever possible. Rule 4 permits extensions only under its stated good-cause or excusable-neglect terms; do not promise yourself an extension.",
      "After each court session, read the transcript and any written order. Record what the judge actually ordered, who must act, by when, and the next appearance. Distinguish a party's proposal from the Court's ruling.",
      "Keep the assignment and filing status current. If an attorney leaves or a case transfers, update the responsible attorney and handoff information promptly.",
    ],
  },
  {
    title: "11. Summons, warrant, initial appearance, and probable cause",
    citation: "Ches. R. Crim. P. 5(c), 6-8",
    intro: "These are separate steps. An information does not itself prove guilt or authorize an officer to claim that a defendant has been arrested or summoned.",
    steps: [
      "The Court decides whether probable cause exists under Rule 5(c). Under Rule 6, the Court issues a summons or warrant after the required showing; a summons is preferred unless a listed warrant ground applies.",
      "A summons identifies the defendant, describes the charged offense, states when and where to appear, and is accompanied by the information and supporting documents. Track the actual service and proof separately from issuance.",
      "An initial appearance is not a trial or a guilt determination. Rule 7 addresses identity, the charge, rights, counsel, and the next proceeding. Do not argue the merits as if the initial appearance were a trial.",
      "Rule 8's probable-cause hearing is a distinct in-game proceeding with specific custody, request, and availability conditions. Read each subsection before advising on eligibility, timing, or what a judge may consider.",
      "Do not ask the judge to add a new charge during a Rule 8 hearing. If a new or different charge is warranted, use the amendment and probable-cause procedures in Rules 5(d) and 8.",
    ],
  },
  {
    title: "12. Arraignment and the pretrial conference",
    citation: "Ches. R. Crim. P. 9-10",
    intro: "Arraignment advises the defendant of the charges and rights, receives a plea as permitted, and sets the next dates. The pretrial conference narrows the remaining issues and prepares the case for trial or disposition.",
    steps: [
      "Track Rule 9's seven-day arraignment period from filing of the information, indictment, or complaint. If the defendant has not yet been served or summoned, the rule calls for arraignment as soon as practicable.",
      "At arraignment, check that the defendant received the information and supporting documents, counsel is addressed, the plea is recorded by the Court, and the next date is clear. Do not describe an internal meeting as an arraignment.",
      "Before the pretrial conference, exchange or confirm discovery, identify pending motions, witness and exhibit issues, stipulations, requested hearings, and the anticipated trial mode. All proceedings are bench trials under Rule 13.",
      "Bring a short, accurate status: charges; service; discovery produced and outstanding; motions and response dates; witness availability; exhibit issues; plea status; and proposed next steps.",
      "The Court may hear motions and evidentiary issues at the conference or set another hearing. Record the ruling and deadline exactly; do not treat a discussion or tentative view as an order.",
    ],
  },
  {
    title: "13. Discovery: collect, review, describe, produce, supplement",
    citation: "Ches. R. Crim. P. 11; Justice Manual § 3-4",
    intro: "Rule 11 reaches case material in the possession or control of the prosecution team, including participating law-enforcement agencies under prosecutorial direction or control. Review the whole file, not just the items selected for trial.",
    steps: [
      "Collect reports, witness names and accounts, defendant statements, photographs, recordings, messages, physical items, electronically stored material, and material bearing on sentence. Ask the investigators and participating agencies whether anything else exists.",
      "Identify information that tends to negate or reduce guilt, conflicts with a prosecution account, or may bear on credibility. Escalate questions about legal disclosure scope to the supervisor and disclose promptly when required by Rule 11, constitutional authority, or an order.",
      "Make an item-by-item production list. State what the file actually is, its date and source, whether it is a full original or an export, whether it has audio, and how the defense can inspect or copy it.",
      "Open every link as a recipient would. Confirm permissions and that the file loads. A link that works only for the prosecutor is not a usable production. Keep the original and document any redaction or copy made for disclosure.",
      "Record what was sent, when, to whom, and how. If additional responsive material is found before or during trial, promptly supplement under Rule 11(d). Correct an inaccurate prior notice directly and preserve the correction history.",
      "Do not call a photograph a transcript, a summary a recording, an edited clip the original, or an unverified statement sworn. Do not omit favorable material because it weakens the prosecution.",
    ],
    example: "Production entry: 'Exhibit B — 3-page photograph set taken by Officer X on [date]; images of the interview screen, not a transcript or recording. Original image files are available at [working link].'",
    link: { label: "Open the omnibus disclosure template", href: DISCOVERY_TEMPLATE },
  },
  {
    title: "14. Respond to motions and preserve a clean record",
    citation: "Ches. R. Crim. P. 10, 12; Rules of Evidence and applicable orders",
    intro: "A good response answers the motion that was filed. It does not hide a defect, introduce unsupported facts, or brief an issue the defense never raised.",
    steps: [
      "Read the motion, requested relief, attachments, filing date, service, relevant transcript, court orders, and controlling local authority. Identify each claim, the exact exhibit or count it concerns, and the deadline to respond.",
      "Rule 12(a)(2) requires separately numbered grounds and a supporting affidavit from someone with a factual basis. Rule 12(a)(3) gives the opposing party three days to respond. Confirm the current rule and any order before calculating your deadline.",
      "A motion to dismiss and most motions to suppress require a memorandum of law unless the rule's exception or a court order applies. Cite Chesapeake rules and controlling Harrison authority first. Label out-of-jurisdiction sources as persuasive; do not call federal rules binding without local adoption.",
      "For each point, state the record fact, the governing rule, and the requested ruling. Concede a factual error that is true, explain its significance accurately, and identify any correction or remedy the Court may consider.",
      "If the dispute depends on what a recording is, how it was obtained, whether it is complete, or what a witness actually said, ask for a focused hearing when testimony or inspection would help. Do not claim a foundation that has not been established.",
      "Use the approved response template. Serve the other party and file with the clerk as Rule 3 and the court's direction require. Keep filed versions, service proof, and rulings in the case record.",
    ],
    link: { label: "Open the general response template", href: RESPONSE_TEMPLATE },
  },
  {
    title: "15. Witnesses and exhibits",
    citation: "Ches. R. Crim. P. 11, 14; applicable Rules of Evidence",
    intro: "Prepare the proof, not a script for the witness. Before trial, know what each witness can say from personal knowledge and what foundation connects each exhibit to the case.",
    steps: [
      "For each witness, record their role, contact or availability, personal observations, prior accounts, documents or recordings they can identify, conflicts, and any disclosure issue. Provide required witness names to the defense.",
      "Review prior statements with the witness without suggesting a new version. If the account changes, preserve both accounts, ask neutral follow-up questions, document the difference, and disclose it when required.",
      "For each exhibit, identify who created or received it, how it was stored, whether the exhibit is original or a copy, whether it was edited, whether it is complete, and the witness who can explain those facts.",
      "Test exhibits before court: open the file, verify the link permission, check sound and image quality, confirm the portion to be shown, and identify any gap or limitation. Do not call an exhibit authenticated until the foundation is laid.",
      "If a witness is unavailable or a subpoena is needed, follow the current court process and Justice Manual authority. Subpoena requests to SIB go through the Chief Special Investigator; warrant requests are forwarded to the DA for approval.",
    ],
  },
  {
    title: "16. Prepare and conduct the bench trial",
    citation: "Ches. R. Crim. P. 13-14; Guide to Law, burden of proof",
    intro: "A Harrison criminal trial is before the Court without a jury. The People must prove every element beyond a reasonable doubt. A charging paper and probable-cause finding are not trial proof.",
    steps: [
      "Prepare a one-page trial map: each count and element; supporting witness or exhibit; anticipated objection or foundation; contrary evidence; and the answer the record supports.",
      "Opening statement previews expected evidence. Do not argue, promise evidence you may not present, or state that an allegation has already been proven.",
      "On direct examination, establish the witness's identity, opportunity to observe, what they personally saw or heard, how they recognize the defendant or item, and how they identify the exhibit. Ask one focused question at a time.",
      "During cross-examination, listen. Object briefly on a recognized ground and state the ground when required. Do not argue with a witness or interrupt the Court's ruling. If an objection is sustained, move on or rephrase only if permitted.",
      "In closing, take each element in order and cite the admitted evidence that proves it. Address the strongest contrary fact and explain why the evidence still meets the burden, or acknowledge when it does not. Do not rely on excluded evidence, unsworn reports, or personal belief.",
      "Follow the Court's trial order. Rule 14 sets opening, government's case-in-chief, defense cross-examination, defense case, government's cross-examination, closings, verdict, and sentencing unless the Court directs otherwise.",
    ],
  },
  {
    title: "17. Plea offers, deferred prosecution, and immunity",
    citation: "Justice Manual §§ 4-4 to 4-6; Ches. R. Crim. P. 10, 14",
    intro: "A plea can resolve a case fairly and efficiently, but it is not a shortcut around evidence review. The Manual requires CADA approval and a fair assessment of evidence, offense severity, and criminal history.",
    steps: [
      "Before making an offer, review the admissible proof for every element, the strength and limits of the evidence, the harm and seriousness of the conduct, verified criminal history, the victim's position when relevant, and the likely trial posture.",
      "Remove unsupported charges from the negotiation. Do not threaten a charge you cannot support or condition a benefit on waiver of a right the rules protect.",
      "Get the relevant CADA's approval. Write the proposed plea, counts resolved, factual basis, recommended sentence or other terms, expiration if any, and what happens if the offer is rejected. Do not promise acceptance or a court result.",
      "The Court accepts or rejects a plea according to the applicable procedure. Keep the offer and response in authorized channels, and update the case only after the Court records the plea and disposition.",
      "Deferred prosecution requires CADA approval and is generally considered before case initiation when appropriate. The DA alone may grant immunity. Do not offer either on your own.",
    ],
  },
  {
    title: "18. Sentencing and post-trial work",
    citation: "Ches. R. Crim. P. 15-16; current Code of Statutes",
    intro: "A guilty finding does not end the assignment. The sentence, written judgment, probation terms, and any post-trial motion still have to be tracked and recorded accurately.",
    steps: [
      "Check the statute's authorized range and the facts actually proved. Give the Court a recommendation tied to the record and authorized law; distinguish a recommendation from a mandatory term.",
      "Rule 15 requires the Court to give the defendant an opportunity to speak and explain the sentence or probation. Record the actual sentence, start date, credit, conditions, and written order; do not infer missing terms.",
      "Calendar post-trial deadlines from Rule 16 and the actual verdict or finding date. A judgment-of-acquittal or new-trial motion generally has a five-day period; a newly-discovered-evidence new-trial motion has fourteen days. Verify the current text and any order immediately.",
      "If a post-trial motion is filed, read the requested relief and cited record, notify the supervisor, preserve the transcript and exhibits, and respond on the Court's schedule. Do not assume the motion stays sentencing unless the Court orders it.",
      "Close or archive the matter only after the Court's final disposition and required follow-up are recorded. Link the judgment, sentence, and any post-trial order.",
    ],
  },
  {
    title: "19. Handoffs and continuity when counsel changes",
    citation: "Justice Manual § 3-5; DAO case handoff workflow",
    intro: "A case should remain understandable when the assigned attorney is unavailable or leaves. A handoff is a short operational record, not a dump of unorganized links.",
    steps: [
      "State the case name and number, court, defendant, current charges, assigned bureau and attorney, last court event, and present stage.",
      "List the next deadline and its source, upcoming hearing, pending motions, response status, outstanding discovery, service status, and witnesses whose availability is uncertain.",
      "Link every court-filed document and receipt separately from drafts, DAO approvals, and evidence. Identify the current approved version; label superseded copies so they are not filed by mistake.",
      "Flag urgent risks first: missed or approaching deadlines, unresolved identity or charging defect, disclosure not completed, inaccessible evidence, missing affiant, or unaddressed court direction.",
      "The receiving attorney confirms access to evidence and the court channel. The supervisor updates the portal assignment and verifies that the handoff is accepted.",
    ],
  },
  {
    title: "20. A prosecutor's final pre-filing checklist",
    citation: "Justice Manual §§ 3-4, 4-2 to 4-4; Ches. R. Crim. P. 3-6, 11-12",
    intro: "Pause before you send a document. A short check catches the mistakes that cause late corrections, hearings, and avoidable damage to a case.",
    steps: [
      "Authority: right bureau, assigned attorney, supervisor, and required approval confirmed.",
      "Facts: defendant identity, date, location, source attribution, and each material fact checked against the original record.",
      "Law: current statute and rule text checked; each count's elements and any overlap reviewed; outside law labeled accurately.",
      "Document: correct approved template, complete caption, separate CI and AOPC, accurate signature, no invented action number, no internal notes or unresolved placeholders.",
      "Evidence and disclosure: source files open, descriptions accurate, favorable or inconsistent material reviewed, links accessible, production logged, and originals preserved.",
      "Procedure: deadline and service calculated, clerk filing distinguished from DAO review, receipt saved, and portal status updated only to the event that actually occurred.",
    ],
  },
];

export default async function CriminalDivisionOrientationPage() {
  const session = await auth();
  const roster = session?.user?.robloxUserId ? await prisma.rosterEntry.findUnique({ where: { robloxUserId: session.user.robloxUserId }, select: { isActive: true, rank: true, rankOverride: true, orientationPending: true, orientationAcknowledgedAt: true, divisionGroup: true, unit: true } }) : null;
  if (!roster?.isActive || roster.unit !== "Criminal Division") redirect("/dashboard");
  const rank = effectiveOnboardingRank(roster);
  const needsAcknowledgment = requiresCriminalDivisionOrientation(roster);
  const needsGroupPlacement = requiresCriminalDivisionGroupForOrientation(rank);

  return <article className="training-page">
    <p className="eyebrow">Criminal Division · Required onboarding</p>
    <h1>Attorney Orientation</h1>
    <p className="lede">This is a working guide to handling a Harrison County criminal case, from intake through closing. Read each section and use the linked current rules and office manual when a question comes up. If a case-specific order differs, follow the order and tell your supervisor.</p>
    <section className="training-callout orientation-source-box">
      <strong>Keep these sources open while you work</strong>
      <ul>
        <li><a href={JUSTICE_MANUAL} target="_blank" rel="noreferrer">Harrison County Justice Manual</a> — office structure, approvals, ethics, investigations, pleas, and immunity.</li>
        <li><a href={CRIMINAL_RULES} target="_blank" rel="noreferrer">Chesapeake Rules of Criminal Procedure</a> — current filing, charging, summons, discovery, motion, trial, and post-trial procedure.</li>
        <li><a href={CODE_OF_STATUTES} target="_blank" rel="noreferrer">Harrison County Code of Statutes</a> — verify the current offense title, elements, classification, and range.</li>
      </ul>
      <p>Use Harrison County law first. Ridgeway, Clark, federal, and real-world materials may help you understand a concept, but they do not replace current Chesapeake rules or Harrison authority.</p>
    </section>
    <nav className="orientation-index" aria-label="Orientation contents"><strong>In this orientation</strong><ol>{modules.map((module, index) => <li key={module.title}><a href={`#orientation-${index + 1}`}>{module.title.replace(/^\d+\. /, "")}</a></li>)}</ol></nav>
    <ol className="orientation-list orientation-modules">{modules.map((module, index) => <li id={`orientation-${index + 1}`} key={module.title}>
      <span className="orientation-number">{String(index + 1).padStart(2, "0")}</span>
      <div>
        <h2>{module.title.replace(/^\d+\. /, "")}</h2>
        <p className="orientation-citation">{module.citation}</p>
        <p>{module.intro}</p>
        <h3>Work through it</h3>
        <ol>{module.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        {module.example && <div className="orientation-example"><strong>Example</strong><p>{module.example}</p></div>}
        {module.checklist && <div className="orientation-checklist"><strong>Before moving on</strong><ul>{module.checklist.map((item) => <li key={item}>{item}</li>)}</ul></div>}
        {module.link && <p><a href={module.link.href} target="_blank" rel="noreferrer">{module.link.label}</a></p>}
      </div>
    </li>)}</ol>
    <section className="training-callout orientation-acknowledgment-card">
      <h2>Before staff access opens</h2>
      <p>Read the full orientation and confirm that you understand the office workflow. The portal records your acknowledgment. If you have a question about a rule, an assignment, or a case-specific order, ask your supervisor before acting.</p>
      {needsAcknowledgment ? needsGroupPlacement && !roster.divisionGroup ? <p role="alert">Your group placement is not recorded yet. A Criminal Division supervisor must assign a group before you can complete orientation.</p> : <form action={acknowledgeOrientation} className="orientation-acknowledgment"><label><input type="checkbox" name="acknowledged" required /> I have read and understood the Criminal Division orientation.</label><button className="govbtn" type="submit">Acknowledge orientation</button></form> : <p className="orientation-complete">Orientation is acknowledged. <Link href="/dashboard">Return to the staff portal</Link>.</p>}
    </section>
  </article>;
}
