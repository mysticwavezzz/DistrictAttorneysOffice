import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.announcement.createMany({
    data: [
      {
        title: "Office Statement on Recent Court Proceedings",
        body: "The District Attorney's Office remains committed to pursuing justice fairly and transparently for all residents of the county. Updates on ongoing proceedings will be posted here as they become available.",
        isPublished: true,
      },
      {
        title: "New Diversion Program Launched for First-Time Offenders",
        body: "Our office has partnered with county services to launch a diversion program aimed at reducing recidivism among first-time, non-violent offenders. Details on eligibility are available by contacting our office directly.",
        isPublished: true,
      },
      {
        title: "Office Hours Update",
        body: "The District Attorney's Office public records desk will observe updated hours starting next week. Please see the General Information section below for current hours.",
        isPublished: true,
      },
    ],
  });

  const attorney = await prisma.user.upsert({
    where: { robloxUserId: "1" },
    update: {},
    create: {
      robloxUserId: "1",
      username: "demo_attorney",
      displayName: "Demo Attorney",
    },
  });

  await prisma.case.createMany({
    data: [
      {
        caseNumber: "DA-2026-0142",
        title: "State v. Doe",
        status: "UNDER_REVIEW",
        summary: "Referred by county sheriff's office; under prosecutorial review.",
        assignedAttorneyId: attorney.id,
        createdById: attorney.id,
      },
      {
        caseNumber: "DA-2026-0139",
        title: "State v. Smith",
        status: "CHARGES_FILED",
        summary: "Charges filed; arraignment scheduled.",
        assignedAttorneyId: attorney.id,
        createdById: attorney.id,
      },
      {
        caseNumber: "DA-2026-0121",
        title: "State v. Roe",
        status: "CLOSED",
        summary: "Resolved via plea agreement.",
        assignedAttorneyId: attorney.id,
        createdById: attorney.id,
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
