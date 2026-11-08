import { prisma } from "@/lib/prisma";
import daoMembersData from "@/config/dao-discord-members.json";

const DISCORD_REMINDERS_WEBHOOK =
  process.env.DISCORD_REMINDERS_WEBHOOK_URL ||
  "https://discord.com/api/webhooks/1566848656856977711/q2DpzAZiyVbeUOUhPZ0W76s9nsREk9J-xUiXMg_ud6T98UwBs4-G6Yo4O6ME4zU_ftPf";

const DAO_GUILD_ID = process.env.DISCORD_GUILD_ID || "1140770936442851429";
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "";

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

    let content = "";
    switch (type) {
      case "INITIAL_FILING_APPROVED":
        content = `${mention} heads up, your initial filings for ${caseLink} are approved. You have ${hours} hours to get them filed in court and log the timestamp on the docket.`;
        break;
      case "FILING_OVERDUE":
        content = `${mention} your initial filing on ${caseLink} is past the 24-hour window. Get the paperwork submitted to the clerk immediately and mark it filed on the portal.`;
        break;
      case "CASE_ASSIGNED":
        content = `${mention} you’ve been assigned to ${caseLink}. Review the probable cause materials and start drafting your charging documents.`;
        break;
      case "DISCOVERY_DUE":
        content = `${mention} reminder: discovery disclosures for ${caseLink} are due within 24 hours. Upload the packet and log defense service in the portal.`;
        break;
      case "DISCOVERY_OVERDUE":
        content = `${mention} discovery on ${caseLink} is now overdue. Serve defense counsel right away to avoid court sanctions or evidence preclusion.`;
        break;
      case "HEARING_UPCOMING":
        content = `${mention} you have a court appearance on ${caseLink} tomorrow. Review the docket, check your case notes, and make sure your filings are in order.`;
        break;
      case "FILING_RETURNED":
        content = `${mention} your filing on ${caseLink} was returned with notes${options?.note ? `: "${options.note}"` : ""}. Check the reviewer comments in the portal, make the corrections, and resubmit.`;
        break;
      case "INACTIVITY_ALERT":
        content = `${mention} docket ${caseLink} has been sitting without updates for a week. Check the case status and either advance the stage or move for disposition.`;
        break;
    }

    const payload = {
      content,
      allowed_mentions: discordUserId
        ? { users: [discordUserId] }
        : { parse: [] },
    };

    const res = await fetch(DISCORD_REMINDERS_WEBHOOK, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[discord case reminder] Webhook returned ${res.status}: ${errText}`);
      return { ok: false, error: `Webhook returned HTTP ${res.status}` };
    }

    return { ok: true, sent: true, content };
  } catch (err) {
    console.error("[discord case reminder] Unexpected failure", err);
    return { ok: false, error: String(err) };
  }
}
