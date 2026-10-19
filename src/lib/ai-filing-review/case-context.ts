export type CaseDocumentRecord = {
  title: string;
  pdfFileName: string | null;
  status: string;
  createdAt: Date;
};

export type CaseDocumentContext = {
  documents: Array<{
    source: "CASE_FILING" | "LINKED_AOPC";
    title: string;
    fileName: string | null;
    status: string;
  }>;
  totalRecords: number;
  omittedRecords: number;
};

const MAX_CONTEXT_DOCUMENTS = 40;
const PROBABLE_CAUSE_NAME = /\bAOPC\b|\b(?:statement|affidavit)\s+of\s+probable\s+cause\b|\bprobable\s+cause\s+(?:statement|affidavit)\b/i;

export function isProbableCauseCompanion(document: CaseDocumentContext["documents"][number]): boolean {
  return document.source === "LINKED_AOPC" || PROBABLE_CAUSE_NAME.test(`${document.title} ${document.fileName ?? ""}`);
}

export function buildCaseDocumentContext(
  filings: CaseDocumentRecord[],
  linkedAopcs: CaseDocumentRecord[],
): CaseDocumentContext {
  const documents = [
    ...filings.map((filing) => ({
      source: "CASE_FILING" as const,
      title: filing.title.slice(0, 160),
      fileName: filing.pdfFileName?.slice(0, 160) ?? null,
      status: filing.status,
      createdAt: filing.createdAt,
    })),
    ...linkedAopcs.map((aopc) => ({
      source: "LINKED_AOPC" as const,
      title: aopc.title.slice(0, 160),
      fileName: aopc.pdfFileName?.slice(0, 160) ?? null,
      status: aopc.status,
      createdAt: aopc.createdAt,
    })),
  ];
  documents.sort((a, b) => Number(isProbableCauseCompanion(b)) - Number(isProbableCauseCompanion(a)) || b.createdAt.getTime() - a.createdAt.getTime());
  return {
    documents: documents.slice(0, MAX_CONTEXT_DOCUMENTS).map((document) => ({
      source: document.source,
      title: document.title,
      fileName: document.fileName,
      status: document.status,
    })),
    totalRecords: documents.length,
    omittedRecords: Math.max(0, documents.length - MAX_CONTEXT_DOCUMENTS),
  };
}

const ABSENCE_WORDS = /\b(?:missing|absent|unaccompanied|not\s+(?:attached|included|provided|filed|present|found|accompanied)|without|lacks?|no)\b/i;
const COMPANION_WORDS = /\bAOPC\b|\b(?:statement|affidavit)\s+of\s+probable\s+cause\b|\bprobable\s+cause\s+(?:statement|affidavit)\b|\b(?:accompanying|supporting)\s+(?:statement|affidavit|document)\b/i;

export function claimsMissingCompanion(value: string): boolean {
  return ABSENCE_WORDS.test(value) && COMPANION_WORDS.test(value);
}
