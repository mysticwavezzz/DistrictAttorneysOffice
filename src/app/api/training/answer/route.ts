import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordTrainingAnswer, requireTrainee } from "@/lib/training/web";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await auth();
  const robloxUserId = session?.user?.robloxUserId;
  if (!robloxUserId) return NextResponse.json({ error: "Sign in with your Roblox staff account." }, { status: 401 });
  try {
    const { user } = await requireTrainee(robloxUserId);
    const body = await request.json();
    const result = await recordTrainingAnswer(user.id, body);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save this answer." }, { status: 400 });
  }
}
