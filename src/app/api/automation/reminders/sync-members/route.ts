import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateLocalAutomationRequest } from "@/lib/local-automation-auth";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { findBestDiscordMemberMatch, type CompactDiscordMember } from "@/lib/discord/case-reminders";

const memberInputSchema = z.object({
  id: z.string().trim().min(1),
  nick: z.string().trim().nullable().optional(),
  globalName: z.string().trim().nullable().optional(),
  username: z.string().trim().min(1),
});

const bodySchema = z.object({
  members: z.array(memberInputSchema).optional(),
}).strict().optional();

export async function POST(request: Request) {
  const rawBody = await request.text();
  const authResult = await authenticateLocalAutomationRequest(request, rawBody);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: { "Cache-Control": "no-store" } });
  }

  const { actor } = authResult;
  if (!hasCapability(actor.tiers, CAPABILITIES.CASES_VIEW) && !hasCapability(actor.tiers, CAPABILITIES.ROSTER_VIEW)) {
    return NextResponse.json({ error: "Forbidden: You lack permission to sync roster members." }, { status: 403 });
  }

  let customMembers: CompactDiscordMember[] | undefined = undefined;
  if (rawBody.trim()) {
    try {
      const parsed = bodySchema.safeParse(JSON.parse(rawBody));
      if (parsed.success && parsed.data?.members) {
        customMembers = parsed.data.members.map((m) => ({
          id: m.id,
          nick: m.nick ?? null,
          globalName: m.globalName ?? null,
          username: m.username,
        }));
      }
    } catch {
      // Fallback to default bundled member pool
    }
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      displayName: true,
      username: true,
      robloxUserId: true,
      discordUserId: true,
    },
  });

  const linked: Array<{ id: string; displayName: string; discordUserId: string }> = [];

  for (const user of users) {
    if (user.discordUserId?.trim()) continue;

    const match = findBestDiscordMemberMatch(user.displayName, customMembers) ||
      (user.username ? findBestDiscordMemberMatch(user.username, customMembers) : null);

    if (match?.id) {
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { discordUserId: match.id },
        });

        if (user.robloxUserId) {
          await prisma.rosterEntry.updateMany({
            where: { robloxUserId: user.robloxUserId },
            data: { discordUserId: match.id },
          });
        }

        linked.push({
          id: user.id,
          displayName: user.displayName,
          discordUserId: match.id,
        });
      } catch (err) {
        console.warn(`[sync-members] Could not update user ${user.displayName}:`, err);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    totalUsers: users.length,
    linkedCount: linked.length,
    linked,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  // Allow GET to run auto-match against bundled members
  return POST(request);
}
