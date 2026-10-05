import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

const SHARE_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

type SharePayload = { caseId: string; expiresAt: number; version: 1 };

function shareSecret(): string | null {
  const secret = process.env.AUTH_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

export function createCaseShareToken(caseId: string): string | null {
  const secret = shareSecret();
  if (!secret) return null;
  const payload: SharePayload = { caseId, expiresAt: Math.floor(Date.now() / 1000) + SHARE_LIFETIME_SECONDS, version: 1 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyCaseShareToken(token: string): SharePayload | null {
  const secret = shareSecret();
  if (!secret || token.length > 1000) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra !== undefined) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest();
  let actual: Buffer;
  try { actual = Buffer.from(signature, "base64url"); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<SharePayload>;
    if (payload.version !== 1 || typeof payload.caseId !== "string" || typeof payload.expiresAt !== "number" || payload.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return payload as SharePayload;
  } catch { return null; }
}

export async function getCaseSharePreview(token: string) {
  const payload = verifyCaseShareToken(token);
  if (!payload) return null;
  return prisma.case.findUnique({
    where: { id: payload.caseId },
    select: { id: true, caseNumber: true, title: true, type: true, stage: true, isDraft: true },
  }).then((record) => record && !record.isDraft ? record : null).catch(() => null);
}
