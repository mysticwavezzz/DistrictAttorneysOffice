"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { recordsRequestSchema } from "@/lib/validation/records-request";
import { notifyMany, userIdsWithCapability } from "@/lib/notifications";
import { CAPABILITIES } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/client-ip";
import { headers } from "next/headers";
import { runWithActionDebug } from "@/lib/action-debug";

async function submitRecordsRequestImpl(formData: FormData) {
  const parsed = recordsRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/records-request?error=1");
  }
  const data = parsed.data;

  const ip = clientIpFromHeaders(new Headers(await headers()));
  const ipLimit = await checkRateLimit(`records-request:${ip}`, { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!ipLimit.allowed) redirect("/records-request?error=rate-limited");

  await prisma.recordsRequest.create({
    data: { name: data.name, contact: data.contact, details: data.details },
  });

  const recipients = await userIdsWithCapability(CAPABILITIES.REQUESTS_VIEW);
  await notifyMany(recipients, {
    type: "records_request",
    title: `New public records request from ${data.name}`,
    link: "/dashboard/records-requests",
  });

  redirect("/records-request?sent=1");
}

export async function submitRecordsRequest(formData: FormData) { return runWithActionDebug("submitRecordsRequest", [formData], () => submitRecordsRequestImpl(formData)); }
