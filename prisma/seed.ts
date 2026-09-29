import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const attorney = await prisma.user.upsert({
    where: { discordUserId: "1" },
    update: { tiers: "district_attorney" },
    create: {
      discordUserId: "1",
      username: "demo_attorney",
      displayName: "Demo Attorney",
      tiers: "district_attorney",
    },
  });

  const ada = await prisma.user.upsert({
    where: { discordUserId: "2" },
    update: { tiers: "da_attorney" },
    create: {
      discordUserId: "2",
      username: "demo_ada",
      displayName: "Demo Assistant Attorney",
      tiers: "da_attorney",
    },
  });

  await prisma.user.upsert({
    where: { discordUserId: "3" },
    update: { tiers: "da_paralegal" },
    create: {
      discordUserId: "3",
      username: "demo_paralegal",
      displayName: "Demo Paralegal",
      tiers: "da_paralegal",
    },
  });

  await prisma.user.upsert({
    where: { discordUserId: "6" },
    update: { tiers: "special_investigations" },
    create: {
      discordUserId: "6",
      username: "demo_sib",
      displayName: "Demo Special Investigations Investigator",
      tiers: "special_investigations",
    },
  });

  await prisma.announcement.createMany({
    data: [
      {
        title: "Office Statement on Recent Court Proceedings",
        summary:
          "The office reaffirms its commitment to fair, transparent prosecution as several high-profile matters proceed through the county court system.",
        body: "The District Attorney's Office remains committed to pursuing justice fairly and transparently for all residents of the county. Updates on ongoing proceedings will be posted here as they become available.",
        audience: "PUBLIC",
        isPublished: true,
        createdById: attorney.id,
      },
      {
        title: "New Diversion Program Launched for First-Time Offenders",
        summary:
          "A new partnership with county services aims to reduce recidivism among first-time, non-violent offenders through supervised diversion.",
        body: "Our office has partnered with county services to launch a diversion program aimed at reducing recidivism among first-time, non-violent offenders. Details on eligibility are available by contacting our office directly.",
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/US-CourtOfAppeals-9thCircuit-Seal.png/240px-US-CourtOfAppeals-9thCircuit-Seal.png",
        audience: "PUBLIC",
        isPublished: true,
        createdById: attorney.id,
      },
      {
        title: "Office Hours Update",
        body: "The District Attorney's Office public records desk will observe updated hours starting next week. Please see the General Information section below for current hours.",
        audience: "PUBLIC",
        isPublished: true,
        createdById: attorney.id,
      },
      {
        title: "Evidence Submission Reminder",
        body: "All evidence packets submitted with a case referral should include chain-of-custody documentation. Referrals missing this documentation will be returned for resubmission.",
        audience: "LAW_ENFORCEMENT",
        isPublished: true,
        createdById: attorney.id,
      },
    ],
  });

  await prisma.case.createMany({
    data: [
      {
        caseNumber: "DA-2026-0142",
        title: "State v. Doe",
        type: "Felony",
        stage: "Discovery",
        summary: "Referred by county sheriff's office; under prosecutorial review.",
        assignedAttorneyId: attorney.id,
        createdById: attorney.id,
        archived: false,
      },
      {
        caseNumber: "DA-2026-0139",
        title: "State v. Smith",
        type: "Misdemeanor",
        stage: "Pretrial",
        summary: "Charges filed; arraignment scheduled.",
        assignedAttorneyId: ada.id,
        createdById: ada.id,
        archived: false,
      },
      {
        caseNumber: "DA-2026-0121",
        title: "State v. Roe",
        type: "Felony",
        stage: "Closed - Plea Agreement",
        outcome: "Plea agreement",
        summary: "Resolved via plea agreement.",
        assignedAttorneyId: attorney.id,
        createdById: attorney.id,
        archived: true,
      },
    ],
  });

  await prisma.rosterEntry.createMany({
    data: [
      {
        name: "Demo Attorney",
        rank: "District Attorney",
        about: "Heads the office and sets prosecutorial priorities for the county.",
      },
      {
        name: "Demo Assistant Attorney",
        rank: "Assistant District Attorney",
        unit: "Criminal Division",
      },
      { name: "Demo Paralegal", rank: "Paralegal" },
      {
        name: "Demo Criminal Division Chief",
        rank: "Chief Assistant District Attorney",
        unit: "Criminal Division",
        about: "Leads the Criminal Division's prosecution of general criminal matters.",
      },
      {
        name: "Demo Civil Division Chief",
        rank: "Chief Assistant District Attorney",
        unit: "Civil Division",
        about: "Leads the Civil Division's litigation on behalf of the county.",
      },
      {
        name: "Demo Public Integrity Supervisor",
        rank: "Supervisory Assistant District Attorney",
        unit: "Public Integrity Bureau",
      },
      {
        name: "Demo Special Investigations Investigator",
        unit: "Special Investigations Bureau",
        discordUserId: "6",
      },
    ],
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
