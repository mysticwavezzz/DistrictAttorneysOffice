import { describe, it, expect } from "vitest";
import { tipFormSchema } from "./tip";

const validBase = {
  details: "There is suspicious activity happening near the old courthouse every night.",
  renderedAt: Date.now(),
};

describe("tipFormSchema", () => {
  it("accepts a minimal valid submission with only required fields", () => {
    const result = tipFormSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("rejects details shorter than 20 characters", () => {
    const result = tipFormSchema.safeParse({ ...validBase, details: "too short" });
    expect(result.success).toBe(false);
  });

  it("rejects details longer than 4000 characters", () => {
    const result = tipFormSchema.safeParse({ ...validBase, details: "a".repeat(4001) });
    expect(result.success).toBe(false);
  });

  it("rejects a non-empty honeypot field", () => {
    const result = tipFormSchema.safeParse({ ...validBase, website: "http://spam.example" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing renderedAt timestamp", () => {
    const { renderedAt: _renderedAt, ...withoutTimestamp } = validBase;
    const result = tipFormSchema.safeParse(withoutTimestamp);
    expect(result.success).toBe(false);
  });

  it("trims whitespace and defaults optional fields to empty strings", () => {
    const result = tipFormSchema.safeParse({ ...validBase, name: "  Jane Doe  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Jane Doe");
      expect(result.data.contact).toBe("");
      expect(result.data.location).toBe("");
    }
  });
});
