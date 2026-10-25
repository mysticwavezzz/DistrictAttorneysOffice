"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { updateSiteConfiguration } from "@/lib/site-settings";
import { logActivity } from "@/lib/activity-log";
import { isAllowedGroqModel } from "@/lib/ai-model";

export async function updateAiModel(formData: FormData) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.SETTINGS_MANAGE)) throw new Error("Forbidden");
  const modelId = String(formData.get("modelId") ?? "").trim();
  if (!isAllowedGroqModel(modelId)) throw new Error("Choose a model in the approved server-side allowlist.");
  await updateSiteConfiguration("aiGroqModel", modelId);
  await logActivity(session.user.displayName, `Changed Groq model to ${modelId}`, "AI configuration", modelId);
  revalidatePath("/98981/ai");
  revalidatePath("/dashboard/review");
}
