import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { localUser, caseVisibilityWhere } from "@/lib/case-access";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { staffPageMetadata } from "@/lib/staff-metadata";
import { PERMISSION_TIERS } from "@/lib/permissions/tiers";

export const metadata = staffPageMetadata("Civil Matters", "Civil Division matters and filings.", "/dashboard/civil");
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default async function CivilMattersPage() {
  const session = await auth();
  if (!session?.user || (!hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW) && !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW_DIVISION) && !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW_ALL))) redirect("/login?error=forbidden");
  const user = await localUser(session.user);
  if (!user) redirect("/login?error=forbidden");
  const mayOpenCivil = user.division === "Civil Division" || session.user.tiers.includes(PERMISSION_TIERS.DISTRICT_ATTORNEY) || session.user.tiers.includes(PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY) || session.user.tiers.includes("developer_profile");
  const visibility = caseVisibilityWhere(session.user.tiers, user.id, user.division, user.divisionGroup);
  const matters = visibility ? await prisma.case.findMany({ where: { archived: false, division: "Civil Division", AND: [visibility] }, select: { id: true, caseNumber: true, title: true, stage: true, assignedJudge: true, updatedAt: true, assignedAttorney: { select: { displayName: true } }, filings: { select: { id: true, title: true, status: true } } }, orderBy: { updatedAt: "desc" }, take: 200 }) : [];
  const pending = matters.reduce((sum, matter) => sum + matter.filings.filter((filing) => filing.status === "PENDING").length, 0);
  return <div className="civil-matters-page"><div className="civil-page-heading"><div><p className="eyebrow">County Solicitor · Civil Division</p><h1>Civil Matters</h1><p className="lede">Civil docket, filings, and intake. Criminal charging and arraignment workflows stay in the Criminal Division.</p></div>{mayOpenCivil && <Link className="govbtn" href="/dashboard/civil/new">Start civil matter</Link>}</div>
    <div className="civil-matter-summary"><article><span>Open matters</span><strong>{matters.length}</strong></article><article><span>Filings awaiting office review</span><strong>{pending}</strong></article></div>
    {matters.length ? <div className="civil-matter-list">{matters.map((matter) => <article className="civil-matter-card" key={matter.id}><div><p className="eyebrow">{matter.caseNumber}</p><h2><Link href={`/dashboard/cases/${matter.id}`}>{matter.title}</Link></h2><p>{matter.stage || "Stage not recorded"} · Judge: {matter.assignedJudge || "Not assigned"}</p></div><dl><div><dt>Attorney</dt><dd>{matter.assignedAttorney?.displayName || "Unassigned"}</dd></div><div><dt>Pending filings</dt><dd>{matter.filings.filter((filing) => filing.status === "PENDING").length}</dd></div><div><dt>Updated</dt><dd>{dateFormat.format(matter.updatedAt)}</dd></div></dl></article>)}</div> : <section className="empty-state"><h2>No visible civil matters</h2><p>Matters appear here when their division is recorded as Civil Division and your case permissions allow access.</p></section>}
    <p className="note-inline">New matters are saved as unfiled Civil Division records. Attach a complaint when ready, submit it for office review, then record its court filing separately.</p>
  </div>;
}
