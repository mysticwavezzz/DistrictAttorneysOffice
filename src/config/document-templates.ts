export interface DocumentTemplate {
  id: string;
  title: string;
  category: string;
  pdfPath: string;
  editUrl: string;
  copyUrl: string;
}

const templates: Omit<DocumentTemplate, "pdfPath">[] = [
  {
    id: "criminal-information",
    title: "Criminal Information (CI)",
    category: "Charging Pleading",
    editUrl: "https://docs.google.com/document/d/1o-FkKe27efZafkKJt7kb0t96sASaiU20PNnnmCsOGK4/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/1o-FkKe27efZafkKJt7kb0t96sASaiU20PNnnmCsOGK4/copy",
  },
  {
    id: "probable-cause",
    title: "Statement of Probable Cause (Rule 2.1(b))",
    category: "Probable Cause",
    editUrl: "https://docs.google.com/document/d/1OXiRpeQ27-HDHI-eMgiLPNMzfrJZAbdizhwa2x7GuCk/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/1OXiRpeQ27-HDHI-eMgiLPNMzfrJZAbdizhwa2x7GuCk/copy",
  },
  {
    id: "witness-statements-notice",
    title: "Notification of Reports Summarizing Witnesses Oral Statements",
    category: "Discovery (Rule 3.3)",
    editUrl: "https://docs.google.com/document/d/14tSmJkx0tb0C5rI9OL7_Gcf_3ZFxNdU51EsQAQ1P3iE/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/14tSmJkx0tb0C5rI9OL7_Gcf_3ZFxNdU51EsQAQ1P3iE/copy",
  },
  {
    id: "witness-list",
    title: "List of Witnesses",
    category: "Discovery (Rule 3.3)",
    editUrl: "https://docs.google.com/document/d/1CNiYKRJ3tN8dJBKIbsQIoWVwr4sFHQ-XBojidaLmjJs/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/1CNiYKRJ3tN8dJBKIbsQIoWVwr4sFHQ-XBojidaLmjJs/copy",
  },
  {
    id: "defendant-statements",
    title: "Statements of the Defendant",
    category: "Discovery (Rule 3.3)",
    editUrl: "https://docs.google.com/document/d/1Z046nw2j-1bFvDU7999RP5X42RY6YSMhph25PzpUxsg/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/1Z046nw2j-1bFvDU7999RP5X42RY6YSMhph25PzpUxsg/copy",
  },
  {
    id: "evidence-disclosure",
    title: "Physical or Audio-Visual Evidence Disclosure",
    category: "Discovery (Rule 3.3)",
    editUrl: "https://docs.google.com/document/d/1LwfWndEvRiIIsax_XjERbPJjqolM8c_5NqLsfib_L58/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/1LwfWndEvRiIIsax_XjERbPJjqolM8c_5NqLsfib_L58/copy",
  },
  {
    id: "criminal-arrests-record",
    title: "Record of Criminal Arrests",
    category: "Discovery (Rule 3.3)",
    editUrl: "https://docs.google.com/document/d/1hx33MISssCfxsz93jHjqvBMUa4CwljJnHjZHSAtcvF8/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/1hx33MISssCfxsz93jHjqvBMUa4CwljJnHjZHSAtcvF8/copy",
  },
  {
    id: "pretrial-release",
    title: "Petition to Restrict Pretrial Release (Bail / Detention)",
    category: "Motions & Release",
    editUrl: "https://docs.google.com/document/d/1kCXSSY8ZdLJz6kpgRHhf7ArzMSiS-lmbV893O-_i12I/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/1kCXSSY8ZdLJz6kpgRHhf7ArzMSiS-lmbV893O-_i12I/copy",
  },
  {
    id: "motion-in-limine",
    title: "Motion in Limine (Evidentiary Exclusion)",
    category: "Trial Motions",
    editUrl: "https://docs.google.com/document/d/1CtW6mP6Ch0YVQ-zqGfIhcV3MztDCyEgx3Sme98S5Z9U/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/1CtW6mP6Ch0YVQ-zqGfIhcV3MztDCyEgx3Sme98S5Z9U/copy",
  },
  {
    id: "intervention-stay",
    title: "Motion to Intervene and Stay (Civil Parallel Action)",
    category: "Civil / Intervention",
    editUrl: "https://docs.google.com/document/d/1xUowAsrsY-0SSAFOPzdTvRNfmx_hqQgycUFVQyao3CY/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/1xUowAsrsY-0SSAFOPzdTvRNfmx_hqQgycUFVQyao3CY/copy",
  },
  {
    id: "substitution-judge",
    title: "Motion for Substitution of Judge",
    category: "Pretrial Motions",
    editUrl: "https://docs.google.com/document/d/1_r7bMvjRmQl3_odj7BALhLAwErGbsF7ICoezMdnKv6U/edit",
    copyUrl: "https://docs.google.com/document/d/1_r7bMvjRmQl3_odj7BALhLAwErGbsF7ICoezMdnKv6U/copy",
  },
  {
    id: "rule-to-show-cause",
    title: "Petition for Rule to Show Cause (Contempt / Sanctions)",
    category: "Special Proceedings",
    editUrl: "https://docs.google.com/document/d/1SvVDlz15R-erq9koBdKT3JDZY1iY039veIIW3jvzylY/edit",
    copyUrl: "https://docs.google.com/document/d/1SvVDlz15R-erq9koBdKT3JDZY1iY039veIIW3jvzylY/copy",
  },
  {
    id: "search-warrant",
    title: "Application & Affidavit for Search & Seizure Warrant",
    category: "Warrants",
    editUrl: "https://docs.google.com/document/d/131u9pm7G3cEKYt9T4FzXCUHBNr7fQjSP8Y9396YAhwU/edit",
    copyUrl: "https://docs.google.com/document/d/131u9pm7G3cEKYt9T4FzXCUHBNr7fQjSP8Y9396YAhwU/copy",
  },
  {
    id: "subpoena",
    title: "Subpoena Duces Tecum / Witness Subpoena",
    category: "Subpoenas & Process",
    editUrl: "https://docs.google.com/document/d/1Zt20YELERpx1iErthvy_eqlWCl8kPUZEKUjXqEqqtWQ/edit",
    copyUrl: "https://docs.google.com/document/d/1Zt20YELERpx1iErthvy_eqlWCl8kPUZEKUjXqEqqtWQ/copy",
  },
  {
    id: "gang-designation",
    title: "Petition for Criminal Street Gang Designation / Injunction",
    category: "Special Proceedings",
    editUrl: "https://docs.google.com/document/d/1cvndoN9bHyp6hj-eJyVlrLqD_RCM9zDjTLePF4YnsXg/edit",
    copyUrl: "https://docs.google.com/document/d/1cvndoN9bHyp6hj-eJyVlrLqD_RCM9zDjTLePF4YnsXg/copy",
  },
  {
    id: "lawyer-development-affidavit",
    title: "Affidavit in Support of Lawyer Development (Rule 2.2)",
    category: "Administrative / Bar",
    editUrl: "https://docs.google.com/document/d/1_3QTx_gNme6XbenSK0svMTBDOTZRtHGtu8I4-Gmcw6c/edit",
    copyUrl: "https://docs.google.com/document/d/1_3QTx_gNme6XbenSK0svMTBDOTZRtHGtu8I4-Gmcw6c/copy",
  },
  {
    id: "plea-guilty",
    title: "Plea of Guilty (Negotiated Plea Disposition)",
    category: "Plea & Sentencing",
    editUrl: "https://docs.google.com/document/d/16hOLwJH0nmEtYppzpiSqWDJBs-19JuYn9HfCMscZN6w/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/16hOLwJH0nmEtYppzpiSqWDJBs-19JuYn9HfCMscZN6w/copy",
  },
  {
    id: "sentencing-order",
    title: "Order of Sentencing (Judgment Entry)",
    category: "Disposition & Orders",
    editUrl: "https://docs.google.com/document/d/1mlWmwpnLj-e9-Nhs4mbjQoW6D-BVQ_m50EWNcOJH0yo/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/1mlWmwpnLj-e9-Nhs4mbjQoW6D-BVQ_m50EWNcOJH0yo/copy",
  },
  {
    id: "appeal-rights",
    title: "Notice of Appeal Rights (Negotiated Plea)",
    category: "Post-Trial / Appeals",
    editUrl: "https://docs.google.com/document/d/12fAoO5PSuE-eYqCQ-fQB66ry25eOm6A2mVullHubYCM/edit?usp=sharing",
    copyUrl: "https://docs.google.com/document/d/12fAoO5PSuE-eYqCQ-fQB66ry25eOm6A2mVullHubYCM/copy",
  },
];

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = templates.map((template) => ({
  ...template,
  pdfPath: `/da-templates/${template.id}.pdf`,
}));

export function getDocumentTemplate(id: string): DocumentTemplate | undefined {
  return DOCUMENT_TEMPLATES.find((template) => template.id === id);
}
