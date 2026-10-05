import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createCaseShareToken, verifyCaseShareToken } from "./case-share-preview";

const secret = "case-preview-test-secret-at-least-thirty-two-characters";

describe("signed case-share previews", () => {
  afterEach(() => { delete process.env.AUTH_SECRET; });

  it("creates expiring tokens bound to a case id", () => {
    process.env.AUTH_SECRET = secret;
    const token = createCaseShareToken("case-123");
    expect(token).not.toBeNull();
    const payload = verifyCaseShareToken(token!);
    expect(payload?.caseId).toBe("case-123");
    expect(payload?.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects modified and expired tokens", () => {
    process.env.AUTH_SECRET = secret;
    const token = createCaseShareToken("case-123")!;
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) throw new Error("Expected a signed token");
    const alteredSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
    expect(verifyCaseShareToken(`${encoded}.${alteredSignature}`)).toBeNull();

    const expired = Buffer.from(JSON.stringify({ caseId: "case-123", expiresAt: 1, version: 1 })).toString("base64url");
    const expiredSignature = createHmac("sha256", secret).update(expired).digest("base64url");
    expect(verifyCaseShareToken(`${expired}.${expiredSignature}`)).toBeNull();
  });

  it("fails closed when the signing secret is missing", () => {
    delete process.env.AUTH_SECRET;
    expect(createCaseShareToken("case-123")).toBeNull();
    expect(verifyCaseShareToken("invalid.token")).toBeNull();
  });
});
