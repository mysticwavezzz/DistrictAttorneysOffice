"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { runAiFilingReview } from "@/app/dashboard/review/ai-filing-review-actions";

type ReviewRun = { status: string; createdAt: Date; resultJson: string | null; failureCode: string | null };
type Finding = { kind: string; title: string; detail: string; page: number | null; evidenceQuote: string; authorityQuote: string; citation: string | null; evidenceVerified: boolean; authorityEvidenceVerified: boolean };
type ContextDocument = { source: string; title: string; fileName: string | null; status: string };
type DisplayResult = { recommendation: string; summary: string; rationale: string; findings: Finding[]; caseDocuments: { totalRecords: number; omittedRecords: number; documents: ContextDocument[] } | null };

function parseAiReview(value: string | null): DisplayResult | null {
  if (!value) return null;
  try {
    const raw: unknown = JSON.parse(value);
    if (!raw || typeof raw !== "object") return null;
    const data = raw as Record<string, unknown>;
    if (typeof data.recommendation !== "string" || typeof data.summary !== "string" || !Array.isArray(data.verifiedFindings)) return null;
    const context = data.caseDocumentContext && typeof data.caseDocumentContext === "object" ? data.caseDocumentContext as Record<string, unknown> : null;
    const contextDocuments = Array.isArray(context?.documents) ? context.documents.flatMap((entry): ContextDocument[] => {
      if (!entry || typeof entry !== "object") return [];
      const document = entry as Record<string, unknown>;
      if (typeof document.title !== "string" || typeof document.status !== "string" || typeof document.source !== "string") return [];
      return [{ source: document.source, title: document.title, status: document.status, fileName: typeof document.fileName === "string" ? document.fileName : null }];
    }) : [];
    const findings = data.verifiedFindings.flatMap((entry): Finding[] => {
      if (!entry || typeof entry !== "object") return [];
      const finding = entry as Record<string, unknown>;
      if (typeof finding.kind !== "string" || typeof finding.title !== "string" || typeof finding.detail !== "string") return [];
      return [{
        kind: finding.kind,
        title: finding.title,
        detail: finding.detail,
        page: typeof finding.page === "number" ? finding.page : null,
        evidenceQuote: typeof finding.evidenceQuote === "string" ? finding.evidenceQuote : "",
        authorityQuote: typeof finding.authorityQuote === "string" ? finding.authorityQuote : "",
        citation: typeof finding.citation === "string" ? finding.citation : null,
        evidenceVerified: finding.evidenceVerified === true,
        authorityEvidenceVerified: finding.authorityEvidenceVerified === true,
      }];
    });
    return {
      recommendation: data.recommendation,
      summary: data.summary,
      rationale: typeof data.rationale === "string" ? data.rationale : "The saved result predates the context-and-assessment explanation.",
      findings,
      caseDocuments: context ? {
        totalRecords: typeof context.totalRecords === "number" ? context.totalRecords : contextDocuments.length,
        omittedRecords: typeof context.omittedRecords === "number" ? context.omittedRecords : 0,
        documents: contextDocuments,
      } : null,
    };
  } catch {
    return null;
  }
}
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export function FilingAiReviewPanel({ filingId, configured, review, autoStart, autoEligible }: { filingId: string; configured: boolean; review: ReviewRun | null; autoStart: boolean; autoEligible: boolean }) {
  const router = useRouter();
  const started = useRef(false);
  const [startFailed, setStartFailed] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [rerunFailed, setRerunFailed] = useState(false);
  const result = review?.status === "COMPLETED" ? parseAiReview(review.resultJson) : null;

  async function rerunReview() {
    const formData = new FormData();
    formData.set("id", filingId);
    setRerunning(true);
    setRerunFailed(false);
    try {
      await runAiFilingReview(formData);
      router.refresh();
    } catch {
      setRerunFailed(true);
    } finally {
      setRerunning(false);
    }
  }

  useEffect(() => {
    if (!configured || !autoStart || started.current) return;
    started.current = true;
    const formData = new FormData();
    formData.set("id", filingId);
    void runAiFilingReview(formData).catch(() => {
      setStartFailed(true);
      router.refresh();
    });
  }, [autoStart, configured, filingId, router]);

  useEffect(() => {
    if (review?.status !== "RUNNING") return;
    const timeout = window.setTimeout(() => router.refresh(), 8_000);
    return () => window.clearTimeout(timeout);
  }, [review?.status, review?.createdAt, router]);

  return <section className="filing-ai-review" aria-label="AI advisory pre-screen">
    <h3>Automatic AI pre-screen · advisory only</h3>
    <p className="note-inline">The system reviews extracted PDF text against its curated source excerpts. It cannot make filing decisions; staff must verify the PDF and cited rule.</p>
    {!configured ? <p className="note-inline">Automatic review is not configured. An administrator must configure the server-side AI provider.</p> : review?.status === "RUNNING" ? <p className="note-inline" role="status">Automatic pre-screen is running.</p> : review ? null : !autoEligible ? <p className="note-inline">The submitter cannot pre-screen their own filing. A reviewer must inspect it manually.</p> : startFailed ? <p className="note-inline" role="alert">Automatic pre-screen did not start. Please inspect the PDF and make the filing decision manually.</p> : autoStart ? <p className="note-inline" role="status">Starting automatic pre-screen…</p> : <p className="note-inline" role="status">Queued for automatic pre-screen. This inbox processes filings one at a time.</p>}
    <p className="note-inline">Extracted PDF text is sent to the configured AI provider and may contain sensitive case details. The review is limited to authorized staff, and the model never approves or returns a filing.</p>
    {review && <div className="filing-ai-review-result">
      <p><strong>Latest run:</strong> {review.status === "COMPLETED" ? "Complete" : review.status === "RUNNING" ? "Running" : failureMessage(review.failureCode)} · {dateFormat.format(review.createdAt)}</p>
      {review.status === "COMPLETED" && (result ? <>
        <p><strong>Recommendation (not a decision):</strong> {result.recommendation.replaceAll("_", " ")}</p>
        <p>{result.summary}</p>
        <p><strong>Context &amp; assessment:</strong> {result.rationale}</p>
        {!result.caseDocuments && <p className="note-inline" role="status">This result predates the same-case document check. Run the pre-screen again before relying on any companion-document finding.</p>}
        {result.caseDocuments && <details className="review-aopc-detail"><summary>Other case records considered ({result.caseDocuments.totalRecords})</summary>
          <p className="note-inline">Titles and review statuses only. The pre-screen did not read these companion documents or check unlinked records.</p>
          {result.caseDocuments.documents.length > 0 ? <ul>{result.caseDocuments.documents.map((document, index) => <li key={`${document.source}-${index}`}>{document.title} · {document.status} · {document.source === "LINKED_AOPC" ? "Linked AOPC" : "Case filing"}{document.fileName ? ` · ${document.fileName}` : ""}</li>)}</ul> : <p className="note-inline">No other case records were linked when this pre-screen ran.</p>}
          {result.caseDocuments.omittedRecords > 0 && <p className="note-inline">{result.caseDocuments.omittedRecords} additional records were omitted from the AI context limit.</p>}
        </details>}
        {result.findings.length > 0 ? <ul>{result.findings.map((finding, index) => <li key={`${finding.title}-${index}`}>
          <strong>{finding.kind.replaceAll("_", " ")}: {finding.title}</strong>{finding.page !== null && <> · page {finding.page}</>}<br/>
          {finding.detail}<br/>{finding.citation ?? "No verified authority citation."}
          {finding.evidenceVerified ? <blockquote>{finding.evidenceQuote}</blockquote> : <p className="note-inline">The quoted evidence could not be matched to extracted PDF text; treat this item as unverified.</p>}
          {finding.authorityEvidenceVerified && <blockquote>Rule excerpt: {finding.authorityQuote}</blockquote>}
          {finding.kind === "POSSIBLE_DEFECT" && !finding.authorityEvidenceVerified && <p className="note-inline">The cited rule quote could not be matched to the curated source excerpt; do not rely on this finding.</p>}
        </li>)}</ul> : <p className="note-inline">No checklist findings were returned. This is not a legal-sufficiency determination.</p>}
      </> : <p className="note-inline">Saved result could not be parsed. Review the PDF manually before deciding.</p>)}
      {review.status === "FAILED" && <p className="note-inline" role="alert">Automatic pre-screen did not complete. No AI recommendation was produced; inspect the filing manually.</p>}
      {review.status !== "RUNNING" && <><p className="note-inline">If companion filings changed after this run, run the pre-screen again to use the current case record.</p><button type="button" className="govbtn-outline" disabled={rerunning} onClick={() => void rerunReview()}>{rerunning ? "Running pre-screen…" : "Run pre-screen again"}</button>{rerunFailed && <p className="note-inline" role="alert">Could not start a new pre-screen. Refresh this page and check whether a new run appeared before retrying.</p>}</>}
    </div>}
  </section>;
}

function failureMessage(code: string | null): string {
  switch (code) {
    case "PDF_NO_TEXT": return "No selectable PDF text was found. Review the document manually; scanned PDFs are not analyzed.";
    case "PDF_UNREADABLE": return "The PDF could not be read. Review it manually or upload a readable copy.";
    case "PDF_TOO_MANY_PAGES": return "This PDF exceeds the pre-screen page limit. Review it manually.";
    case "PDF_TEXT_TOO_LONG": return "This PDF exceeds the pre-screen text limit. Review it manually.";
    case "MISSING_API_KEY": return "AI pre-screen is not configured. Ask an administrator to check the server setup.";
    case "REVIEW_TIMED_OUT": return "The pre-screen timed out. Review the filing manually.";
    case "MODEL_UNAVAILABLE":
    case "EMPTY_MODEL_OUTPUT": return "The pre-screen could not complete. Review the PDF manually.";
    default: return "The pre-screen could not complete. Review the PDF manually.";
  }
}
