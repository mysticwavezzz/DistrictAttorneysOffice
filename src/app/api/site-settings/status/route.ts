import { NextResponse } from "next/server";
import { getSiteSettings } from "@/lib/site-settings";
import { getSiteConfiguration } from "@/lib/site-settings";
import { env } from "@/lib/env";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (request.headers.get("x-maintenance-check") !== env.AUTH_SECRET) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [settings, exemptTiers, exemptUserIds] = await Promise.all([
    getSiteSettings(),
    getSiteConfiguration<string[]>("maintenanceExemptTiers", []),
    getSiteConfiguration<string[]>("maintenanceExemptDiscordUserIds", []),
  ]);
  return NextResponse.json(
    {
      maintenanceMode: settings.maintenanceMode,
      exemptTiers,
      exemptUserIds,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
