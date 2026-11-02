import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import type { TipFormInput } from "@/lib/validation/tip";

const KEY = Buffer.from(hkdfSync("sha256", env.AUTH_SECRET, "dao-crime-tip-v1", "crime-tip-payload", 32));

export type CrimeTipDetails = Omit<TipFormInput, "website" | "renderedAt">;

export function encryptCrimeTip(details: CrimeTipDetails): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(details), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptCrimeTip(payload: string): CrimeTipDetails {
  const [version, ivText, tagText, ciphertextText] = payload.split(".");
  if (version !== "v1" || !ivText || !tagText || !ciphertextText) throw new Error("Unsupported crime-tip payload format.");
  const decipher = createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext) as CrimeTipDetails;
}
