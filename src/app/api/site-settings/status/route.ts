import { NextResponse } from "next/server";
import { getSiteConfiguration } from "@/lib/site-settings";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (request.headers.get("x-maintenance-check") !== env.AUTH_SECRET) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [settings, exemptTiers, exemptUserIds] = await Promise.all([
    prisma.siteSettings.findUnique({ where: { id: 1 } }),
    getSiteConfiguration<string[]>("maintenanceExemptTiers", []),
    getSiteConfiguration<string[]>("maintenanceExemptDiscordUserIds", []),
  ]);
  return NextResponse.json(
    {
      maintenanceMode: settings?.maintenanceMode ?? false,
      exemptTiers,
      exemptUserIds,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
