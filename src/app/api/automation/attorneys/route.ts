import { NextResponse } from "next/server";
import { authenticateLocalAutomationRequest } from "@/lib/local-automation-auth";
import { canAssignCase } from "@/lib/case-access";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { getDivisionCaseAssignees } from "@/lib/case-assignees";

export async function GET(request: Request) {
  const authResult = await authenticateLocalAutomationRequest(request, await request.text());
  if (!authResult.ok) return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: { "Cache-Control": "no-store" } });
  const { actor } = authResult;
  if (!canAssignCase(actor.tiers, actor.user.division)) return NextResponse.json({ error: "Your current role cannot assign cases." }, { status: 403 });

  const hasOfficeWideAssignment = hasCapability(actor.tiers, CAPABILITIES.CASES_ASSIGN);
  const assignees = await getDivisionCaseAssignees(
    hasOfficeWideAssignment ? null : actor.user.division,
    {
      divisionGroup: actor.user.divisionGroup,
      restrictToGroup: actor.tiers.includes("senior_assistant_district_attorney") && !hasOfficeWideAssignment,
    },
  );
  return NextResponse.json({ items: assignees }, { headers: { "Cache-Control": "no-store" } });
}
