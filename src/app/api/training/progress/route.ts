import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTrainingSnapshot, requireTrainee } from "@/lib/training/web";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const robloxUserId = session?.user?.robloxUserId;
  if (!robloxUserId) return NextResponse.json({ error: "Sign in with your Roblox staff account." }, { status: 401 });
  try {
    const { user } = await requireTrainee(robloxUserId);
    return NextResponse.json(await getTrainingSnapshot(user.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load course." }, { status: 403 });
  }
}
