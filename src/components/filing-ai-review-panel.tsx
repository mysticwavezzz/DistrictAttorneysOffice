import { runAiFilingReview } from "@/app/dashboard/review/ai-filing-review-actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";

type ReviewRun = { status: string; createdAt: Date; resultJson: string | null; failureCode: string | null };
type Finding = { kind: string; title: string; detail: string; page: number | null; evidenceQuote: string; authorityQuote: string; citation: string | null; evidenceVerified: boolean; authorityEvidenceVerified: boolean };
type DisplayResult = { recommendation: string; summary: string; findings: Finding[] };

function parseAiReview(value: string | null): DisplayResult | null {
  if (!value) return null;
  try {
    const raw: unknown = JSON.parse(value);
    if (!raw || typeof raw !== "object") return null;
    const data = raw as Record<string, unknown>;
    if (typeof data.recommendation !== "string" || typeof data.summary !== "string" || !Array.isArray(data.verifiedFindings)) return null;
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
    return { recommendation: data.recommendation, summary: data.summary, findings };
  } catch {
    return null;
  }
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export function FilingAiReviewPanel({ filingId, configured, review }: { filingId: string; configured: boolean; review: ReviewRun | null }) {
  const result = review?.status === "COMPLETED" ? parseAiReview(review.resultJson) : null;

  return <section className="filing-ai-review" aria-label="AI advisory pre-screen">
    <h3>AI pre-screen · advisory only</h3>
    <p className="note-inline">This sends extracted PDF text to Groq. The model cannot make filing decisions; verify every flag against the PDF and cited rule.</p>
    {!configured ? <p className="note-inline">Not configured. An administrator must configure the server-side AI provider before staff can run a pre-screen.</p> : review?.status === "RUNNING" ? <p className="note-inline" role="status">AI pre-screen is running.</p> : <form action={runAiFilingReview} className="review-aopc-form"><input type="hidden" name="id" value={filingId}/><PendingSubmitButton label="Run AI pre-screen" pendingLabel="Reviewing PDF…" className="govbtn-outline"/></form>}
    <p className="note-inline">The extracted PDF text may contain sensitive case details. Run this only when you are authorized to share the document text with the configured AI provider.</p>
    {review && <div className="filing-ai-review-result">
      <p><strong>Latest run:</strong> {review.status === "COMPLETED" ? "Complete" : review.status === "RUNNING" ? "Running" : failureMessage(review.failureCode)} · {dateFormat.format(review.createdAt)}</p>
      {review.status === "COMPLETED" && (result ? <>
        <p><strong>Recommendation (not a decision):</strong> {result.recommendation.replaceAll("_", " ")}</p>
        <p>{result.summary}</p>
        {result.findings.length > 0 ? <ul>{result.findings.map((finding, index) => <li key={`${finding.title}-${index}`}>
          <strong>{finding.kind.replaceAll("_", " ")}: {finding.title}</strong>{finding.page !== null && <> · page {finding.page}</>}<br/>
          {finding.detail}<br/>{finding.citation ?? "No verified authority citation."}
          {finding.evidenceVerified ? <blockquote>{finding.evidenceQuote}</blockquote> : <p className="note-inline">The quoted evidence could not be matched to extracted PDF text; treat this item as unverified.</p>}
          {finding.authorityEvidenceVerified && <blockquote>Rule excerpt: {finding.authorityQuote}</blockquote>}
          {finding.kind === "POSSIBLE_DEFECT" && !finding.authorityEvidenceVerified && <p className="note-inline">The cited rule quote could not be matched to the curated source excerpt; do not rely on this finding.</p>}
        </li>)}</ul> : <p className="note-inline">No checklist findings were returned. This is not a legal-sufficiency determination.</p>}
      </> : <p className="note-inline">Saved result could not be parsed. Re-run the pre-screen or review the filing manually.</p>)}
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
    case "REVIEW_TIMED_OUT": return "The previous pre-screen timed out. You can try again.";
    case "MODEL_UNAVAILABLE":
    case "EMPTY_MODEL_OUTPUT": return "The pre-screen could not complete. Review the PDF manually or try again later.";
    default: return "The pre-screen could not complete. Review the PDF manually.";
  }
}
