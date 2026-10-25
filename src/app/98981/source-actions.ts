"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";

const CATEGORIES = new Set(["Criminal Procedure", "Civil Procedure", "Statutes", "County Charter", "Justice Manual", "Guide to Law", "Case Law", "Other"]);

async function requireSourceManager() {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.SETTINGS_MANAGE)) throw new Error("Forbidden");
  return session.user;
}

function safeSourceUrl(value: string) {
  if (!value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : null;
  } catch { return null; }
}

export async function saveLegalSource(formData: FormData) {
  const user = await requireSourceManager();
  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const citation = String(formData.get("citation") ?? "").trim().slice(0, 240);
  const category = String(formData.get("category") ?? "Other");
  const version = String(formData.get("version") ?? "").trim().slice(0, 100);
  const sourceUrlRaw = String(formData.get("sourceUrl") ?? "").trim();
  const sourceUrl = safeSourceUrl(sourceUrlRaw);
  const file = formData.get("sourceFile");
  const pastedText = String(formData.get("content") ?? "").trim();
  let content = pastedText;
  if (file instanceof File && file.size > 0) {
    if (file.size > 500_000 || !/\.(txt|md)$/i.test(file.name)) throw new Error("Upload a UTF-8 .txt or .md file under 500 KB.");
    content = (await file.text()).trim();
  }
  if (!title || !CATEGORIES.has(category) || !content || content.length > 500_000 || (sourceUrlRaw && !sourceUrl)) throw new Error("Check the source title, category, text, and link.");
  const data = { title, citation, category, sourceUrl, version, content, updatedById: user.id, updatedByName: user.displayName };
  const source = id ? await prisma.legalSource.update({ where: { id }, data }) : await prisma.legalSource.create({ data });
  await logActivity(user.displayName, id ? "Updated legal research source" : "Added legal research source", "LegalSource", `${source.category} · ${source.title}`);
  revalidatePath("/98981/sources");
  revalidatePath("/dashboard/reports");
}

export async function setLegalSourceActive(formData: FormData) {
  const user = await requireSourceManager();
  const id = String(formData.get("id") ?? "").trim();
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) throw new Error("Source not found.");
  const source = await prisma.legalSource.update({ where: { id }, data: { isActive: active, updatedById: user.id, updatedByName: user.displayName } });
  await logActivity(user.displayName, `${active ? "Activated" : "Deactivated"} legal research source`, "LegalSource", `${source.category} · ${source.title}`);
  revalidatePath("/98981/sources");
}
