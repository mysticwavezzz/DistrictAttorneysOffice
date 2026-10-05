"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { localUser, canAccessCase } from "@/lib/case-access";
import { createCaseShareToken } from "@/lib/case-share-preview";

export async function createCaseSharePreviewLink(caseId: string): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  if (!caseId || caseId.length > 100) return { ok: false, message: "Unable to create a share link." };
  const session = await auth();
  if (!session?.user?.providerUserId) return { ok: false, message: "Sign in again to share this case." };
  const user = await localUser(session.user);
  if (!user) return { ok: false, message: "Your staff account could not be verified." };
  const caseRecord = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, createdById: true, assignedAttorneyId: true, division: true, isDraft: true } });
  if (!caseRecord || caseRecord.isDraft || !canAccessCase(session.user.tiers, user.id, caseRecord, user.division)) {
    return { ok: false, message: "You do not have access to share this case." };
  }
  const token = createCaseShareToken(caseRecord.id);
  if (!token) return { ok: false, message: "Share links are not configured on this site." };
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.AUTH_URL || "https://districtattorneysoffice-production.up.railway.app";
  return { ok: true, url: new URL(`/share/case/${token}`, baseUrl).toString() };
}
