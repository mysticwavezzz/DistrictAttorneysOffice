"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { runWithActionDebug } from "@/lib/action-debug";

async function markRecordsRequestStatusImpl(formData: FormData) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.REQUESTS_VIEW)) {
    throw new Error("Forbidden");
  }

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["NEW", "IN_PROGRESS", "FULFILLED", "DENIED"].includes(status)) {
    throw new Error("Invalid status update");
  }

  await prisma.recordsRequest.update({ where: { id }, data: { status } });
  revalidatePath("/dashboard/review");
  revalidatePath("/dashboard/records-requests");
}

export async function markRecordsRequestStatus(formData: FormData) { return runWithActionDebug("markRecordsRequestStatus", [formData], () => markRecordsRequestStatusImpl(formData)); }
