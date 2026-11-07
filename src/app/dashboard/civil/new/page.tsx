import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { PERMISSION_TIERS } from "@/lib/permissions/tiers";
import { localUser } from "@/lib/case-access";
import { getDivisionCaseAssignees } from "@/lib/case-assignees";
import { staffPageMetadata } from "@/lib/staff-metadata";
import { CivilMatterOpeningForm } from "@/components/civil-matter-opening-form";

export const metadata = staffPageMetadata("Start Civil Matter", "Open an unfiled Civil Division matter and attach its initiating pleading.", "/dashboard/civil/new");

export default async function NewCivilMatterPage() {
  const session = await auth();
  if (!session?.user?.providerUserId || !hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE)) redirect("/login?error=forbidden");
  const user = await localUser(session.user);
  if (!user) redirect("/login?error=forbidden");
  const officeWide = session.user.tiers.includes(PERMISSION_TIERS.DISTRICT_ATTORNEY) || session.user.tiers.includes(PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY) || session.user.tiers.includes("developer_profile");
  if (user.division !== "Civil Division" && !officeWide) redirect("/dashboard/civil");
  const canAssign = officeWide || hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN_DIVISION);
  const attorneys = canAssign ? await getDivisionCaseAssignees("Civil Division").catch(() => []) : [];
  const activeCivilStaff = await prisma.rosterEntry.count({ where: { isActive: true, unit: "Civil Division" } }).catch(() => 0);
  return <div className="civil-new-page">
    <header className="case-opening-heading">
      <p className="eyebrow"><a href="/dashboard/civil">Civil Matters</a> / New matter</p>
      <h1>Start a civil matter</h1>
      <p className="lede">Create the Civil Division case record, identify the parties, and attach the complaint when it is ready. The case remains unfiled until the pleading is reviewed and filed with the court.</p>
    </header>
    {activeCivilStaff === 0 && <p className="message">No active Civil Division roster placements are recorded. You can still prepare this matter, but an attorney must be placed in Civil Division for assignment.</p>}
    <CivilMatterOpeningForm attorneys={attorneys.map(({ id, displayName }) => ({ id, displayName }))} canAssign={canAssign} />
  </div>;
}
