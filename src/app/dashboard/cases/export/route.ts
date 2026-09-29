import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { localUser } from "@/lib/case-access";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function fmtDate(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const viewAll = hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW_ALL);
  const user = await localUser(session.user.discordUserId);

  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("tab") === "archived" ? "archived" : "ongoing";
  const q = (searchParams.get("q") ?? "").trim();
  const status = (searchParams.get("status") ?? "").trim();

  const where: Prisma.CaseWhereInput = { archived: tab === "archived" };
  if (!viewAll && user) {
    where.OR = [{ assignedAttorneyId: user.id }, { createdById: user.id }];
  }
  if (q) {
    where.AND = [
      {
        OR: [
          { title: { contains: q } },
          { caseNumber: { contains: q } },
          { assignedAttorney: { displayName: { contains: q } } },
        ],
      },
    ];
  }
  if (status) where.stage = status;

  const cases = await prisma.case.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { assignedAttorney: true },
  });

  const header = [
    "Case #",
    "Title",
    "Assigned",
    "Type",
    "Stage",
    "Disclosures",
    "Disc. Given",
    "Disc. Due",
    "Pretrial",
    "Other Dates",
    "Outcome",
    "Closed On",
    "Appeal By",
    "Archived",
    "Draft",
  ];

  const rows = cases.map((c) =>
    [
      c.caseNumber,
      c.title,
      c.assignedAttorney?.displayName ?? "",
      c.type ?? "",
      c.stage ?? "",
      c.disclosures ?? "",
      fmtDate(c.discGiven),
      fmtDate(c.discDue),
      fmtDate(c.pretrial),
      c.otherDates ?? "",
      c.outcome ?? "",
      fmtDate(c.closedOn),
      fmtDate(c.appealBy),
      c.archived ? "Yes" : "No",
      c.isDraft ? "Yes" : "No",
    ]
      .map(String)
      .map(csvEscape)
      .join(",")
  );

  const csv = [header.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cases-${tab}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
