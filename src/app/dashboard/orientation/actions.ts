"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { effectiveOnboardingRank, requiresCriminalDivisionGroupForOrientation } from "@/lib/onboarding-policy";

export async function acknowledgeOrientation(formData: FormData) {
  if (formData.get("acknowledged") !== "on") throw new Error("Confirm that you read the orientation before submitting.");
  const session = await auth();
  const robloxUserId = session?.user?.robloxUserId;
  if (!session?.user?.providerUserId || !robloxUserId) throw new Error("Sign in with your linked staff account to acknowledge orientation.");
  const roster = await prisma.rosterEntry.findUnique({ where: { robloxUserId } });
  const rank = roster ? effectiveOnboardingRank(roster) : null;
  if (!roster?.isActive || roster.unit !== "Criminal Division" || !rank || (requiresCriminalDivisionGroupForOrientation(rank) && !roster.divisionGroup)) throw new Error("An active Criminal Division attorney record is required, and line attorneys must have a group placement before orientation can be acknowledged.");
  if (!roster.orientationPending && roster.orientationAcknowledgedAt) redirect("/dashboard");
  const acknowledgedAt = new Date();
  await prisma.$transaction([
    prisma.rosterEntry.update({ where: { id: roster.id }, data: { orientationPending: false, orientationAcknowledgedAt: acknowledgedAt } }),
    prisma.activityLog.create({ data: { actorName: session.user.displayName, action: "acknowledged Criminal Division orientation", targetType: "roster entry", targetLabel: roster.name } }),
  ]);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
