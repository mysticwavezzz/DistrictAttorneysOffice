export interface DocumentSection {
  id: string;
  label: string;
  hint: string;
  required?: boolean;
}

export interface DocumentTemplate {
  id: string;
  title: string;
  category: string;
  pdfPath: string;
  editUrl: string;
  copyUrl: string;
  sections: DocumentSection[];
}

const section = (id: string, label: string, hint: string, required = true): DocumentSection => ({ id, label, hint, required });

const sectionsByTemplate: Record<string, DocumentSection[]> = {
  "criminal-information": [
    section("defendant", "Defendant information", "Enter the defendant's exact Roblox username and user ID."),
    section("counts", "Counts and charges", "Add each count with its statute, offense level, date, and charging language."),
    section("signature", "Date and prosecution", "Enter the filing date and attorney names for the signature block."),
  ],
  "probable-cause": [
    section("affiant", "Affiant and case details", "Identify the affiant, case number, defendant, and incident date."),
    section("facts", "Statement of facts", "Enter the facts supporting probable cause in clear chronological paragraphs."),
    section("conclusion", "Conclusion and signature", "Review the conclusion, date, and affiant/prosecutor signature details."),
  ],
  "witness-statements-notice": [
    section("case", "Case and disclosure details", "Identify the case, parties, and disclosure date."),
    section("reports", "Witness reports", "List each witness and the report summarizing their oral statement."),
    section("service", "Notice and service", "Add the notice text and service or distribution details."),
  ],
  "witness-list": [
    section("witnesses", "Witnesses", "Add one paragraph per witness with their name and identifying details."),
    section("subjects", "Expected testimony", "Describe the subject areas for each witness, if included in the template."),
    section("filing", "Filing details", "Add case and filing information required by the source document."),
  ],
  "defendant-statements": [
    section("statements", "Defendant statements", "Describe or index each statement and identify its date."),
    section("recordings", "Recording and transcript details", "List associated recordings, transcripts, or report references."),
    section("disclosure", "Disclosure details", "Add the case, parties, and disclosure/service information."),
  ],
  "evidence-disclosure": [
    section("items", "Evidence items", "Describe each physical or audio-visual item being disclosed."),
    section("custody", "Custody and format", "Identify the evidence format and relevant custody or source details."),
    section("inspection", "Inspection or access", "Explain how and when the evidence may be inspected or accessed."),
  ],
  "criminal-arrests-record": [
    section("person", "Person and identifier", "Identify the person whose arrest record is being disclosed."),
    section("entries", "Arrest record entries", "Add each arrest entry and its source details."),
    section("verification", "Source and verification", "Explain the source and date used to verify this record."),
  ],
  "pretrial-release": [
    section("grounds", "Requested restrictions", "State the release restrictions requested and the grounds for them."),
    section("support", "Supporting facts", "Add the case-specific facts supporting the requested restrictions."),
    section("mandate", "Requested mandate", "Review the conditions and requested order in the source template."),
  ],
  "motion-in-limine": [
    section("evidence", "Evidence at issue", "Identify each item, statement, or testimony addressed by the motion."),
    section("grounds", "Grounds", "Explain the grounds for exclusion and relevant case context."),
    section("relief", "Relief requested", "State the precise order requested from the court."),
  ],
  "intervention-stay": [
    section("proceeding", "Related proceeding", "Identify the civil proceeding and related case details."),
    section("interest", "Interest and grounds", "Describe the interest supporting intervention and grounds for a stay."),
    section("relief", "Relief requested", "State the precise relief requested."),
  ],
  "substitution-judge": [
    section("basis", "Basis for the motion", "Enter the basis for requesting substitution of the assigned judge."),
    section("history", "Procedural history", "Add relevant dates and procedural history."),
    section("relief", "Relief requested", "State the precise relief requested."),
  ],
  "rule-to-show-cause": [
    section("order", "Order or directive", "Identify the order or directive at issue and its date."),
    section("conduct", "Conduct and supporting facts", "Describe the alleged conduct and supporting record."),
    section("relief", "Relief requested", "State the rule, response, or sanction requested."),
  ],
  "search-warrant": [
    section("place", "Place or person to be searched", "Precisely identify the place, person, or property described in the application."),
    section("items", "Items sought", "List the items or evidence sought."),
    section("probable-cause", "Supporting facts and oath", "Enter the factual basis and affiant details required by the source form."),
  ],
  subpoena: [
    section("recipient", "Recipient and appearance", "Identify the recipient, appearance date, time, and location."),
    section("materials", "Testimony or materials", "Describe the testimony requested or documents to be produced."),
    section("service", "Service details", "Add service and issuing attorney information required by the source form."),
  ],
  "gang-designation": [
    section("designation", "Requested designation", "Identify the requested designation or injunction."),
    section("allegations", "Supporting allegations", "Enter the supporting allegations and referenced materials."),
    section("relief", "Relief requested", "State the precise relief requested."),
  ],
  "lawyer-development-affidavit": [
    section("experience", "Experience and development", "Describe the relevant experience and development."),
    section("facts", "Supporting facts", "Add the facts supporting the affidavit."),
    section("affirmation", "Affirmation", "Review the affirmation, date, and signature details."),
  ],
  "plea-guilty": [
    section("charge", "Charge and plea", "Identify the charge and plea being entered."),
    section("terms", "Negotiated terms", "List the negotiated terms and conditions."),
    section("basis", "Factual basis and acknowledgment", "Enter the factual basis and required acknowledgments."),
  ],
  "sentencing-order": [
    section("disposition", "Disposition", "Record the disposition entered by the court."),
    section("sentence", "Sentence and conditions", "Enter the sentence and any conditions ordered."),
    section("entry", "Entry and judicial signature", "Add entry date and judicial signature details."),
  ],
  "appeal-rights": [
    section("notice", "Notice and advisement", "Enter the required notice and advisement for the negotiated plea."),
    section("acknowledgment", "Acknowledgment", "Record the party's acknowledgment as provided by the source form."),
    section("signatures", "Date and signatures", "Complete the date and signature details."),
  ],
};

const templates: Omit<DocumentTemplate, "pdfPath" | "sections">[] = [
  { id: "criminal-information", title: "Criminal Information (CI)", category: "Charging Pleading", editUrl: "https://docs.google.com/document/d/1o-FkKe27efZafkKJt7kb0t96sASaiU20PNnnmCsOGK4/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/1o-FkKe27efZafkKJt7kb0t96sASaiU20PNnnmCsOGK4/copy" },
  { id: "probable-cause", title: "Statement of Probable Cause (Rule 2.1(b))", category: "Probable Cause", editUrl: "https://docs.google.com/document/d/1OXiRpeQ27-HDHI-eMgiLPNMzfrJZAbdizhwa2x7GuCk/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/1OXiRpeQ27-HDHI-eMgiLPNMzfrJZAbdizhwa2x7GuCk/copy" },
  { id: "witness-statements-notice", title: "Notification of Reports Summarizing Witnesses Oral Statements", category: "Discovery (Rule 3.3)", editUrl: "https://docs.google.com/document/d/14tSmJkx0tb0C5rI9OL7_Gcf_3ZFxNdU51EsQAQ1P3iE/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/14tSmJkx0tb0C5rI9OL7_Gcf_3ZFxNdU51EsQAQ1P3iE/copy" },
  { id: "witness-list", title: "List of Witnesses", category: "Discovery (Rule 3.3)", editUrl: "https://docs.google.com/document/d/1CNiYKRJ3tN8dJBKIbsQIoWVwr4sFHQ-XBojidaLmjJs/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/1CNiYKRJ3tN8dJBKIbsQIoWVwr4sFHQ-XBojidaLmjJs/copy" },
  { id: "defendant-statements", title: "Statements of the Defendant", category: "Discovery (Rule 3.3)", editUrl: "https://docs.google.com/document/d/1Z046nw2j-1bFvDU7999RP5X42RY6YSMhph25PzpUxsg/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/1Z046nw2j-1bFvDU7999RP5X42RY6YSMhph25PzpUxsg/copy" },
  { id: "evidence-disclosure", title: "Physical or Audio-Visual Evidence Disclosure", category: "Discovery (Rule 3.3)", editUrl: "https://docs.google.com/document/d/1LwfWndEvRiIIsax_XjERbPJjqolM8c_5NqLsfib_L58/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/1LwfWndEvRiIIsax_XjERbPJjqolM8c_5NqLsfib_L58/copy" },
  { id: "criminal-arrests-record", title: "Record of Criminal Arrests", category: "Discovery (Rule 3.3)", editUrl: "https://docs.google.com/document/d/1hx33MISssCfxsz93jHjqvBMUa4CwljJnHjZHSAtcvF8/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/1hx33MISssCfxsz93jHjqvBMUa4CwljJnHjZHSAtcvF8/copy" },
  { id: "pretrial-release", title: "Petition to Restrict Pretrial Release (Bail / Detention)", category: "Motions & Release", editUrl: "https://docs.google.com/document/d/1kCXSSY8ZdLJz6kpgRHhf7ArzMSiS-lmbV893O-_i12I/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/1kCXSSY8ZdLJz6kpgRHhf7ArzMSiS-lmbV893O-_i12I/copy" },
  { id: "motion-in-limine", title: "Motion in Limine (Evidentiary Exclusion)", category: "Trial Motions", editUrl: "https://docs.google.com/document/d/1CtW6mP6Ch0YVQ-zqGfIhcV3MztDCyEgx3Sme98S5Z9U/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/1CtW6mP6Ch0YVQ-zqGfIhcV3MztDCyEgx3Sme98S5Z9U/copy" },
  { id: "intervention-stay", title: "Motion to Intervene and Stay (Civil Parallel Action)", category: "Civil / Intervention", editUrl: "https://docs.google.com/document/d/1xUowAsrsY-0SSAFOPzdTvRNfmx_hqQgycUFVQyao3CY/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/1xUowAsrsY-0SSAFOPzdTvRNfmx_hqQgycUFVQyao3CY/copy" },
  { id: "substitution-judge", title: "Motion for Substitution of Judge", category: "Pretrial Motions", editUrl: "https://docs.google.com/document/d/1_r7bMvjRmQl3_odj7BALhLAwErGbsF7ICoezMdnKv6U/edit", copyUrl: "https://docs.google.com/document/d/1_r7bMvjRmQl3_odj7BALhLAwErGbsF7ICoezMdnKv6U/copy" },
  { id: "rule-to-show-cause", title: "Petition for Rule to Show Cause (Contempt / Sanctions)", category: "Special Proceedings", editUrl: "https://docs.google.com/document/d/1SvVDlz15R-erq9koBdKT3JDZY1iY039veIIW3jvzylY/edit", copyUrl: "https://docs.google.com/document/d/1SvVDlz15R-erq9koBdKT3JDZY1iY039veIIW3jvzylY/copy" },
  { id: "search-warrant", title: "Application & Affidavit for Search & Seizure Warrant", category: "Warrants", editUrl: "https://docs.google.com/document/d/131u9pm7G3cEKYt9T4FzXCUHBNr7fQjSP8Y9396YAhwU/edit", copyUrl: "https://docs.google.com/document/d/131u9pm7G3cEKYt9T4FzXCUHBNr7fQjSP8Y9396YAhwU/copy" },
  { id: "subpoena", title: "Subpoena Duces Tecum / Witness Subpoena", category: "Subpoenas & Process", editUrl: "https://docs.google.com/document/d/1Zt20YELERpx1iErthvy_eqlWCl8kPUZEKUjXqEqqtWQ/edit", copyUrl: "https://docs.google.com/document/d/1Zt20YELERpx1iErthvy_eqlWCl8kPUZEKUjXqEqqtWQ/copy" },
  { id: "gang-designation", title: "Petition for Criminal Street Gang Designation / Injunction", category: "Special Proceedings", editUrl: "https://docs.google.com/document/d/1cvndoN9bHyp6hj-eJyVlrLqD_RCM9zDjTLePF4YnsXg/edit", copyUrl: "https://docs.google.com/document/d/1cvndoN9bHyp6hj-eJyVlrLqD_RCM9zDjTLePF4YnsXg/copy" },
  { id: "lawyer-development-affidavit", title: "Affidavit in Support of Lawyer Development (Rule 2.2)", category: "Administrative / Bar", editUrl: "https://docs.google.com/document/d/1_3QTx_gNme6XbenSK0svMTBDOTZRtHGtu8I4-Gmcw6c/edit", copyUrl: "https://docs.google.com/document/d/1_3QTx_gNme6XbenSK0svMTBDOTZRtHGtu8I4-Gmcw6c/copy" },
  { id: "plea-guilty", title: "Plea of Guilty (Negotiated Plea Disposition)", category: "Plea & Sentencing", editUrl: "https://docs.google.com/document/d/16hOLwJH0nmEtYppzpiSqWDJBs-19JuYn9HfCMscZN6w/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/16hOLwJH0nmEtYppzpiSqWDJBs-19JuYn9HfCMscZN6w/copy" },
  { id: "sentencing-order", title: "Order of Sentencing (Judgment Entry)", category: "Disposition & Orders", editUrl: "https://docs.google.com/document/d/1mlWmwpnLj-e9-Nhs4mbjQoW6D-BVQ_m50EWNcOJH0yo/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/1mlWmwpnLj-e9-Nhs4mbjQoW6D-BVQ_m50EWNcOJH0yo/copy" },
  { id: "appeal-rights", title: "Notice of Appeal Rights (Negotiated Plea)", category: "Post-Trial / Appeals", editUrl: "https://docs.google.com/document/d/12fAoO5PSuE-eYqCQ-fQB66ry25eOm6A2mVullHubYCM/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/12fAoO5PSuE-eYqCQ-fQB66ry25eOm6A2mVullHubYCM/copy" },
];

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = templates.map((template) => ({
  ...template,
  pdfPath: `/da-templates/${template.id}.pdf`,
  sections: sectionsByTemplate[template.id] ?? [],
}));

export function getDocumentTemplate(id: string): DocumentTemplate | undefined {
  return DOCUMENT_TEMPLATES.find((template) => template.id === id);
}
