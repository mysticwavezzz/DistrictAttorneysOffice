import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canViewCases } from "@/lib/case-access";
import { localUser, caseVisibilityWhere } from "@/lib/case-access";
import { prisma } from "@/lib/prisma";
import { DocumentCreator } from "@/components/document-creator";
import { staffPageMetadata } from "@/lib/staff-metadata";

export const metadata: Metadata = staffPageMetadata("Document Creator", "Prepare a DA form using document-specific fields and render it into the supplied template.", "/dashboard/templates");

export default async function DocumentCreatorPage({ searchParams }: { searchParams: Promise<{ caseId?: string }> }) {
  const session = await auth();
  if (!session?.user || !canViewCases(session.user.tiers)) redirect("/login?error=forbidden");
  const user = await localUser(session.user);
  if (!user) redirect("/login?error=forbidden");
  const where = caseVisibilityWhere(session.user.tiers, user.id, user.division);
  const cases = where ? await prisma.case.findMany({ where, select: { id: true, caseNumber: true, title: true, type: true, partyDetails: true }, orderBy: { updatedAt: "desc" }, take: 200 }) : [];
  const query = await searchParams;
  const initialCaseId = cases.some((item) => item.id === query.caseId) ? query.caseId : "";
  return <DocumentCreator cases={cases} initialCaseId={initialCaseId} filingUsername={session.user.username || session.user.displayName} />;
}
