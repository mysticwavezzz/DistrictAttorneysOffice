"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { caseInputSchema, emptyToNull, toDate } from "@/lib/validation/case";

export async function createCase(formData: FormData) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE)) {
    throw new Error("Forbidden");
  }

  const parsed = caseInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error("Invalid case data");
  }
  const data = parsed.data;

  const creator = await prisma.user.findUnique({
    where: { discordUserId: session.user.discordUserId },
  });
  if (!creator) {
    throw new Error("Local staff record not found");
  }

  const created = await prisma.case.create({
    data: {
      title: data.title,
      caseNumber: data.caseNumber,
      type: emptyToNull(data.type),
      stage: emptyToNull(data.stage),
      disclosures: emptyToNull(data.disclosures),
      discGiven: toDate(data.discGiven),
      discDue: toDate(data.discDue),
      pretrial: toDate(data.pretrial),
      otherDates: emptyToNull(data.otherDates),
      outcome: emptyToNull(data.outcome),
      closedOn: toDate(data.closedOn),
      appealBy: toDate(data.appealBy),
      summary: emptyToNull(data.summary) ?? "",
      assignedAttorneyId: emptyToNull(data.assignedAttorneyId),
      createdById: creator.id,
    },
  });

  revalidatePath("/dashboard/cases");
  redirect(`/dashboard/cases/${created.id}`);
}

export async function updateCase(formData: FormData) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_EDIT)) {
    throw new Error("Forbidden");
  }

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing case id");

  const parsed = caseInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error("Invalid case data");
  }
  const data = parsed.data;

  await prisma.case.update({
    where: { id },
    data: {
      title: data.title,
      caseNumber: data.caseNumber,
      type: emptyToNull(data.type),
      stage: emptyToNull(data.stage),
      disclosures: emptyToNull(data.disclosures),
      discGiven: toDate(data.discGiven),
      discDue: toDate(data.discDue),
      pretrial: toDate(data.pretrial),
      otherDates: emptyToNull(data.otherDates),
      outcome: emptyToNull(data.outcome),
      closedOn: toDate(data.closedOn),
      appealBy: toDate(data.appealBy),
      summary: emptyToNull(data.summary) ?? "",
      assignedAttorneyId: emptyToNull(data.assignedAttorneyId),
      archived: formData.get("archived") === "on",
    },
  });

  revalidatePath("/dashboard/cases");
  revalidatePath(`/dashboard/cases/${id}`);
  redirect(`/dashboard/cases/${id}`);
}

export async function deleteCase(formData: FormData) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_DELETE)) {
    throw new Error("Forbidden");
  }

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing case id");

  await prisma.case.delete({ where: { id } });

  revalidatePath("/dashboard/cases");
  redirect("/dashboard/cases");
}
