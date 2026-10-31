"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAssignableAttorneyRank } from "@/lib/case-assignees";
import { effectiveRosterRank } from "@/lib/staff-rank-control";

export async function acknowledgeOrientation(formData: FormData) {
  if (formData.get("acknowledged") !== "on") throw new Error("Confirm that you read the orientation before submitting.");
  const session = await auth();
  const robloxUserId = session?.user?.robloxUserId;
  if (!session?.user?.providerUserId || !robloxUserId) throw new Error("Sign in with your linked staff account to acknowledge orientation.");
  const roster = await prisma.rosterEntry.findUnique({ where: { robloxUserId } });
  if (!roster?.isActive || roster.unit !== "Criminal Division" || !roster.divisionGroup || !isAssignableAttorneyRank(effectiveRosterRank(roster.rank, roster.rankOverride))) throw new Error("Your active Criminal Division attorney group placement must be recorded before orientation can be acknowledged.");
  if (!roster.orientationPending && roster.orientationAcknowledgedAt) redirect("/dashboard");
  const acknowledgedAt = new Date();
  await prisma.$transaction([
    prisma.rosterEntry.update({ where: { id: roster.id }, data: { orientationPending: false, orientationAcknowledgedAt: acknowledgedAt } }),
    prisma.activityLog.create({ data: { actorName: session.user.displayName, action: "acknowledged Criminal Division orientation", targetType: "roster entry", targetLabel: roster.name } }),
  ]);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
