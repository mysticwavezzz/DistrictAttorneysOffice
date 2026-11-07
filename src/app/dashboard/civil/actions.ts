"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { PERMISSION_TIERS } from "@/lib/permissions/tiers";
import { localUser, generateCaseNumber } from "@/lib/case-access";
import { readCasePdf } from "@/lib/filing-upload";
import { getDivisionCaseAssignees } from "@/lib/case-assignees";
import { automaticallyAssignCase } from "@/lib/automatic-case-assignment";
import { logActivity } from "@/lib/activity-log";
import { runWithActionDebug } from "@/lib/action-debug";

async function createCivilMatterImpl(formData: FormData) {
  const session = await auth();
  if (!session?.user?.providerUserId || !hasCapability(session.user.tiers, CAPABILITIES.CASES_CREATE)) throw new Error("Forbidden");
  const user = await localUser(session.user);
  if (!user) throw new Error("Staff record not found");
  const officeWide = session.user.tiers.includes(PERMISSION_TIERS.DISTRICT_ATTORNEY) || session.user.tiers.includes(PERMISSION_TIERS.DEPUTY_DISTRICT_ATTORNEY) || session.user.tiers.includes("developer_profile");
  if (user.division !== "Civil Division" && !officeWide) throw new Error("Civil matters may only be opened by Civil Division staff or office leadership.");

  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const matterType = String(formData.get("matterType") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim().slice(0, 4000);
  if (!title || !summary) throw new Error("Enter a matter title and a short factual summary.");
  const allowedTypes = new Set(["Civil Complaint", "County Litigation", "Civil Rights Matter", "Other Civil Matter"]);
  if (!allowedTypes.has(matterType)) throw new Error("Choose a civil matter type.");

  const partyRows = formData.getAll("partyName").map((value, index) => ({ name: String(value).trim(), role: String(formData.getAll("partyRole")[index] ?? "") })).filter((party) => party.name);
  if (partyRows.length < 2 || partyRows.length > 20) throw new Error("Add at least a plaintiff and a defendant, and no more than 20 parties.");
  const parties = partyRows.map(({ name, role }) => {
    if (name.length > 100 || !["Plaintiff", "Defendant", "Other"].includes(role)) throw new Error("Check each party name and role.");
    return { name, role };
  });
  if (!parties.some((party) => party.role === "Plaintiff") || !parties.some((party) => party.role === "Defendant")) throw new Error("A civil matter needs at least one plaintiff and one defendant.");

  const complaint = await readCasePdf(formData.get("complaintPdf"));
  const complaintTitle = String(formData.get("complaintTitle") ?? "").trim().slice(0, 200) || "Initial Civil Complaint";
  const candidates = await getDivisionCaseAssignees("Civil Division");
  const canChooseAssignee = officeWide || hasCapability(session.user.tiers, CAPABILITIES.CASES_ASSIGN_DIVISION);
  let assignedAttorneyId: string | null = null;
  const requestedAssignee = String(formData.get("assignedAttorneyId") ?? "").trim();
  if (requestedAssignee && canChooseAssignee) {
    const candidate = candidates.find((item) => item.id === requestedAssignee);
    if (!candidate) throw new Error("Choose an active Civil Division attorney from the list.");
    assignedAttorneyId = candidate.id;
  } else if (candidates.length) {
    assignedAttorneyId = (await automaticallyAssignCase({ division: "Civil Division", type: matterType, stage: "Intake" })).attorney.id;
  }
  if (!assignedAttorneyId && user.division === "Civil Division") assignedAttorneyId = user.id;
  if (!assignedAttorneyId) throw new Error("No active Civil Division attorney is available. Add or place a Civil Division attorney before opening this matter.");

  const caseNumber = await generateCaseNumber();
  const created = await prisma.$transaction(async (tx) => {
    const record = await tx.case.create({ data: {
      caseNumber,
      title,
      type: matterType,
      stage: "Intake",
      division: "Civil Division",
      divisionGroup: null,
      assignedAttorneyId,
      createdById: user.id,
      partyDetails: JSON.stringify(parties),
      summary,
    } });
    if (complaint) await tx.caseFiling.create({ data: {
      caseId: record.id,
      title: complaintTitle,
      pdfData: complaint.pdfData,
      pdfFileName: complaint.pdfFileName,
      addedById: user.id,
      status: "DRAFT",
      isInitial: true,
      documentType: "OTHER",
    } });
    await tx.caseComment.create({ data: {
      caseId: record.id,
      isSystem: true,
      body: `Civil matter opened in the Civil Division by ${session.user.displayName}. ${complaint ? "An initial complaint PDF is attached as a draft; submit it for office review before filing." : "No complaint PDF was attached at intake; add the initiating pleading before filing."}`,
    } });
    return record;
  });
  await logActivity(session.user.displayName, "Opened civil matter", "Case", `${created.caseNumber} · ${created.title}`);
  revalidatePath("/dashboard/civil");
  revalidatePath("/dashboard/cases");
  redirect(`/dashboard/cases/${created.id}`);
}

export async function createCivilMatter(formData: FormData) {
  return runWithActionDebug("createCivilMatter", [formData], () => createCivilMatterImpl(formData));
}
