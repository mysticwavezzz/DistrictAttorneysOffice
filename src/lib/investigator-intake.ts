import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSiteConfiguration } from "@/lib/site-settings";

export const INVESTIGATOR_ALLOWLIST_KEY = "investigatorIntakeRobloxIds";

export async function getInvestigatorRobloxIds(): Promise<string[]> {
  const value = await getSiteConfiguration<unknown>(INVESTIGATOR_ALLOWLIST_KEY, []);
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && /^\d{5,25}$/.test(id)) : [];
}

export async function requireInvestigator() {
  const session = await auth();
  const robloxUserId = session?.user?.identityProvider === "roblox" ? session.user.robloxUserId : null;
  if (!session?.user?.providerUserId || !robloxUserId || !(await getInvestigatorRobloxIds()).includes(robloxUserId)) return null;

  const user = await prisma.user.upsert({
    where: { robloxUserId },
    update: { username: session.user.username, displayName: session.user.displayName, avatarUrl: session.user.avatarUrl ?? null },
    create: { robloxUserId, username: session.user.username, displayName: session.user.displayName, avatarUrl: session.user.avatarUrl ?? null },
  });
  return { session, user };
}
