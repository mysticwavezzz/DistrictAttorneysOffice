export type DocumentFieldType = "text" | "textarea" | "date" | "number" | "select";

export interface DocumentField {
  id: string;
  label: string;
  type: DocumentFieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: string[];
}

export interface DocumentFieldGroup {
  id: string;
  pdfRegion?: string;
  label: string;
  hint: string;
  fields: DocumentField[];
  repeatable?: boolean;
}

export interface PdfTextRegion {
  page: number;
  x: number;
  top: number;
  width: number;
  height: number;
  fontSize?: number;
}

export interface DocumentTemplate {
  id: string;
  title: string;
  category: string;
  pdfPath: string;
  editUrl: string;
  copyUrl: string;
  sections: DocumentFieldGroup[];
  /** White-out and replacement boxes measured against the supplied DA PDF. */
  pdfRegions: Record<string, PdfTextRegion>;
}

const f = (id: string, label: string, type: DocumentFieldType = "text", required = true, help?: string, placeholder?: string): DocumentField => ({ id, label, type, required, help, placeholder });
const s = (id: string, label: string, hint: string, fields: DocumentField[], repeatable = false, pdfRegion?: string): DocumentFieldGroup => ({ id, label, hint, fields, repeatable, pdfRegion });

const commonSignatureFields = [
  f("filingDate", "Filing date", "date", true),
  f("attorneyName", "Filing attorney name", "text", true, "Printed in the signature block."),
  f("barId", "Bar or staff ID", "text", false, "Optional identification printed below the attorney name."),
];

const commonCaptionFields = [
  f("caseNumber", "Case / action number", "text", true),
  f("plaintiff", "Plaintiff", "text", true),
  f("defendant", "Defendant", "text", true),
];

const commonRegions: Record<string, PdfTextRegion> = {
  caseNumber: { page: 0, x: 72, top: 37, width: 172, height: 16, fontSize: 9 },
  plaintiff: { page: 0, x: 249, top: 151, width: 120, height: 16, fontSize: 9 },
  defendant: { page: 0, x: 243, top: 215, width: 126, height: 16, fontSize: 9 },
};

const formDefinitions: Omit<DocumentTemplate, "pdfPath">[] = [
  {
    id: "criminal-information", title: "Criminal Information (CI)", category: "Charging Pleading",
    editUrl: "https://docs.google.com/document/d/1o-FkKe27efZafkKJt7kb0t96sASaiU20PNnnmCsOGK4/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/1o-FkKe27efZafkKJt7kb0t96sASaiU20PNnnmCsOGK4/copy",
    sections: [
      s("defendant", "Defendant details", "Confirm the person named in the charging paper.", [f("defendantUsername", "Exact Roblox username"), f("defendantUserId", "Roblox user ID", "text", false)]),
      s("counts", "Counts and charges", "Add one count at a time. Each count prints as a separate, numbered charge.", [f("statute", "Code section / statute"), f("offenseLevel", "Offense level", "select", true, undefined, undefined), f("charge", "Offense name"), f("offenseDate", "Offense date", "date"), f("chargingLanguage", "Charging language", "textarea", true, "Describe the alleged conduct for this count.")], true),
      s("signature", "Signature", "Complete the filing date and the attorney signature information.", commonSignatureFields),
    ],
    pdfRegions: { ...commonRegions, defendantDetails: { page: 0, x: 72, top: 338, width: 468, height: 23, fontSize: 9 }, counts: { page: 0, x: 72, top: 379, width: 468, height: 160, fontSize: 8.5 }, signature: { page: 0, x: 310, top: 628, width: 230, height: 62, fontSize: 9 } },
  },
  {
    id: "probable-cause", title: "Statement of Probable Cause (Rule 2.1(b))", category: "Probable Cause",
    editUrl: "https://docs.google.com/document/d/1OXiRpeQ27-HDHI-eMgiLPNMzfrJZAbdizhwa2x7GuCk/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/1OXiRpeQ27-HDHI-eMgiLPNMzfrJZAbdizhwa2x7GuCk/copy",
    sections: [s("details", "Affiant and incident", "Identify the affiant and the event under investigation.", [f("affiant", "Affiant name"), f("defendantUsername", "Subject / defendant username"), f("incidentDate", "Incident date", "date"), f("incidentLocation", "Incident location", "text", true)]), s("facts", "Probable-cause facts", "Enter the facts in chronological order. Use one field per fact paragraph.", [f("facts", "Facts supporting probable cause", "textarea", true)], true), s("signature", "Signature", "Complete the filing date and prosecutor details.", commonSignatureFields)],
    pdfRegions: { ...commonRegions, narrative: { page: 0, x: 72, top: 378, width: 468, height: 94, fontSize: 9 }, signature: { page: 0, x: 310, top: 545, width: 230, height: 72, fontSize: 9 } },
  },
  {
    id: "witness-statements-notice", title: "Notification of Reports Summarizing Witnesses Oral Statements", category: "Discovery (Rule 3.3)",
    editUrl: "https://docs.google.com/document/d/14tSmJkx0tb0C5rI9OL7_Gcf_3ZFxNdU51EsQAQ1P3iE/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/14tSmJkx0tb0C5rI9OL7_Gcf_3ZFxNdU51EsQAQ1P3iE/copy",
    sections: [s("disclosure", "Disclosure", "Record when the statements were disclosed and to whom.", [f("disclosureDate", "Disclosure date", "date"), f("recipient", "Disclosure recipient"), f("serviceMethod", "How copies were provided", "text", false)]), s("statements", "Witness statement records", "Add each witness statement or report covered by this notice.", [f("witness", "Witness name"), f("statementDate", "Statement date", "date"), f("description", "Report or statement description", "textarea")], true), s("signature", "Signature", "Complete the filing date and attorney details.", commonSignatureFields)],
    pdfRegions: { ...commonRegions, reports: { page: 0, x: 84, top: 400, width: 456, height: 92, fontSize: 8.5 }, signature: { page: 0, x: 310, top: 648, width: 230, height: 66, fontSize: 9 } },
  },
  {
    id: "witness-list", title: "List of Witnesses", category: "Discovery (Rule 3.3)",
    editUrl: "https://docs.google.com/document/d/1CNiYKRJ3tN8dJBKIbsQIoWVwr4sFHQ-XBojidaLmjJs/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/1CNiYKRJ3tN8dJBKIbsQIoWVwr4sFHQ-XBojidaLmjJs/copy",
    sections: [s("witnesses", "Witnesses", "Enter each witness separately, with their role and expected testimony.", [f("name", "Witness name"), f("role", "Witness role", "select", true, undefined, undefined), f("department", "Department / agency", "text", false), f("testimony", "Expected testimony", "textarea", false)], true), s("signature", "Signature", "Complete the filing date and attorney details.", commonSignatureFields)],
    pdfRegions: { ...commonRegions, witnesses: { page: 0, x: 84, top: 379, width: 456, height: 104, fontSize: 8.5 }, signature: { page: 0, x: 310, top: 642, width: 230, height: 68, fontSize: 9 } },
  },
  {
    id: "defendant-statements", title: "Statements of the Defendant", category: "Discovery (Rule 3.3)",
    editUrl: "https://docs.google.com/document/d/1Z046nw2j-1bFvDU7999RP5X42RY6YSMhph25PzpUxsg/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/1Z046nw2j-1bFvDU7999RP5X42RY6YSMhph25PzpUxsg/copy",
    sections: [s("statements", "Defendant statements", "List each statement, including its date and how it was recorded.", [f("date", "Statement date", "date"), f("format", "Format", "select", true, undefined, undefined), f("summary", "Statement summary or transcript reference", "textarea")], true), s("disclosure", "Disclosure", "Record disclosure date and recipient.", [f("disclosureDate", "Disclosure date", "date"), f("recipient", "Disclosure recipient")]), s("signature", "Signature", "Complete the filing date and attorney details.", commonSignatureFields)],
    pdfRegions: { ...commonRegions, statements: { page: 0, x: 84, top: 380, width: 456, height: 78, fontSize: 8.5 }, signature: { page: 0, x: 310, top: 630, width: 230, height: 68, fontSize: 9 } },
  },
  {
    id: "evidence-disclosure", title: "Physical or Audio-Visual Evidence Disclosure", category: "Discovery (Rule 3.3)",
    editUrl: "https://docs.google.com/document/d/1LwfWndEvRiIIsax_XjERbPJjqolM8c_5NqLsfib_L58/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/1LwfWndEvRiIIsax_XjERbPJjqolM8c_5NqLsfib_L58/copy",
    sections: [s("items", "Evidence items", "Add one row for each item disclosed. Do not enter a link instead of the item description.", [f("kind", "Evidence type", "select", true, undefined, undefined), f("description", "Description / report name"), f("date", "Date created or recorded", "date", false), f("time", "In-game time", "text", false), f("recorder", "Recorder / source", "text", false), f("reference", "Exhibit or report ID", "text", false)], true), s("disclosure", "Disclosure details", "Record the disclosure date and recipient.", [f("disclosureDate", "Disclosure date", "date"), f("recipient", "Disclosure recipient")]), s("signature", "Signature", "Complete the filing date and attorney details.", commonSignatureFields)],
    pdfRegions: { ...commonRegions, evidence: { page: 0, x: 84, top: 358, width: 456, height: 220, fontSize: 8.2 }, signature: { page: 1, x: 310, top: 85, width: 230, height: 70, fontSize: 9 } },
  },
  {
    id: "criminal-arrests-record", title: "Record of Criminal Arrests", category: "Discovery (Rule 3.3)",
    editUrl: "https://docs.google.com/document/d/1hx33MISssCfxsz93jHjqvBMUa4CwljJnHjZHSAtcvF8/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/1hx33MISssCfxsz93jHjqvBMUa4CwljJnHjZHSAtcvF8/copy",
    sections: [s("person", "Person", "Identify the person whose arrest record is disclosed.", [f("personName", "Name / Roblox username"), f("userId", "Roblox user ID", "text", false)]), s("arrests", "Arrest entries", "Add a separate entry for each arrest. Use N/A only when there are no entries.", [f("date", "Arrest date", "date"), f("charges", "In-game charges", "textarea"), f("caseReference", "Related case or report", "text", false)], true), s("signature", "Signature", "Complete the filing date and attorney details.", commonSignatureFields)],
    pdfRegions: { ...commonRegions, arrests: { page: 0, x: 84, top: 378, width: 456, height: 74, fontSize: 8.5 }, signature: { page: 0, x: 310, top: 600, width: 230, height: 70, fontSize: 9 } },
  },
  {
    id: "pretrial-release", title: "Petition to Restrict Pretrial Release (Bail / Detention)", category: "Motions & Release",
    editUrl: "https://docs.google.com/document/d/1kCXSSY8ZdLJz6kpgRHhf7ArzMSiS-lmbV893O-_i12I/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/1kCXSSY8ZdLJz6kpgRHhf7ArzMSiS-lmbV893O-_i12I/copy",
    sections: [s("grounds", "Reasons for requested restrictions", "Select and explain only the grounds supported by this case.", [f("firearmOrViolence", "Firearm or violent offense basis", "textarea", false), f("communityRisk", "Specific community-safety facts", "textarea", false), f("flightRisk", "Specific flight-risk facts", "textarea", false)]), s("conditions", "Requested conditions", "List the conditions you are asking the court to impose.", [f("conditions", "Requested release conditions", "textarea"), f("firearmLocation", "Location for any firearm restriction", "text", false), f("noContact", "No-contact people / locations", "textarea", false)]), s("signature", "Signature", "Complete the filing date and attorney details.", commonSignatureFields)],
    pdfRegions: { ...commonRegions, grounds: { page: 0, x: 96, top: 378, width: 444, height: 112, fontSize: 8.2 }, conditions: { page: 1, x: 116, top: 317, width: 424, height: 112, fontSize: 8.2 }, signature: { page: 1, x: 310, top: 500, width: 230, height: 68, fontSize: 9 } },
  },
  {
    id: "motion-in-limine", title: "Motion in Limine (Evidentiary Exclusion)", category: "Trial Motions",
    editUrl: "https://docs.google.com/document/d/1CtW6mP6Ch0YVQ-zqGfIhcV3MztDCyEgx3Sme98S5Z9U/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/1CtW6mP6Ch0YVQ-zqGfIhcV3MztDCyEgx3Sme98S5Z9U/copy",
    sections: [s("evidence", "Evidence to exclude", "Identify the exact evidence and why it should not be introduced.", [f("item", "Evidence item / testimony"), f("grounds", "Grounds for exclusion", "textarea"), f("requestedOrder", "Requested order", "textarea", false)], true), s("signature", "Signature", "Complete the filing date and attorney details.", commonSignatureFields)],
    pdfRegions: { ...commonRegions, evidence: { page: 0, x: 84, top: 399, width: 456, height: 62, fontSize: 8.5 }, signature: { page: 0, x: 310, top: 543, width: 230, height: 68, fontSize: 9 } },
  },
  {
    id: "intervention-stay", title: "Motion to Intervene and Stay (Civil Parallel Action)", category: "Civil / Intervention",
    editUrl: "https://docs.google.com/document/d/1xUowAsrsY-0SSAFOPzdTvRNfmx_hqQgycUFVQyao3CY/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/1xUowAsrsY-0SSAFOPzdTvRNfmx_hqQgycUFVQyao3CY/copy",
    sections: [s("related", "Related civil proceeding", "Identify the parallel civil matter and explain the government interest.", [f("relatedCaseNumber", "Related civil case number"), f("court", "Court handling the civil action", "text", false), f("interest", "Interest supporting intervention", "textarea"), f("overlap", "Common questions / overlap", "textarea")]), s("stay", "Requested stay", "State the duration or scope of the requested stay.", [f("stayScope", "Requested stay scope", "textarea"), f("hearingRequested", "Hearing requested", "select", false, undefined, undefined)]), s("signature", "Signature", "Complete the filing date and attorney details.", commonSignatureFields)],
    pdfRegions: { ...commonRegions, related: { page: 1, x: 72, top: 323, width: 468, height: 32, fontSize: 8.5 }, stay: { page: 1, x: 72, top: 365, width: 468, height: 62, fontSize: 8.5 }, signature: { page: 1, x: 310, top: 474, width: 230, height: 68, fontSize: 9 } },
  },
  {
    id: "substitution-judge", title: "Motion for Substitution of Judge", category: "Pretrial Motions",
    editUrl: "https://docs.google.com/document/d/1_r7bMvjRmQl3_odj7BALhLAwErGbsF7ICoezMdnKv6U/edit", copyUrl: "https://docs.google.com/document/d/1_r7bMvjRmQl3_odj7BALhLAwErGbsF7ICoezMdnKv6U/copy",
    sections: [s("assignment", "Current assignment", "Identify the assigned judge and the date the matter was placed on their calendar.", [f("assignedJudge", "Assigned judge"), f("callDate", "Date placed on judge's call", "date"), f("motionDate", "Motion filing date", "date")]), s("grounds", "Basis for substitution", "Explain the case-specific basis for this request.", [f("grounds", "Supporting grounds", "textarea")]), s("signature", "Signature", "Complete the filing date and attorney details.", commonSignatureFields)],
    pdfRegions: { ...commonRegions, assignment: { page: 0, x: 84, top: 379, width: 456, height: 47, fontSize: 8.5 }, grounds: { page: 0, x: 84, top: 426, width: 456, height: 55, fontSize: 8.5 }, signature: { page: 0, x: 310, top: 552, width: 230, height: 68, fontSize: 9 } },
  },
  {
    id: "rule-to-show-cause", title: "Petition for Rule to Show Cause (Contempt / Sanctions)", category: "Special Proceedings",
    editUrl: "https://docs.google.com/document/d/1SvVDlz15R-erq9koBdKT3JDZY1iY039veIIW3jvzylY/edit", copyUrl: "https://docs.google.com/document/d/1SvVDlz15R-erq9koBdKT3JDZY1iY039veIIW3jvzylY/copy",
    sections: [s("respondent", "Person and order", "Identify the person, order, or obligation at issue.", [f("person", "Person / respondent"), f("order", "Order or obligation", "textarea"), f("orderDate", "Order date", "date")]), s("reasons", "Reasons to show cause", "List the specific conduct and supporting facts.", [f("reasons", "Supporting facts", "textarea")]), s("relief", "Requested relief", "State the action requested from the court.", [f("relief", "Requested rule or sanction", "textarea")]), s("signature", "Signature", "Complete the filing date and attorney details.", commonSignatureFields)],
    pdfRegions: { ...commonRegions, respondent: { page: 0, x: 72, top: 337, width: 468, height: 27, fontSize: 8.5 }, reasons: { page: 0, x: 84, top: 379, width: 456, height: 53, fontSize: 8.5 }, relief: { page: 0, x: 84, top: 457, width: 456, height: 42, fontSize: 8.5 }, signature: { page: 0, x: 310, top: 500, width: 230, height: 68, fontSize: 9 } },
  },
  {
    id: "search-warrant", title: "Application & Affidavit for Search & Seizure Warrant", category: "Warrants",
    editUrl: "https://docs.google.com/document/d/131u9pm7G3cEKYt9T4FzXCUHBNr7fQjSP8Y9396YAhwU/edit", copyUrl: "https://docs.google.com/document/d/131u9pm7G3cEKYt9T4FzXCUHBNr7fQjSP8Y9396YAhwU/copy",
    sections: [s("target", "Search target", "Enter the person and places precisely as they appear in-game.", [f("targetName", "Person to be searched"), f("targetUserId", "Roblox user ID", "text", false), f("propertyAddress", "Property / address"), f("propertyTown", "Town", "text", false), f("residenceOf", "Residence of"), f("otherTargets", "Additional people / vehicles", "textarea", false)]), s("basis", "Probable cause and items", "State the sworn facts and list the items sought.", [f("affidavit", "Affidavit facts", "textarea"), f("itemsSought", "Items to be seized", "textarea")]), s("execution", "Execution and judicial approval", "Complete the warrant deadline and location. Judicial fields may be left blank for the court.", [f("executeBy", "Execute by", "date"), f("judgeName", "Authorizing judge", "text", false), f("judgeUsername", "Judge username", "text", false), f("executionLocation", "Warrant location", "text", false), f("judgeTitle", "Judicial title", "text", false)]), s("signature", "Applicant signature", "Complete the filing date and attorney details.", commonSignatureFields)],
    pdfRegions: { caseNumber: { page: 0, x: 249, top: 120, width: 154, height: 20, fontSize: 9 }, target: { page: 0, x: 246, top: 165, width: 154, height: 28, fontSize: 8.5 }, person: { page: 0, x: 84, top: 313, width: 210, height: 24, fontSize: 8.5 }, property: { page: 0, x: 84, top: 367, width: 456, height: 32, fontSize: 8.5 }, additionalTargets: { page: 1, x: 84, top: 123, width: 456, height: 43, fontSize: 8.5 }, affidavit: { page: 1, x: 84, top: 202, width: 456, height: 43, fontSize: 8.5 }, itemsSought: { page: 1, x: 84, top: 255, width: 456, height: 113, fontSize: 8.5 }, execution: { page: 1, x: 72, top: 386, width: 468, height: 126, fontSize: 8.5 }, applicantSignature: { page: 1, x: 310, top: 550, width: 230, height: 68, fontSize: 9 } },
  },
  {
    id: "subpoena", title: "Subpoena Duces Tecum / Witness Subpoena", category: "Subpoenas & Process",
    editUrl: "https://docs.google.com/document/d/1Zt20YELERpx1iErthvy_eqlWCl8kPUZEKUjXqEqqtWQ/edit", copyUrl: "https://docs.google.com/document/d/1Zt20YELERpx1iErthvy_eqlWCl8kPUZEKUjXqEqqtWQ/copy",
    sections: [s("recipient", "Recipient and appearance", "Enter who must appear, where, and when.", [f("recipient", "Person / agency / records custodian"), f("judgeName", "Presiding judge"), f("appearanceDate", "Appearance / return date", "date"), f("appearanceTime", "Appearance time", "text", false), f("location", "Appearance location", "text", false)]), s("materials", "Requested testimony or records", "Specify exactly what the subpoena requests.", [f("requestType", "Request type", "select", true, undefined, undefined), f("materials", "Documents / testimony requested", "textarea")]), s("signature", "Issuing attorney", "Complete the filing date and attorney details.", commonSignatureFields)],
    pdfRegions: { ...commonRegions, recipient: { page: 0, x: 72, top: 300, width: 468, height: 25, fontSize: 8.5 }, appearance: { page: 0, x: 72, top: 339, width: 468, height: 48, fontSize: 8.5 }, materials: { page: 0, x: 72, top: 418, width: 468, height: 70, fontSize: 8.5 }, secondaryNotice: { page: 1, x: 72, top: 345, width: 468, height: 56, fontSize: 8.5 }, signature: { page: 1, x: 310, top: 450, width: 230, height: 68, fontSize: 9 } },
  },
  {
    id: "gang-designation", title: "Petition for Criminal Street Gang Designation / Injunction", category: "Special Proceedings",
    editUrl: "https://docs.google.com/document/d/1cvndoN9bHyp6hj-eJyVlrLqD_RCM9zDjTLePF4YnsXg/edit", copyUrl: "https://docs.google.com/document/d/1cvndoN9bHyp6hj-eJyVlrLqD_RCM9zDjTLePF4YnsXg/copy",
    sections: [s("organization", "Organization", "Identify the group and supporting investigation.", [f("organizationName", "Organization / group name"), f("groupId", "Group ID", "text", false), f("investigativeReport", "Investigative report reference", "text", false)]), s("prongs", "Supporting prongs", "Add case-specific information for each finding requested.", [f("criminalIntent", "Evidence of criminal intent", "textarea"), f("uniform", "Uniform / organization indicators", "textarea"), f("reasonablePerson", "Totality of circumstances", "textarea"), f("unlawfulOperation", "Evidence of unlawful operation", "textarea")]), s("signature", "Signature", "Complete the filing date and attorney details.", commonSignatureFields)],
    pdfRegions: { ...commonRegions, organization: { page: 0, x: 230, top: 197, width: 160, height: 24, fontSize: 8.5 }, prongs: { page: 3, x: 145, top: 132, width: 395, height: 174, fontSize: 8.2 }, signature: { page: 3, x: 310, top: 460, width: 230, height: 70, fontSize: 9 } },
  },
  {
    id: "lawyer-development-affidavit", title: "Affidavit in Support of Lawyer Development (Rule 2.2)", category: "Administrative / Bar",
    editUrl: "https://docs.google.com/document/d/1_3QTx_gNme6XbenSK0svMTBDOTZRtHGtu8I4-Gmcw6c/edit", copyUrl: "https://docs.google.com/document/d/1_3QTx_gNme6XbenSK0svMTBDOTZRtHGtu8I4-Gmcw6c/copy",
    sections: [s("student", "Student attorney", "Identify the employee requesting provisional practice.", [f("studentName", "Student / provisional employee name"), f("studentStatus", "Bar status", "select", true, undefined, undefined)]), s("supervisor", "Supervising attorney", "Identify the attorney accepting responsibility.", [f("supervisorName", "Supervising attorney name"), f("barId", "Bar ID", "text", false), f("proceedings", "Proceedings / cases covered", "textarea", false)]), s("signature", "Signature", "Complete the filing date and signatures.", commonSignatureFields)],
    pdfRegions: { ...commonRegions, participants: { page: 0, x: 100, top: 365, width: 425, height: 205, fontSize: 8.5 }, signatures: { page: 1, x: 72, top: 132, width: 468, height: 152, fontSize: 8.5 } },
  },
  {
    id: "plea-guilty", title: "Plea of Guilty (Negotiated Plea Disposition)", category: "Plea & Sentencing",
    editUrl: "https://docs.google.com/document/d/16hOLwJH0nmEtYppzpiSqWDJBs-19JuYn9HfCMscZN6w/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/16hOLwJH0nmEtYppzpiSqWDJBs-19JuYn9HfCMscZN6w/copy",
    sections: [s("plea", "Plea and charges", "Identify the charges and negotiated terms acknowledged in this plea.", [f("attorney", "Defendant's attorney"), f("charges", "Charges covered", "textarea"), f("terms", "Negotiated terms", "textarea"), f("factualBasis", "Factual basis", "textarea", false)]), s("acknowledgment", "Acknowledgment", "Complete the date and defendant signature name.", [f("pleaDate", "Plea date", "date"), f("defendantSignature", "Defendant signing name")]), s("signature", "Prosecution signature", "Complete filing date and prosecutor details.", commonSignatureFields)],
    pdfRegions: { ...commonRegions, attorney: { page: 0, x: 72, top: 318, width: 468, height: 40, fontSize: 8.5 }, charges: { page: 0, x: 96, top: 360, width: 444, height: 105, fontSize: 8.5 }, acknowledgment: { page: 0, x: 72, top: 585, width: 468, height: 40, fontSize: 8.5 } },
  },
  {
    id: "sentencing-order", title: "Order of Sentencing (Judgment Entry)", category: "Disposition & Orders",
    editUrl: "https://docs.google.com/document/d/1mlWmwpnLj-e9-Nhs4mbjQoW6D-BVQ_m50EWNcOJH0yo/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/1mlWmwpnLj-e9-Nhs4mbjQoW6D-BVQ_m50EWNcOJH0yo/copy",
    sections: [s("disposition", "Disposition", "Enter the conviction and the sentence ordered.", [f("judgmentDate", "Judgment date", "date"), f("statute", "Statute / offense"), f("jailMinutes", "Jail time (minutes)", "number"), f("fineAmount", "Fine amount", "number", false), f("payee", "Fine payable to", "text", false), f("otherTerms", "Other sentence terms", "textarea", false)]), s("signatures", "Court and party signatures", "Provide known signatories. Leave judicial signers blank until entered by the court.", [f("judgeName", "County judge", "text", false), f("attorneyName", "Assistant district attorney"), f("defenseCounsel", "Defendant's counsel", "text", false), f("defendantSignature", "Defendant", "text", false)])],
    pdfRegions: { ...commonRegions, sentence: { page: 0, x: 84, top: 294, width: 456, height: 155, fontSize: 8.4 }, signatures: { page: 0, x: 72, top: 548, width: 468, height: 130, fontSize: 8.5 } },
  },
  {
    id: "appeal-rights", title: "Notice of Appeal Rights (Negotiated Plea)", category: "Post-Trial / Appeals",
    editUrl: "https://docs.google.com/document/d/12fAoO5PSuE-eYqCQ-fQB66ry25eOm6A2mVullHubYCM/edit?usp=sharing", copyUrl: "https://docs.google.com/document/d/12fAoO5PSuE-eYqCQ-fQB66ry25eOm6A2mVullHubYCM/copy",
    sections: [s("judgment", "Judgment details", "Identify the judgment and attorney who advised the defendant.", [f("defendantAttorney", "Defendant's attorney"), f("judgmentDate", "Judgment / sentence date", "date")]), s("acknowledgment", "Acknowledgment", "Enter the date and defendant name for the acknowledgment block.", [f("acknowledgmentDate", "Acknowledgment date", "date"), f("defendantSignature", "Defendant signing name")]), s("signature", "Filing attorney", "Complete the filing date and attorney details.", commonSignatureFields)],
    pdfRegions: { ...commonRegions, attorney: { page: 0, x: 72, top: 318, width: 468, height: 25, fontSize: 8.5 }, acknowledgment: { page: 1, x: 72, top: 196, width: 468, height: 32, fontSize: 8.5 } },
  },
];

const selectOptions: Record<string, string[]> = {
  offenseLevel: ["Felony", "Misdemeanor"],
  role: ["Investigator", "Victim", "Witness", "Expert", "Other"],
  format: ["Written statement", "Audio recording", "Video recording", "Transcript", "Report summary", "Other"],
  kind: ["Written document", "Audio recording", "Video recording", "Image", "Physical evidence", "Other"],
  hearingRequested: ["Yes", "No"],
  studentStatus: ["Provisional employee", "Bar examination submitted", "Bar applicant"],
  requestType: ["Witness subpoena", "Subpoena duces tecum", "Both testimony and records"],
};

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = formDefinitions.map((template) => ({
  ...template,
  pdfPath: `/da-templates/${template.id}.pdf`,
  sections: template.sections.map((group) => ({
    ...group,
    fields: group.fields.map((field) => ({ ...field, options: selectOptions[field.id] })),
  })),
}));

export function getDocumentTemplate(id: string): DocumentTemplate | undefined {
  return DOCUMENT_TEMPLATES.find((template) => template.id === id);
}
