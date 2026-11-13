import { prisma } from "@/lib/prisma";
import daoMembersData from "@/config/dao-discord-members.json";

const DAO_GUILD_ID = process.env.DISCORD_GUILD_ID || "1140770936442851429";
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "";
const DISCORD_REMINDERS_CHANNEL_ID = "1566848629145206894";

export interface CompactDiscordMember {
  id: string;
  nick: string | null;
  globalName: string | null;
  username: string;
}

const daoMembers: CompactDiscordMember[] = daoMembersData as CompactDiscordMember[];

export function normalizeName(name?: string | null): string {
  if (!name) return "";
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Searches Discord members (from cached guild members or live Bot API)
 * to find the member who best matches the given Roblox username / display name.
 */
export function findBestDiscordMemberMatch(
  targetName: string,
  memberPool: CompactDiscordMember[] = daoMembers
): CompactDiscordMember | null {
  const normTarget = normalizeName(targetName);
  if (!normTarget) return null;

  // 1. Exact match on server nickname
  for (const m of memberPool) {
    if (normalizeName(m.nick) === normTarget) return m;
  }

  // 2. Exact match on Discord display name (global_name)
  for (const m of memberPool) {
    if (normalizeName(m.globalName) === normTarget) return m;
  }

  // 3. Exact match on Discord username
  for (const m of memberPool) {
    if (normalizeName(m.username) === normTarget) return m;
  }

  // 4. Substring/contains match (min length 4 to avoid false positive collisions)
  if (normTarget.length >= 4) {
    for (const m of memberPool) {
      const normNick = normalizeName(m.nick);
      if (normNick && (normNick.includes(normTarget) || normTarget.includes(normNick))) {
        return m;
      }
    }
    for (const m of memberPool) {
      const normGlobal = normalizeName(m.globalName);
      if (normGlobal && (normGlobal.includes(normTarget) || normTarget.includes(normGlobal))) {
        return m;
      }
    }
    for (const m of memberPool) {
      const normUser = normalizeName(m.username);
      if (normUser && (normUser.includes(normTarget) || normTarget.includes(normUser))) {
        return m;
      }
    }
  }

  return null;
}

/**
 * Resolves a Discord user ID for an attorney:
 * 1. Checks attorney.discordUserId in User table
 * 2. Checks RosterEntry.discordUserId by robloxUserId
 * 3. Pulls/matches against Discord members using display name or username
 * 4. Automatically saves matched discordUserId to database for future calls
 */
export async function resolveDiscordUserId(attorney: {
  id: string;
  displayName: string;
  username?: string | null;
  discordUserId?: string | null;
  robloxUserId?: string | null;
}): Promise<string | null> {
  // 1. Already linked directly on User
  if (attorney.discordUserId?.trim()) {
    return attorney.discordUserId.trim();
  }

  // 2. Check RosterEntry by robloxUserId
  if (attorney.robloxUserId) {
    try {
      const roster = await prisma.rosterEntry.findUnique({
        where: { robloxUserId: attorney.robloxUserId },
        select: { discordUserId: true },
      });
      if (roster?.discordUserId?.trim()) {
        const id = roster.discordUserId.trim();
        // Backfill User record
        await prisma.user.update({
          where: { id: attorney.id },
          data: { discordUserId: id },
        }).catch(() => null);
        return id;
      }
    } catch {
      // Continue to member matching
    }
  }

  // 3. Match against Discord guild members
  let matched = findBestDiscordMemberMatch(attorney.displayName);
  if (!matched && attorney.username) {
    matched = findBestDiscordMemberMatch(attorney.username);
  }

  // Optional: Try live bot search if configured and no match yet
  if (!matched && DISCORD_BOT_TOKEN) {
    try {
      const searchRes = await fetch(
        `https://discord.com/api/v10/guilds/${DAO_GUILD_ID}/members/search?query=${encodeURIComponent(
          attorney.displayName
        )}&limit=10`,
        {
          headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
          cache: "no-store",
        }
      );
      if (searchRes.ok) {
        const results = (await searchRes.json()) as Array<{
          nick?: string | null;
          user: { id: string; global_name?: string | null; username: string };
        }>;
        const livePool: CompactDiscordMember[] = results.map((r) => ({
          id: r.user.id,
          nick: r.nick ?? null,
          globalName: r.user.global_name ?? null,
          username: r.user.username,
        }));
        matched = findBestDiscordMemberMatch(attorney.displayName, livePool);
      }
    } catch (botErr) {
      console.warn("[discord-member-matching] Bot API search failed:", botErr);
    }
  }

  if (matched?.id) {
    const resolvedId = matched.id;
    // Persist to User and RosterEntry so future lookups are instant
    try {
      await prisma.user.update({
        where: { id: attorney.id },
        data: { discordUserId: resolvedId },
      });
    } catch (updateErr) {
      console.warn(`[discord-member-matching] Could not persist discordUserId to user ${attorney.id}:`, updateErr);
    }

    if (attorney.robloxUserId) {
      try {
        await prisma.rosterEntry.updateMany({
          where: { robloxUserId: attorney.robloxUserId },
          data: { discordUserId: resolvedId },
        });
      } catch (updateErr) {
        console.warn(`[discord-member-matching] Could not persist discordUserId to rosterEntry ${attorney.robloxUserId}:`, updateErr);
      }
    }

    return resolvedId;
  }

  return null;
}

export type ReminderType =
  | "INITIAL_FILING_APPROVED"
  | "FILING_OVERDUE"
  | "CASE_ASSIGNED"
  | "DISCOVERY_DUE"
  | "DISCOVERY_OVERDUE"
  | "HEARING_UPCOMING"
  | "FILING_RETURNED"
  | "INACTIVITY_ALERT";

export async function sendDiscordCaseReminder(
  type: ReminderType,
  caseIdOrNumber: string,
  options?: { note?: string; customHours?: number }
): Promise<{ ok: boolean; sent?: boolean; error?: string; content?: string }> {
  try {
    const caseRecord = await prisma.case.findFirst({
      where: {
        OR: [{ id: caseIdOrNumber }, { caseNumber: caseIdOrNumber }],
      },
      include: {
        assignedAttorney: {
          select: {
            id: true,
            displayName: true,
            username: true,
            discordUserId: true,
            robloxUserId: true,
          },
        },
      },
    });

    if (!caseRecord) {
      return { ok: false, error: `Case ${caseIdOrNumber} not found.` };
    }

    const attorney = caseRecord.assignedAttorney;
    if (!attorney) {
      return { ok: false, error: `Case ${caseRecord.caseNumber} has no assigned attorney.` };
    }

    // Resolve Discord user ID (checks DB, or pulls/matches Discord guild members)
    const discordUserId = await resolveDiscordUserId(attorney);

    const mention = discordUserId ? `<@${discordUserId}>` : `**@${attorney.displayName}**`;
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://districtattorneysoffice-production.up.railway.app").replace(/\/+$/, "");
    const caseLink = `${siteUrl}/dashboard/cases/${caseRecord.id}#filings`;
    const hours = options?.customHours ?? 24;

    let title = "Case reminder";
    let color = 0x344f8c;
    let description = "";
    switch (type) {
      case "INITIAL_FILING_APPROVED":
        title = "Initial filing approved";
        color = 0x2f855a;
        description = `Heads up, your initial filings are approved. You have ${hours} hours to get them filed in court and log the timestamp on the docket.`;
        break;
      case "FILING_OVERDUE":
        title = "Initial filing overdue";
        color = 0xc53030;
        description = "Your initial filing is past the 24-hour window. Get the paperwork submitted to the clerk immediately and mark it filed in the portal.";
        break;
      case "CASE_ASSIGNED":
        title = "Case assigned";
        description = "You’ve been assigned this case. Review the probable cause materials and start drafting your charging documents.";
        break;
      case "DISCOVERY_DUE":
        title = "Discovery due";
        color = 0xd69e2e;
        description = "Reminder: discovery disclosures are due within 24 hours. Upload the packet and log service on the defense in the portal.";
        break;
      case "DISCOVERY_OVERDUE":
        title = "Discovery overdue";
        color = 0xc53030;
        description = "Discovery is now overdue. Serve defense counsel right away to avoid court sanctions or evidence preclusion.";
        break;
      case "HEARING_UPCOMING":
        title = "Court appearance tomorrow";
        color = 0xd69e2e;
        description = "You have a court appearance tomorrow. Review the docket, check your case notes, and make sure your filings are in order.";
        break;
      case "FILING_RETURNED":
        title = "Filing returned";
        color = 0xc53030;
        description = `Your filing was returned with notes${options?.note ? `: “${options.note}”` : ""}. Check the reviewer comments in the portal, make the corrections, and resubmit.`;
        break;
      case "INACTIVITY_ALERT":
        title = "Case needs attention";
        color = 0xd69e2e;
        description = "This docket has been sitting without updates for a week. Check the case status and either advance the stage or move for disposition.";
        break;
    }

    if (!DISCORD_BOT_TOKEN) {
      return { ok: false, error: "DISCORD_BOT_TOKEN is not configured." };
    }

    const payload = {
      content: discordUserId ? mention : "",
      embeds: [{
        title: `${title}: ${caseRecord.caseNumber}`,
        url: caseLink,
        description,
        color,
        fields: [
          { name: "Case", value: `[${caseRecord.caseNumber}](${caseLink})`, inline: true },
          { name: "Assigned attorney", value: attorney.displayName, inline: true },
        ],
        footer: { text: "Harrison County District Attorney's Office" },
        timestamp: new Date().toISOString(),
      }],
      allowed_mentions: discordUserId
        ? { users: [discordUserId] }
        : { parse: [] },
    };

    const res = await fetch(
      `https://discord.com/api/v10/channels/${DISCORD_REMINDERS_CHANNEL_ID}/messages`,
      {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      },
      body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[discord case reminder] Bot API returned ${res.status}: ${errText}`);
      return { ok: false, error: `Discord API returned HTTP ${res.status}` };
    }

    return { ok: true, sent: true, content: `${mention} ${description} ${caseLink}`.trim() };
  } catch (err) {
    console.error("[discord case reminder] Unexpected failure", err);
    return { ok: false, error: String(err) };
  }
}
