export interface DocumentSection {
  id: string;
  label: string;
  hint: string;
}

export interface DocumentTemplate {
  id: string;
  title: string;
  category: string;
  editUrl?: string;
  copyUrl?: string;
  sections: DocumentSection[];
}

const civilComplaintSections: DocumentSection[] = [
  { id: "claims", label: "Claims for Relief", hint: "Describe each claim in your own words. Add one claim at a time." },
  { id: "demand", label: "Demand for Relief", hint: "State the relief requested. Review the official source template before use." },
];

const sections = (...labels: string[]): DocumentSection[] => labels.map((label, index) => ({
  id: `section-${index + 1}`,
  label,
  hint: "Draft text only. Confirm the applicable local form and requirements before use.",
}));

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  { id: "civil-complaint", title: "Civil Complaint", category: "Civil filings", sections: civilComplaintSections },
  {
    id: "criminal-information", title: "Criminal Information (CI)", category: "Charging Pleading",
    editUrl: "https://docs.google.com/document/d/1o-FkKe27efZafkKJt7kb0t96sASaiU20PNnnmCsOGK4/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/1o-FkKe27efZafkKJt7kb0t96sASaiU20PNnnmCsOGK4/copy",
    sections: sections("Allegations", "Counts and charges", "Requested action"),
  },
  {
    id: "probable-cause", title: "Statement of Probable Cause (Rule 2.1(b))", category: "Probable Cause",
    editUrl: "https://docs.google.com/document/d/1OXiRpeQ27-HDHI-eMgiLPNMzfrJZAbdizhwa2x7GuCk/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/1OXiRpeQ27-HDHI-eMgiLPNMzfrJZAbdizhwa2x7GuCk/copy",
    sections: sections("Incident facts", "Supporting basis", "Affiant statement"),
  },
  {
    id: "witness-statements-notice", title: "Notification of Reports Summarizing Witnesses Oral Statements", category: "Discovery (Rule 3.3)",
    editUrl: "https://docs.google.com/document/d/14tSmJkx0tb0C5rI9OL7_Gcf_3ZFxNdU51EsQAQ1P3iE/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/14tSmJkx0tb0C5rI9OL7_Gcf_3ZFxNdU51EsQAQ1P3iE/copy",
    sections: sections("Witness and report index", "Summary of oral statements", "Disclosure details"),
  },
  {
    id: "witness-list", title: "List of Witnesses", category: "Discovery (Rule 3.3)",
    editUrl: "https://docs.google.com/document/d/1CNiYKRJ3tN8dJBKIbsQIoWVwr4sFHQ-XBojidaLmjJs/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/1CNiYKRJ3tN8dJBKIbsQIoWVwr4sFHQ-XBojidaLmjJs/copy",
    sections: sections("Witness names", "Expected subject areas", "Contact or service notes"),
  },
  {
    id: "defendant-statements", title: "Statements of the Defendant", category: "Discovery (Rule 3.3)",
    editUrl: "https://docs.google.com/document/d/1Z046nw2j-1bFvDU7999RP5X42RY6YSMhph25PzpUxsg/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/1Z046nw2j-1bFvDU7999RP5X42RY6YSMhph25PzpUxsg/copy",
    sections: sections("Statement inventory", "Recording or transcript details", "Disclosure details"),
  },
  {
    id: "evidence-disclosure", title: "Physical or Audio-Visual Evidence Disclosure", category: "Discovery (Rule 3.3)",
    editUrl: "https://docs.google.com/document/d/1LwfWndEvRiIIsax_XjERbPJjqolM8c_5NqLsfib_L58/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/1LwfWndEvRiIIsax_XjERbPJjqolM8c_5NqLsfib_L58/copy",
    sections: sections("Itemized evidence", "Custody and format", "Inspection or access details"),
  },
  {
    id: "criminal-arrests-record", title: "Record of Criminal Arrests", category: "Discovery (Rule 3.3)",
    editUrl: "https://docs.google.com/document/d/1hx33MISssCfxsz93jHjqvBMUa4CwljJnHjZHSAtcvF8/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/1hx33MISssCfxsz93jHjqvBMUa4CwljJnHjZHSAtcvF8/copy",
    sections: sections("Person and identifier", "Arrest record entries", "Source and verification"),
  },
  {
    id: "pretrial-release", title: "Petition to Restrict Pretrial Release (Bail / Detention)", category: "Motions & Release",
    editUrl: "https://docs.google.com/document/d/1kCXSSY8ZdLJz6kpgRHhf7ArzMSiS-lmbV893O-_i12I/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/1kCXSSY8ZdLJz6kpgRHhf7ArzMSiS-lmbV893O-_i12I/copy",
    sections: sections("Requested conditions", "Supporting facts", "Requested order"),
  },
  {
    id: "motion-in-limine", title: "Motion in Limine (Evidentiary Exclusion)", category: "Trial Motions",
    editUrl: "https://docs.google.com/document/d/1CtW6mP6Ch0YVQ-zqGfIhcV3MztDCyEgx3Sme98S5Z9U/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/1CtW6mP6Ch0YVQ-zqGfIhcV3MztDCyEgx3Sme98S5Z9U/copy",
    sections: sections("Evidence or testimony at issue", "Grounds and supporting material", "Relief requested"),
  },
  {
    id: "intervention-stay", title: "Motion to Intervene and Stay (Civil Parallel Action)", category: "Civil / Intervention",
    editUrl: "https://docs.google.com/document/d/1xUowAsrsY-0SSAFOPzdTvRNfmx_hqQgycUFVQyao3CY/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/1xUowAsrsY-0SSAFOPzdTvRNfmx_hqQgycUFVQyao3CY/copy",
    sections: sections("Related proceeding", "Interest and grounds", "Relief requested"),
  },
  {
    id: "substitution-judge", title: "Motion for Substitution of Judge", category: "Pretrial Motions",
    editUrl: "https://docs.google.com/document/d/1_r7bMvjRmQl3_odj7BALhLAwErGbsF7ICoezMdnKv6U/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/1_r7bMvjRmQl3_odj7BALhLAwErGbsF7ICoezMdnKv6U/copy",
    sections: sections("Basis for the motion", "Relevant dates and procedural history", "Relief requested"),
  },
  {
    id: "rule-to-show-cause", title: "Petition for Rule to Show Cause (Contempt / Sanctions)", category: "Special Proceedings",
    editUrl: "https://docs.google.com/document/d/1SvVDlz15R-erq9koBdKT3JDZY1iY039veIIW3jvzylY/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/1SvVDlz15R-erq9koBdKT3JDZY1iY039veIIW3jvzylY/copy",
    sections: sections("Order or directive at issue", "Conduct and supporting facts", "Relief requested"),
  },
  {
    id: "search-warrant", title: "Application & Affidavit for Search & Seizure Warrant", category: "Warrants",
    editUrl: "https://docs.google.com/document/d/131u9pm7G3cEKYt9T4FzXCUHBNr7fQjSP8Y9396YAhwU/edit",
    copyUrl: "https://docs.google.com/document/d/131u9pm7G3cEKYt9T4FzXCUHBNr7fQjSP8Y9396YAhwU/copy",
    sections: sections("Place or person to be searched", "Items sought", "Supporting facts and oath"),
  },
  {
    id: "subpoena", title: "Subpoena Duces Tecum / Witness Subpoena", category: "Subpoenas & Process",
    editUrl: "https://docs.google.com/document/d/1Zt20YELERpx1iErthvy_eqlWCl8kPUZEKUjXqEqqtWQ/edit",
    copyUrl: "https://docs.google.com/document/d/1Zt20YELERpx1iErthvy_eqlWCl8kPUZEKUjXqEqqtWQ/copy",
    sections: sections("Recipient and appearance details", "Requested testimony or materials", "Service details"),
  },
  {
    id: "gang-designation", title: "Petition for Criminal Street Gang Designation / Injunction", category: "Special Proceedings",
    editUrl: "https://docs.google.com/document/d/1cvndoN9bHyp6hj-eJyVlrLqD_RCM9zDjTLePF4YnsXg/edit",
    copyUrl: "https://docs.google.com/document/d/1cvndoN9bHyp6hj-eJyVlrLqD_RCM9zDjTLePF4YnsXg/copy",
    sections: sections("Requested designation or injunction", "Supporting allegations and materials", "Relief requested"),
  },
  {
    id: "lawyer-development-affidavit", title: "Affidavit in Support of Lawyer Development (Rule 2.2)", category: "Administrative / Bar",
    editUrl: "https://docs.google.com/document/d/1_3QTx_gNme6XbenSK0svMTBDOTZRtHGtu8I4-Gmcw6c/edit",
    copyUrl: "https://docs.google.com/document/d/1_3QTx_gNme6XbenSK0svMTBDOTZRtHGtu8I4-Gmcw6c/copy",
    sections: sections("Experience and development", "Supporting facts", "Affirmation"),
  },
  {
    id: "plea-guilty", title: "Plea of Guilty (Negotiated Plea Disposition)", category: "Plea & Sentencing",
    editUrl: "https://docs.google.com/document/d/16hOLwJH0nmEtYppzpiSqWDJBs-19JuYn9HfCMscZN6w/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/16hOLwJH0nmEtYppzpiSqWDJBs-19JuYn9HfCMscZN6w/copy",
    sections: sections("Charge and plea", "Negotiated terms", "Factual basis and acknowledgment"),
  },
  {
    id: "sentencing-order", title: "Order of Sentencing (Judgment Entry)", category: "Disposition & Orders",
    editUrl: "https://docs.google.com/document/d/1mlWmwpnLj-e9-Nhs4mbjQoW6D-BVQ_m50EWNcOJH0yo/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/1mlWmwpnLj-e9-Nhs4mbjQoW6D-BVQ_m50EWNcOJH0yo/copy",
    sections: sections("Disposition", "Sentence and conditions", "Entry date and judicial signature"),
  },
  {
    id: "appeal-rights", title: "Notice of Appeal Rights (Negotiated Plea)", category: "Post-Trial / Appeals",
    editUrl: "https://docs.google.com/document/d/12fAoO5PSuE-eYqCQ-fQB66ry25eOm6A2mVullHubYCM/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/12fAoO5PSuE-eYqCQ-fQB66ry25eOm6A2mVullHubYCM/copy",
    sections: sections("Notice and advisement", "Acknowledgment", "Date and signatures"),
  },
];

export function getDocumentTemplate(id: string): DocumentTemplate | undefined {
  return DOCUMENT_TEMPLATES.find((template) => template.id === id);
}
