import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSiteConfiguration } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [session, settings, exemptTiers, exemptUserIds] = await Promise.all([
      auth(),
      prisma.siteSettings.findUnique({ where: { id: 1 }, select: { maintenanceMode: true } }),
      getSiteConfiguration<string[]>("maintenanceExemptTiers", []),
      getSiteConfiguration<string[]>("maintenanceExemptDiscordUserIds", []),
    ]);
    const user = session?.user;
    const id = user?.providerUserId ?? user?.robloxUserId ?? user?.discordUserId;
    const exempt = Boolean(id && exemptUserIds.includes(id)) || Boolean(user?.tiers?.some((tier) => exemptTiers.includes(tier)));
    return NextResponse.json({ maintenanceMode: Boolean(settings?.maintenanceMode), maintenanceRequired: Boolean(settings?.maintenanceMode && !exempt) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Maintenance status health check failed", error);
    // A failed settings/database health check takes public routes offline, while
    // /98981 and /maintenance remain reachable for recovery and explanation.
    return NextResponse.json({ maintenanceMode: true, maintenanceRequired: true }, { headers: { "Cache-Control": "no-store" }, status: 503 });
  }
}
