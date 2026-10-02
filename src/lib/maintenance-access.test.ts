import { describe, expect, it } from "vitest";
import { shouldRedirectToMaintenance } from "./maintenance-access";

const defaultInput = { enabled: true, exemptTiers: [], exemptUserIds: [] };

describe("maintenance route access", () => {
  it("redirects all ordinary pages, including staff login", () => {
    expect(shouldRedirectToMaintenance({ ...defaultInput, pathname: "/" })).toBe(true);
    expect(shouldRedirectToMaintenance({ ...defaultInput, pathname: "/login" })).toBe(true);
    expect(shouldRedirectToMaintenance({ ...defaultInput, pathname: "/login", callbackUrl: "/98981" })).toBe(false);
  });

  it("keeps the maintenance page and assets reachable and gates the admin database", () => {
    expect(shouldRedirectToMaintenance({ ...defaultInput, pathname: "/98981" })).toBe(true);
    expect(shouldRedirectToMaintenance({ ...defaultInput, pathname: "/98981/status" })).toBe(true);
    expect(shouldRedirectToMaintenance({ ...defaultInput, pathname: "/98981", exemptTiers: ["district_attorney"], user: { tiers: ["district_attorney"] } })).toBe(false);
    expect(shouldRedirectToMaintenance({ ...defaultInput, pathname: "/98981", exemptUserIds: ["123456789"], user: { providerUserId: "123456789", tiers: ["district_attorney"] } })).toBe(false);
    expect(shouldRedirectToMaintenance({ ...defaultInput, pathname: "/maintenance" })).toBe(false);
    expect(shouldRedirectToMaintenance({ ...defaultInput, pathname: "/seal.webp" })).toBe(false);
  });

  it("keeps the public policy pages available during maintenance", () => {
    expect(shouldRedirectToMaintenance({ ...defaultInput, pathname: "/privacy-policy" })).toBe(false);
    expect(shouldRedirectToMaintenance({ ...defaultInput, pathname: "/terms-of-service" })).toBe(false);
  });

  it("allows configured permission tiers and individual Discord accounts", () => {
    expect(shouldRedirectToMaintenance({ ...defaultInput, pathname: "/dashboard", exemptTiers: ["special_investigations"], user: { tiers: ["special_investigations"] } })).toBe(false);
    expect(shouldRedirectToMaintenance({ ...defaultInput, pathname: "/dashboard", exemptUserIds: ["123456789"], user: { discordUserId: "123456789", tiers: [] } })).toBe(false);
  });

  it("does not grant exemptions when maintenance is off or no identity matches", () => {
    expect(shouldRedirectToMaintenance({ ...defaultInput, enabled: false, pathname: "/" })).toBe(false);
    expect(shouldRedirectToMaintenance({ ...defaultInput, pathname: "/dashboard", user: { discordUserId: "1", tiers: ["law_enforcement"] } })).toBe(true);
  });
});
