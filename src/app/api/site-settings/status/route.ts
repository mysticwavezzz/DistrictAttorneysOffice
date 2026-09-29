import { NextResponse } from "next/server";
import { getSiteSettings } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSiteSettings();
  return NextResponse.json(
    {
      maintenanceMode: settings.maintenanceMode,
      maintenanceMessage: settings.maintenanceMessage,
      maintenanceEstimatedAt: settings.maintenanceEstimatedAt,
      updatedAt: settings.updatedAt,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
