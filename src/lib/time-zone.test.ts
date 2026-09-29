import { describe, expect, it } from "vitest";
import { formatDateTimeInTimeZone, parseDateTimeInTimeZone, reinterpretLegacyUtcWallTime } from "./time-zone";

describe("Eastern Time maintenance schedules", () => {
  it("converts summer and winter times to the matching instant", () => {
    expect(parseDateTimeInTimeZone("2026-07-15T09:30", "America/New_York")?.toISOString()).toBe("2026-07-15T13:30:00.000Z");
    expect(parseDateTimeInTimeZone("2026-01-15T09:30", "America/New_York")?.toISOString()).toBe("2026-01-15T14:30:00.000Z");
  });

  it("round-trips the time displayed in the admin database", () => {
    const date = parseDateTimeInTimeZone("2026-11-01T01:30", "America/New_York");
    expect(date).not.toBeNull();
    expect(formatDateTimeInTimeZone(date!, "America/New_York")).toBe("2026-11-01T01:30");
  });

  it("rejects a local time skipped by the daylight-saving transition", () => {
    expect(parseDateTimeInTimeZone("2026-03-08T02:30", "America/New_York")).toBeNull();
  });

  it("corrects previously saved UTC wall times when read", () => {
    expect(reinterpretLegacyUtcWallTime(new Date("2026-01-15T09:30:00.000Z"), "America/New_York")?.toISOString()).toBe("2026-01-15T14:30:00.000Z");
  });
});
