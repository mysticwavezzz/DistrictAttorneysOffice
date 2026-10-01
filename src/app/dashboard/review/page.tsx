import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { markRecordsRequestStatus } from "../records-requests/actions";
import { reviewCaseRequest } from "../cases/requests/actions";
import { reviewAopc } from "./actions";

type ReviewItem = { id: string; kind: "case" | "records" | "aopc"; title: string; summary: string; submittedBy: string; division: string; createdAt: Date; href: string; details?: string; contact?: string };
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export default async function ReviewInboxPage({ searchParams }: { searchParams: Promise<{ type?: string; age?: string; division?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login?error=forbidden");
  const canReviewCases = hasCapability(session.user.tiers, CAPABILITIES.CASES_APPROVE_EDITS);
  const canReviewRecords = hasCapability(session.user.tiers, CAPABILITIES.REQUESTS_VIEW);
  if (!canReviewCases && !canReviewRecords) redirect("/login?error=forbidden");

  const filters = await searchParams;
  const selectedType = ["case", "records", "aopc"].includes(filters.type ?? "") ? filters.type! : "all";
  const ageHours = ["24", "72", "168"].includes(filters.age ?? "") ? Number(filters.age) : 0;
  const selectedDivision = (filters.division ?? "").trim().slice(0, 100);
  const now = Date.now();
  const items: ReviewItem[] = [];

  if (canReviewCases && (selectedType === "all" || selectedType === "case")) {
    const rows = await prisma.caseActionRequest.findMany({ where: { status: "PENDING" }, include: { requestedBy: { select: { displayName: true } }, case: { select: { id: true, caseNumber: true, type: true } } }, orderBy: { createdAt: "asc" }, take: 100 }).catch(() => []);
    for (const row of rows) {
      let data: Record<string, unknown> = {};
      try { const parsed: unknown = JSON.parse(row.proposedData); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as Record<string, unknown>; } catch { /* Preserve malformed requests in the queue so reviewers can investigate. */ }
      const title = typeof data.title === "string" ? data.title : row.case?.caseNumber ?? "Case request";
      const division = typeof data.division === "string" ? data.division : typeof data.targetUnit === "string" ? data.targetUnit : "Unassigned";
      const detailFields = ["type", "stage", "assignedJudge", "assignedAttorneyName", "summary"];
      const details = detailFields.flatMap((key) => typeof data[key] === "string" && data[key] ? [`${key === "assignedAttorneyName" ? "Assigned attorney" : key === "assignedJudge" ? "Judge" : key}: ${data[key]}`] : []).join(" · ");
      items.push({ id: row.id, kind: "case", title, summary: row.kind === "CREATE" ? "New case opening" : `Case update${row.case?.caseNumber ? ` · ${row.case.caseNumber}` : ""}`, submittedBy: row.requestedBy.displayName, division, createdAt: row.createdAt, href: row.case ? `/dashboard/cases/${row.case.id}` : "/dashboard/cases", details });
    }
  }
  if (canReviewRecords && (selectedType === "all" || selectedType === "records")) {
    const rows = await prisma.recordsRequest.findMany({ where: { status: { in: ["NEW", "IN_PROGRESS"] } }, orderBy: { createdAt: "asc" }, take: 100 }).catch(() => []);
    for (const row of rows) items.push({ id: row.id, kind: "records", title: row.name, summary: row.status === "NEW" ? "New public records request" : "Records request in progress", submittedBy: row.name, division: "Public requests", createdAt: row.createdAt, href: "/dashboard/review?type=records", details: row.details, contact: row.contact });
  }
  if (canReviewCases && (selectedType === "all" || selectedType === "aopc")) {
    const rows = await prisma.aopc.findMany({ where: { status: "PENDING" }, include: { submittedBy: { select: { displayName: true } } }, orderBy: { createdAt: "asc" }, take: 100 }).catch(() => []);
    for (const row of rows) items.push({ id: row.id, kind: "aopc", title: row.reportId || row.title, summary: `${row.targetUnit} · ${row.subject}`, submittedBy: row.submittedBy.displayName, division: row.targetUnit, createdAt: row.createdAt, href: `/dashboard/cases${row.linkedCaseId ? `/${row.linkedCaseId}` : ""}` });
  }

  const divisions = Array.from(new Set(items.map((item) => item.division).filter((value) => value && value !== "Unassigned"))).sort();
  const visible = items.filter((item) => (!selectedDivision || item.division === selectedDivision) && (!ageHours || now - item.createdAt.getTime() >= ageHours * 3_600_000));
  visible.sort((a, b) => {
    const aAge = now - a.createdAt.getTime(), bAge = now - b.createdAt.getTime();
    const aUrgency = aAge >= 72 * 3_600_000 ? 2 : aAge >= 24 * 3_600_000 ? 1 : 0;
    const bUrgency = bAge >= 72 * 3_600_000 ? 2 : bAge >= 24 * 3_600_000 ? 1 : 0;
    return bUrgency - aUrgency || a.createdAt.getTime() - b.createdAt.getTime();
  });

  return <div className="review-inbox">
    <p className="eyebrow">Staff workflow</p><h1>Review Inbox</h1>
    <p className="lede">One queue for pending case decisions, affidavit reviews, and public records requests. Older items rise to the top.</p>
    <form className="review-inbox-filters">
      <div className="field"><label htmlFor="review-type">Request type</label><select id="review-type" name="type" defaultValue={selectedType}><option value="all">All types</option>{canReviewCases && <><option value="case">Case requests</option><option value="aopc">AOPCs</option></>}{canReviewRecords && <option value="records">Records requests</option>}</select></div>
      <div className="field"><label htmlFor="review-age">Waiting at least</label><select id="review-age" name="age" defaultValue={filters.age ?? ""}><option value="">Any age</option><option value="24">24 hours</option><option value="72">3 days</option><option value="168">7 days</option></select></div>
      <div className="field"><label htmlFor="review-division">Division / queue</label><select id="review-division" name="division" defaultValue={selectedDivision}><option value="">All queues</option>{divisions.map((division) => <option key={division} value={division}>{division}</option>)}</select></div>
      <button type="submit" className="govbtn">Filter</button><Link href="/dashboard/review" className="govbtn-outline">Clear</Link>
    </form>
    <p className="review-inbox-count" aria-live="polite">{visible.length} item{visible.length === 1 ? "" : "s"} need review</p>
    {visible.length ? <div className="review-inbox-list">{visible.map((item) => {
      const hours = Math.floor((now - item.createdAt.getTime()) / 3_600_000);
      const urgency = hours >= 72 ? "Urgent" : hours >= 24 ? "Waiting" : "New";
      return <article className="review-inbox-card" key={`${item.kind}-${item.id}`}>
        <header><div><span className={`pill ${urgency === "Urgent" ? "pill-red" : urgency === "Waiting" ? "pill-gold" : "pill-navy"}`}>{urgency}</span> <span className="pill pill-muted">{item.kind === "case" ? "Case request" : item.kind === "aopc" ? "AOPC" : "Records request"}</span></div><time dateTime={item.createdAt.toISOString()}>{dateFormat.format(item.createdAt)}</time></header>
        <h2>{item.title}</h2><p>{item.summary}</p><dl><div><dt>Submitted by</dt><dd>{item.submittedBy}</dd></div><div><dt>Division / queue</dt><dd>{item.division}</dd></div><div><dt>Waiting</dt><dd>{hours < 24 ? `${Math.max(0, hours)} hours` : `${Math.floor(hours / 24)} days`}</dd></div></dl>
        {item.details && item.kind !== "records" && <p className="review-item-details">{item.details}</p>}
        {item.kind === "aopc" ? <details className="review-aopc-detail"><summary>Review details and decision</summary><p><strong>Target:</strong> {item.summary}</p><form action={reviewAopc} className="review-aopc-form"><input type="hidden" name="id" value={item.id}/><div className="field"><label htmlFor={`aopc-note-${item.id}`}>Review note <span className="hint">Required when returning</span></label><textarea id={`aopc-note-${item.id}`} name="note" rows={2} maxLength={1000}/></div><button type="submit" name="decision" value="ACCEPTED" className="govbtn">Accept</button><button type="submit" name="decision" value="REJECTED" className="govbtn-outline">Return for changes</button></form></details>
          : item.kind === "records" ? <><details className="review-aopc-detail"><summary>Request details and status</summary>{item.contact && <p><strong>Contact:</strong> {item.contact}</p>}<p className="review-item-details">{item.details}</p></details><form action={markRecordsRequestStatus} className="review-record-action"><input type="hidden" name="id" value={item.id}/><label htmlFor={`records-status-${item.id}`}>Update status</label><select id={`records-status-${item.id}`} name="status" defaultValue="IN_PROGRESS"><option value="IN_PROGRESS">In progress</option><option value="FULFILLED">Fulfilled</option><option value="DENIED">Denied</option></select><button type="submit" className="govbtn-outline">Save status</button></form></>
          : <><details className="review-aopc-detail"><summary>Case submission details</summary>{item.details && <p className="review-item-details">{item.details}</p>}<Link href={item.href}>Open related case</Link></details><form action={reviewCaseRequest} className="review-aopc-form"><input type="hidden" name="id" value={item.id}/><div className="field"><label htmlFor={`case-review-note-${item.id}`}>Review note <span className="hint">Required when rejecting</span></label><textarea id={`case-review-note-${item.id}`} name="note" rows={2} maxLength={1000}/></div><button type="submit" name="decision" value="APPROVE" className="govbtn">Approve</button><button type="submit" name="decision" value="REJECT" className="govbtn-outline">Reject</button></form></>}
      </article>;
    })}</div> : <div className="empty-state"><h2>Inbox is clear</h2><p>No items match these filters right now.</p><Link href="/dashboard/review" className="govbtn-outline">Clear filters</Link></div>}
  </div>;
}
