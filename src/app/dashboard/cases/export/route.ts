import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { localUser } from "@/lib/case-access";
import { escapeCsvCell } from "@/lib/csv";
import { caseDocketWhere, withOverdueCaseFilter } from "@/lib/case-docket-query";

function fmtDate(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await localUser(session.user);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("tab") === "archived" ? "archived" : "ongoing";
  const q = (searchParams.get("q") ?? "").trim();
  const status = (searchParams.get("status") ?? "").trim();
  const canFilterStaff = hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW_ALL) || hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW_DIVISION);
  const staffId = canFilterStaff && searchParams.get("mine") !== "1" ? searchParams.get("staff") : null;
  const allAccessible = staffId === "all";
  const selectedStaff = staffId && !allAccessible ? await prisma.user.findFirst({ where: {
    id: staffId,
    ...(hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW_ALL) ? { tiers: { not: "" } } : {
      division: user.division ?? "__no_division__",
      ...(session.user.tiers.includes("senior_assistant_district_attorney") && user.division === "Criminal Division" ? { divisionGroup: user.divisionGroup ?? "__no_group__" } : {}),
    }),
  }, select: { id: true } }) : null;
  if (staffId && !allAccessible && !selectedStaff) return NextResponse.json({ error: "Invalid employee filter" }, { status: 400 });
  let where = caseDocketWhere({ tiers: session.user.tiers, viewerId: user.id, viewerDivision: user.division, viewerGroup: user.divisionGroup, ownerId: allAccessible ? null : selectedStaff?.id ?? user.id, tab, q, status, reviewOnly: searchParams.get("review") === "1" });
  if (!where) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (searchParams.get("deadline") === "overdue") where = await withOverdueCaseFilter(where);
  const sorts = ["caseNumber", "title", "stage", "updatedAt"] as const;
  const sortInput = searchParams.get("sort");
  const sort = sorts.find((item) => item === sortInput) ?? "updatedAt";
  const direction = searchParams.get("dir") === "asc" ? "asc" : "desc";

  const cases = await prisma.case.findMany({
    where,
    orderBy: { [sort]: direction },
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
      .map(escapeCsvCell)
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
