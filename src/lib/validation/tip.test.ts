import { describe, it, expect } from "vitest";
import { tipFormSchema } from "./tip";

const validTip = {
  submitterRoblox: "Reporter / 1234",
  submitterDiscord: "Reporter / 1234",
  legalAcknowledgment: true,
  crimeType: "Robbery / Theft",
  incidentDateTime: "2026-09-20T10:00",
  location: "Harrison County",
  suspectRoblox: "Unknown",
  suspectDiscord: "Unknown",
  suspectInformation: "Dark clothing",
  narrative: "I saw a person take property from the store and leave in a vehicle.",
  evidence: "N/A",
  witnesses: "N/A",
  identityWaiver: true,
  truthAffirmation: true,
  signature: "REPORTER",
  submissionReference: "HCD-MABC123-ABC123",
  website: "",
  renderedAt: Date.now(),
};

describe("tipFormSchema", () => {
  it("accepts a complete valid submission", () => expect(tipFormSchema.safeParse(validTip).success).toBe(true));
  it("requires both legal acknowledgments", () => expect(tipFormSchema.safeParse({ ...validTip, identityWaiver: false }).success).toBe(false));
  it("requires an uppercase electronic signature", () => expect(tipFormSchema.safeParse({ ...validTip, signature: "Reporter" }).success).toBe(false));
  it("rejects a non-empty honeypot field", () => expect(tipFormSchema.safeParse({ ...validTip, website: "spam" }).success).toBe(false));
  it("requires a rendered timestamp", () => { const { renderedAt: _timestamp, ...input } = validTip; expect(tipFormSchema.safeParse(input).success).toBe(false); });
});
