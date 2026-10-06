import { isDeveloperProfileIdentity, developerProfileSettingKey } from "@/config/developer-profiles";
import { prisma } from "@/lib/prisma";

type DeveloperProfileIdentity = {
  identityProvider?: string;
  username?: string | null;
  robloxUserId?: string | null;
};

/** Read the current persisted toggle; session/JWT tier claims may be stale. */
export async function hasActiveDeveloperProfile(identity: DeveloperProfileIdentity): Promise<boolean> {
  const userId = identity.robloxUserId?.trim();
  if (!userId || !isDeveloperProfileIdentity(identity.identityProvider, identity.username ?? undefined)) return false;

  try {
    const setting = await prisma.siteConfiguration.findUnique({
      where: { key: developerProfileSettingKey(userId) },
      select: { value: true },
    });
    return setting?.value === "true";
  } catch (error) {
    console.error("Could not verify the active Developer Profile setting", error);
    return false;
  }
}
