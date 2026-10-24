import { createHash, verify, type VerifyPublicKeyInput } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { fetchRobloxGroupRoles } from "@/lib/roblox/groups";
import { ROBLOX_TIER_ROLE_MAPPINGS } from "@/config/roblox-role-mappings";
import { normalizeRobloxTierRoleMappings } from "@/config/role-mapping-migrations";
import { applyRosterRankOverride } from "@/lib/staff-rank-control";
import { hasActiveDeveloperProfile } from "@/lib/developer-profile-access";
import { isDeveloperProfileIdentity, withDeveloperProfile } from "@/config/developer-profiles";
import { capabilityMarkersForTiers, resolveTiersFromRobloxRoles } from "@/lib/permissions/resolve";
import type { PermissionTier } from "@/lib/permissions/tiers";

const TOKEN_PATTERN = /^dao_[A-Za-z0-9_-]{43}$/;
const REQUEST_MAX_AGE_SECONDS = 300;

export type LocalAutomationActor = {
  user: {
    id: string;
    robloxUserId: string;
    username: string;
    displayName: string;
    division: string | null;
    divisionGroup: string | null;
  };
  tiers: PermissionTier[];
};

export type LocalAutomationAuthResult =
  | { ok: true; actor: LocalAutomationActor }
  | { ok: false; status: 401 | 403 | 503; error: string };

export async function resolveLocalAutomationActor(userId: string): Promise<LocalAutomationActor | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, robloxUserId: true, username: true, displayName: true, division: true, divisionGroup: true },
  });
  const robloxUserId = user?.robloxUserId;
  if (!user || !robloxUserId || !isDeveloperProfileIdentity("roblox", user.username)) return null;

  const revoked = await prisma.revokedStaffAccess.findUnique({ where: { robloxUserId }, select: { robloxUserId: true } });
  if (revoked) return null;
  const [roster, mappingsRow, capabilitiesRow, roles] = await Promise.all([
    prisma.rosterEntry.findUnique({ where: { robloxUserId }, select: { rankOverride: true, isActive: true, unit: true, divisionGroup: true } }),
    prisma.siteConfiguration.findUnique({ where: { key: "robloxTierRoleMappings" }, select: { value: true } }),
    prisma.siteConfiguration.findUnique({ where: { key: "tierCapabilities" }, select: { value: true } }),
    fetchRobloxGroupRoles(robloxUserId),
  ]);
  try {
    const mappings = normalizeRobloxTierRoleMappings(
      mappingsRow ? JSON.parse(mappingsRow.value) as typeof ROBLOX_TIER_ROLE_MAPPINGS : ROBLOX_TIER_ROLE_MAPPINGS,
    );
    const configuredCapabilities = capabilitiesRow
      ? JSON.parse(capabilitiesRow.value) as Record<string, string[]>
      : {};
    const groupTiers = resolveTiersFromRobloxRoles(roles, mappings);
    const baseTiers = applyRosterRankOverride(groupTiers, roster?.isActive ? roster.rankOverride : null);
    const developerEnabled = await hasActiveDeveloperProfile({
      identityProvider: "roblox",
      username: user.username,
      robloxUserId,
    });
    const tiers = withDeveloperProfile("roblox", user.username, baseTiers, developerEnabled);
    const division = roster ? roster.unit : user.division;
    const divisionGroup = roster ? roster.divisionGroup : user.divisionGroup;
    return {
      user: { ...user, robloxUserId, division, divisionGroup },
      tiers: [...tiers, ...capabilityMarkersForTiers(tiers, configuredCapabilities)] as PermissionTier[],
    };
  } catch {
    return null;
  }
}

export async function authenticateLocalAutomationRequest(request: Request, rawBody: string): Promise<LocalAutomationAuthResult> {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return { ok: false, status: 401, error: "Local automation credential required." };
  const tokenValue = authorization.slice("Bearer ".length);
  if (!TOKEN_PATTERN.test(tokenValue)) return { ok: false, status: 401, error: "Local automation credential is invalid." };

  const timestamp = request.headers.get("x-dao-timestamp") ?? "";
  const signatureText = request.headers.get("x-dao-signature") ?? "";
  if (!/^\d{10,13}$/.test(timestamp) || !/^[A-Za-z0-9+/]{80,100}={0,2}$/.test(signatureText)) {
    return { ok: false, status: 401, error: "Signed request headers are missing or invalid." };
  }
  const timestampMs = Number(timestamp) * (timestamp.length === 10 ? 1000 : 1);
  if (!Number.isSafeInteger(timestampMs) || Math.abs(Date.now() - timestampMs) > REQUEST_MAX_AGE_SECONDS * 1000) {
    return { ok: false, status: 401, error: "Signed request has expired. Check the computer clock and retry." };
  }

  const tokenHash = createHash("sha256").update(tokenValue).digest("hex");
  const token = await prisma.localAutomationToken.findUnique({ where: { tokenHash } });
  const now = new Date();
  if (!token || token.revokedAt || token.expiresAt <= now || token.activeForUserId !== token.userId) {
    return { ok: false, status: 401, error: "Local automation credential is revoked or expired." };
  }

  const url = new URL(request.url);
  const pathAndQuery = `${url.pathname}${url.search}`;
  const bodyHash = createHash("sha256").update(rawBody, "utf8").digest("hex");
  const signedMessage = `${timestamp}\n${request.method.toUpperCase()}\n${pathAndQuery}\n${bodyHash}`;
  const signature = Buffer.from(signatureText, "base64");
  if (signature.length !== 64) return { ok: false, status: 401, error: "Signed request signature is invalid." };

  let signatureValid = false;
  try {
    signatureValid = verify(
      "sha256",
      Buffer.from(signedMessage, "utf8"),
      { key: token.publicKeyPem, dsaEncoding: "ieee-p1363" } as VerifyPublicKeyInput,
      signature,
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) return { ok: false, status: 401, error: "Signed request signature is invalid." };

  if (!token.lastUsedAt || now.getTime() - token.lastUsedAt.getTime() > 60_000) {
    await prisma.localAutomationToken.update({ where: { id: token.id }, data: { lastUsedAt: now } });
  }

  try {
    const actor = await resolveLocalAutomationActor(token.userId);
    if (!actor) return { ok: false, status: 403, error: "The token owner no longer has active staff access." };
    return { ok: true, actor };
  } catch {
    return { ok: false, status: 503, error: "Current Roblox permissions could not be verified. Retry shortly." };
  }
}
