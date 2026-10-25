"use server";

import { createHash, randomBytes, X509Certificate } from "node:crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { localUser, canAssignCase } from "@/lib/case-access";
import { hasActiveDeveloperProfile } from "@/lib/developer-profile-access";

export async function createLocalAutomationToken(input: { name: string; certificatePem: string }) {
  const session = await auth();
  if (!session?.user?.providerUserId || !await hasActiveDeveloperProfile(session.user)) throw new Error("Local case operations are restricted to the active Developer Profile.");
  const user = await localUser(session.user);
  if (!user) throw new Error("Your staff account could not be found.");
  if (!canAssignCase(session.user.tiers, user.division)) throw new Error("Your current access does not allow case assignments.");

  const name = input.name.trim();
  if (!name || name.length > 60) throw new Error("Give this computer a name of 1 to 60 characters.");
  if (input.certificatePem.length > 12_000) throw new Error("The public certificate is too long.");

  let publicKeyPem: string;
  try {
    const certificate = new X509Certificate(input.certificatePem.trim());
    if (new Date(certificate.validFrom).getTime() > Date.now() || new Date(certificate.validTo).getTime() <= Date.now()) {
      throw new Error("The certificate is outside its valid dates.");
    }
    if (certificate.publicKey.asymmetricKeyType !== "ec" || certificate.publicKey.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
      throw new Error("Use the P-256 certificate created by dao-caseops.ps1 setup.");
    }
    publicKeyPem = certificate.publicKey.export({ type: "spki", format: "pem" }).toString();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Use the P-256")) throw error;
    throw new Error("The public certificate is invalid. Run dao-caseops.ps1 setup and paste its certificate.");
  }

  const activeToken = await prisma.localAutomationToken.findFirst({ where: { activeForUserId: user.id }, select: { id: true } });
  if (activeToken) throw new Error("This account already has an active local automation credential. Revoke it before creating a replacement.");

  const secret = `dao_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  await prisma.$transaction(async (tx) => {
    const token = await tx.localAutomationToken.create({
      data: {
        userId: user.id,
        activeForUserId: user.id,
        name,
        tokenHash: createHash("sha256").update(secret).digest("hex"),
        tokenPrefix: secret.slice(0, 12),
        publicKeyPem,
        expiresAt,
      },
      select: { id: true },
    });
    await tx.settingsAuditLog.create({
      data: { actorName: session.user.displayName, action: "LOCAL_AUTOMATION_TOKEN_CREATED", details: JSON.stringify({ name, tokenId: token.id, expiresAt: expiresAt.toISOString() }) },
    });
  });
  return { token: secret, expiresAt: expiresAt.toISOString() };
}

export async function revokeLocalAutomationToken(tokenId: string) {
  const session = await auth();
  if (!session?.user?.providerUserId || session.user.identityProvider !== "roblox" || !await hasActiveDeveloperProfile(session.user)) throw new Error("Local case operations are restricted to the active Developer Profile.");
  const user = await localUser(session.user);
  if (!user) throw new Error("Your staff account could not be found.");
  const now = new Date();
  const revoked = await prisma.$transaction(async (tx) => {
    const result = await tx.localAutomationToken.updateMany({
      where: { id: tokenId, userId: user.id, revokedAt: null },
      data: { revokedAt: now, activeForUserId: null },
    });
    if (result.count) {
      await tx.settingsAuditLog.create({
        data: { actorName: session.user.displayName, action: "LOCAL_AUTOMATION_TOKEN_REVOKED", details: JSON.stringify({ tokenId }) },
      });
    }
    return result.count === 1;
  });
  return { revoked };
}
