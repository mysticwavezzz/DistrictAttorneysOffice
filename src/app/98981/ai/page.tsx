import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { getConfiguredGroqModel, ALLOWED_GROQ_MODELS } from "@/lib/ai-model";
import { updateAiModel } from "../ai-actions";
import { staffPageMetadata } from "@/lib/staff-metadata";

export const metadata = staffPageMetadata("AI Service", "Configure the allowed text model and review its case workbench performance.", "/98981/ai");

export default async function AiServicePage() {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.SETTINGS_MANAGE)) redirect("/login?error=forbidden");
  const [modelId, runs] = await Promise.all([
    getConfiguredGroqModel(),
    prisma.caseAiRun.findMany({ where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }, select: { status: true, latencyMs: true, reviewerFeedback: true, resultJson: true, modelId: true } }),
  ]);
  const completed = runs.filter((item) => item.status === "COMPLETED");
  const avgLatency = completed.length ? Math.round(completed.reduce((sum, item) => sum + (item.latencyMs ?? 0), 0) / completed.length) : 0;
  const feedback = completed.filter((item) => item.reviewerFeedback);
  const correctionCount = feedback.filter((item) => item.reviewerFeedback === "NEEDS_CORRECTION").length;
  const mismatched = completed.reduce((sum, item) => {
    try { const data = JSON.parse(item.resultJson ?? "{}"); return sum + (Array.isArray(data.verifiedFindings) ? data.verifiedFindings.filter((finding: { sourceVerified?: boolean }) => !finding.sourceVerified).length : 0); } catch { return sum; }
  }, 0);

  return <div className="ai-service-page">
    <p className="eyebrow">Hidden Control Panel · AI service</p><h1>AI configuration and quality</h1>
    <p className="lede">Text-only assistance for case sources. The service cannot approve filings, decide legal issues, or send media to the model.</p>
    <section className="workbench-panel"><div className="workbench-section-heading"><div><p className="eyebrow">Groq · no provider fallback</p><h2>Model allowlist</h2></div><span className={`pill ${process.env.GROQ_API_KEY ? "pill-green" : "pill-gold"}`}>{process.env.GROQ_API_KEY ? "API key configured" : "API key not configured"}</span></div>
      <p>The app only accepts these model IDs and will not silently switch models. A free-tier endpoint does not change the account&apos;s plan or guarantee a free quota. Check the account&apos;s current rate limits and billing status in Groq before sending case material.</p>
      <form action={updateAiModel} className="formbox ai-model-form"><div className="field"><label htmlFor="ai-model-id">Active model</label><select id="ai-model-id" name="modelId" defaultValue={modelId}>{ALLOWED_GROQ_MODELS.map((model) => <option key={model.id} value={model.id}>{model.label} · {model.tier}</option>)}</select></div><button type="submit" className="govbtn">Save model</button></form>
      <p className="note-inline">Candidate comparison: run both models against the same redacted sample set. Score quote accuracy, missed discrepancies, false alarms, valid structured output, attorney corrections, and latency before selecting a new default. The current active model is <code>{modelId}</code>.</p>
      <ul className="ai-model-links"><li><a href="https://console.groq.com/docs/rate-limits" target="_blank" rel="noreferrer noopener">Groq model-specific rate limits ↗</a></li><li><a href="https://console.groq.com/docs/your-data" target="_blank" rel="noreferrer noopener">Groq data controls and retention ↗</a></li><li><a href="https://console.groq.com/docs/model/qwen/qwen3.8-27b" target="_blank" rel="noreferrer noopener">Qwen 3.8 27B model details ↗</a></li></ul>
    </section>
    <section className="workbench-panel"><div className="workbench-section-heading"><div><p className="eyebrow">Last 30 days</p><h2>Workbench quality signals</h2></div></div><div className="report-metric-grid"><article><span>Completed runs</span><strong>{completed.length}</strong></article><article><span>Average latency</span><strong>{avgLatency ? `${avgLatency} ms` : "—"}</strong></article><article><span>Attorney corrections</span><strong>{correctionCount}/{feedback.length || 0}</strong></article><article><span>Unmatched source quotes</span><strong>{mismatched}</strong></article></div><p className="note-inline">These are operational signals, not a legal accuracy score. The system retains only case-bound result text and reviewer feedback. Rate-limit failures are recorded on the individual run; plan quotas are not inferred from a configured API key.</p><p><Link className="govbtn-outline" href="/dashboard/activity">Review activity log</Link></p></section>
  </div>;
}
