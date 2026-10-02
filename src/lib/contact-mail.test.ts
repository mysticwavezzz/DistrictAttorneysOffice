import { describe, expect, it } from "vitest";
import { canRouteContactMail, canViewAllContactMail, canViewContactMail, isAssignableContactEmployee, parseStoredTiers } from "./contact-mail";
import { DEVELOPER_PROFILE_TIER, PERMISSION_TIERS } from "./permissions/tiers";

describe("private contact-mail permissions", () => {
  it("limits global visibility to CADA and above", () => {
    expect(canViewAllContactMail([PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY])).toBe(true);
    expect(canViewAllContactMail([PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY])).toBe(true);
    expect(canViewAllContactMail([PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY])).toBe(false);
  });

  it("allows requesters, but limits assigned-ticket access to active casework staff", () => {
    const ticket = { requesterId: "requester", assigneeId: "ada" };
    expect(canViewContactMail([], "requester", ticket)).toBe(true);
    expect(canViewContactMail([PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY], "ada", ticket)).toBe(true);
    expect(canViewContactMail([PERMISSION_TIERS.ROBLOX_MEMBER], "ada", ticket)).toBe(false);
    expect(canViewContactMail([PERMISSION_TIERS.CHIEF_ASSISTANT_DISTRICT_ATTORNEY], "lead", ticket)).toBe(true);
  });

  it("allows division supervisors to route tickets and filters assignment targets to staff", () => {
    expect(canRouteContactMail([PERMISSION_TIERS.SENIOR_ASSISTANT_DISTRICT_ATTORNEY])).toBe(true);
    expect(canRouteContactMail([PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY])).toBe(false);
    expect(isAssignableContactEmployee([PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY])).toBe(true);
    expect(isAssignableContactEmployee([PERMISSION_TIERS.ROBLOX_MEMBER])).toBe(false);
    expect(isAssignableContactEmployee([DEVELOPER_PROFILE_TIER])).toBe(true);
  });

  it("parses known tiers and ignores arbitrary stored values", () => {
    expect(parseStoredTiers("assistant_district_attorney,unknown,developer_profile")).toEqual([PERMISSION_TIERS.ASSISTANT_DISTRICT_ATTORNEY, DEVELOPER_PROFILE_TIER]);
  });
});
