import { describe, it, expect } from "vitest";
import { normalizeName, findBestDiscordMemberMatch } from "./case-reminders";

describe("Discord Member Auto-Matching for Reminders", () => {
  it("normalizes names by removing punctuation and case", () => {
    expect(normalizeName("Kill_ParkRangers")).toBe("killparkrangers");
    expect(normalizeName("M_ysticWavezzz")).toBe("mysticwavezzz");
    expect(normalizeName("cozy_f0xx")).toBe("cozyf0xx");
    expect(normalizeName("Thailandstaff_3346")).toBe("thailandstaff3346");
    expect(normalizeName("")).toBe("");
    expect(normalizeName(null)).toBe("");
  });

  const attorneyExpectations: Record<string, string> = {
    A1exCarter: "383744490801856514",
    acerxtro: "1393510001137553428",
    andrewdecker1: "374268755997360129",
    AngeloDacre: "762996641896071180",
    Berklander: "1129066891168731136",
    cozy_f0xx: "363798155759976457",
    Dannlabs: "252525448741781514",
    David_WilliamJason: "1313796740406579244",
    g3otagger: "1109520787884494968",
    h6cki: "1511510719831605269",
    Kill_ParkRangers: "1532440494246858935",
    LocKingMari: "1345790477005361153",
    M_ysticWavezzz: "1432838222618296343",
    samschulpen: "201395171827515392",
    sn_apl: "349707205907578882",
    Thailandstaff_3346: "1178900779457839145",
    virtut_e: "1233309522466967572",
  };

  for (const [robloxName, expectedDiscordId] of Object.entries(attorneyExpectations)) {
    it(`matches attorney ${robloxName} to discord user ID ${expectedDiscordId}`, () => {
      const match = findBestDiscordMemberMatch(robloxName);
      expect(match).not.toBeNull();
      expect(match?.id).toBe(expectedDiscordId);
    });
  }
});
