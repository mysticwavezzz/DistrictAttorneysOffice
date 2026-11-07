import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { localUser } from "@/lib/case-access";
import { submitAssignedCaseTask } from "../cases/workbench-actions";

export const metadata = { title: "My Assigned Work | DAO", robots: { index: false, follow: false } };
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" });

export default async function MyAssignedWorkPage() {
  const session = await auth();
  if (!session?.user?.providerUserId || !hasCapability(session.user.tiers, CAPABILITIES.CASE_TASKS_VIEW_ASSIGNED)) redirect("/login?error=forbidden");
  const user = await localUser(session.user);
  if (!user) redirect("/login?error=forbidden");
  const canViewAll = hasCapability(session.user.tiers, CAPABILITIES.CASE_TASKS_VIEW_ALL);
  const tasks = await prisma.caseTask.findMany({
    where: canViewAll ? { assignedToId: { not: null }, status: { in: ["OPEN", "RETURNED", "SUBMITTED"] } } : { assignedToId: user.id, status: { in: ["OPEN", "RETURNED", "SUBMITTED"] } },
    include: { case: { select: { caseNumber: true, title: true, division: true } } },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }], take: 100,
  });
  return <div className="page-stack">
    <header className="page-heading"><p className="eyebrow">Administrative Services · {canViewAll ? "Placement oversight" : "Assigned case work"}</p><h1>{canViewAll ? "Paralegal Work Queue" : "My Assigned Work"}</h1><p>Prepare the requested draft or support work for attorney review. A paralegal submission is a work product, not an approved or filed document.</p></header>
    {tasks.length ? <div className="paralegal-task-list">{tasks.map((task) => <article className="paralegal-task-card" key={task.id}>
      <header><div><p className="eyebrow">{task.case.caseNumber} · {task.case.division ?? "Division not set"}</p><h2>{task.title}</h2></div><span className={`pill ${task.status === "SUBMITTED" ? "pill-navy" : task.status === "RETURNED" ? "pill-gold" : "pill-muted"}`}>{task.status === "SUBMITTED" ? "Submitted for review" : task.status === "RETURNED" ? "Revisions requested" : "Assigned"}</span></header>
      <p className="paralegal-task-case">{task.case.title}</p><p>{task.details || "No additional instructions were provided."}</p>
      {task.sourceReference && <p><strong>Reference:</strong> {task.sourceReference}</p>}
      {task.assignedToName && canViewAll && <p><strong>Assigned to:</strong> {task.assignedToName}</p>}
      {task.dueAt && <p><strong>Due:</strong> {dateFormat.format(task.dueAt)}</p>}
      {task.reviewNote && <p className="message warning"><strong>Attorney note:</strong> {task.reviewNote}</p>}
      {task.status === "SUBMITTED" ? <section className="paralegal-draft-preview"><h3>Draft submitted</h3><pre>{task.draftText}</pre><p className="note-inline">The assigned attorney will review this draft and either accept the task or request revisions.</p></section> : !canViewAll && <form action={submitAssignedCaseTask} className="workbench-form paralegal-task-form"><input type="hidden" name="taskId" value={task.id}/><div className="field field-wide"><label htmlFor={`draft-${task.id}`}>Work product for attorney review</label><textarea id={`draft-${task.id}`} name="draftText" rows={8} maxLength={20000} defaultValue={task.draftText} required placeholder="Enter the requested draft or support work here."/><span className="hint">The assigned attorney remains responsible for legal decisions, approval, and court filing.</span></div><button type="submit" className="govbtn">Submit for attorney review</button></form>}
    </article>)}</div> : <section className="panel"><h2>No open assignments</h2><p>When an attorney assigns you work on a case, it will appear here.</p></section>}
  </div>;
}
