import { prisma } from "@/lib/prisma";

const DISCORD_REMINDERS_WEBHOOK =
  process.env.DISCORD_REMINDERS_WEBHOOK_URL ||
  "https://discord.com/api/webhooks/1566848656856977711/q2DpzAZiyVbeUOUhPZ0W76s9nsREk9J-xUiXMg_ud6T98UwBs4-G6Yo4O6ME4zU_ftPf";

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

    // Resolve Discord user ID from User, or fallback to RosterEntry
    let discordUserId = attorney.discordUserId;
    if (!discordUserId && attorney.robloxUserId) {
      const roster = await prisma.rosterEntry.findUnique({
        where: { robloxUserId: attorney.robloxUserId },
        select: { discordUserId: true },
      });
      if (roster?.discordUserId) {
        discordUserId = roster.discordUserId;
      }
    }

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
      allowed_mentions: {
        parse: ["users"],
        users: discordUserId ? [discordUserId] : [],
      },
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
