"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { recordsRequestSchema } from "@/lib/validation/records-request";
import { notifyMany, userIdsWithCapability } from "@/lib/notifications";
import { CAPABILITIES } from "@/lib/permissions";

export async function submitRecordsRequest(formData: FormData) {
  const parsed = recordsRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/records-request?error=1");
  }
  const data = parsed.data;

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
