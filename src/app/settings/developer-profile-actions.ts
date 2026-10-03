"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordSettingsAudit } from "@/lib/settings-audit";
import { developerProfileSettingKey, isDeveloperProfileIdentity } from "@/config/developer-profiles";
import { runWithActionDebug } from "@/lib/action-debug";

async function setDeveloperProfileEnabledImpl(enabled: boolean) {
  const session = await auth();
  const userId = session?.user?.robloxUserId;
  if (!userId || !isDeveloperProfileIdentity(session?.user?.identityProvider, session?.user?.username)) {
    throw new Error("This Roblox account is not eligible to use Developer Profile.");
  }

  await prisma.siteConfiguration.upsert({
    where: { key: developerProfileSettingKey(userId) },
    create: { key: developerProfileSettingKey(userId), value: String(enabled) },
    update: { value: String(enabled) },
  });
  await recordSettingsAudit(session.user.username, `Developer Profile ${enabled ? "enabled" : "disabled"}`, `Developer Profile was ${enabled ? "enabled" : "disabled"} for Roblox account ${userId}.`);
  return { enabled };
}

export async function setDeveloperProfileEnabled(enabled: boolean) { return runWithActionDebug("setDeveloperProfileEnabled", [enabled], () => setDeveloperProfileEnabledImpl(enabled)); }
