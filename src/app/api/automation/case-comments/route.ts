import { NextResponse } from "next/server";
import { authenticateLocalAutomationRequest, type LocalAutomationActor } from "@/lib/local-automation-auth";
import { canAccessCase, canViewCases } from "@/lib/case-access";
import { prisma } from "@/lib/prisma";

const responseHeaders = { "Cache-Control": "no-store" };

async function getOwnedManualComments(actor: LocalAutomationActor) {
  const comments = await prisma.caseComment.findMany({
    where: {
      authorId: actor.user.id,
      isSystem: false,
      case: { is: { division: "Criminal Division" } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      body: true,
      createdAt: true,
      case: {
        select: {
          id: true,
          caseNumber: true,
          title: true,
          assignedAttorneyId: true,
          createdById: true,
          division: true,
          divisionGroup: true,
          isDraft: true,
        },
      },
    },
  });
  return comments.filter((comment) => canAccessCase(
    actor.tiers,
    actor.user.id,
    comment.case,
    actor.user.division,
    actor.user.divisionGroup,
  ));
}

export async function GET(request: Request) {
  const rawBody = await request.text();
  const authResult = await authenticateLocalAutomationRequest(request, rawBody);
  if (!authResult.ok) return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: responseHeaders });
  if (!canViewCases(authResult.actor.tiers)) {
    return NextResponse.json({ error: "Your current role cannot view case comments." }, { status: 403, headers: responseHeaders });
  }

  const comments = await getOwnedManualComments(authResult.actor);
  return NextResponse.json({ items: comments }, { headers: responseHeaders });
}

export async function DELETE(request: Request) {
  const rawBody = await request.text();
  const authResult = await authenticateLocalAutomationRequest(request, rawBody);
  if (!authResult.ok) return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: responseHeaders });
  if (!canViewCases(authResult.actor.tiers)) {
    return NextResponse.json({ error: "Your current role cannot manage case comments." }, { status: 403, headers: responseHeaders });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Provide a JSON list of comment IDs." }, { status: 400, headers: responseHeaders });
  }
  const ids = body && typeof body === "object" && "ids" in body ? (body as { ids?: unknown }).ids : null;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100 || ids.some((id) => typeof id !== "string" || id.length < 1 || id.length > 100)) {
    return NextResponse.json({ error: "Provide between 1 and 100 valid comment IDs." }, { status: 400, headers: responseHeaders });
  }
  const uniqueIds = [...new Set(ids as string[])];
  if (uniqueIds.length !== ids.length) {
    return NextResponse.json({ error: "Duplicate comment IDs are not allowed." }, { status: 400, headers: responseHeaders });
  }

  const accessibleComments = await getOwnedManualComments(authResult.actor);
  const targets = accessibleComments.filter((comment) => uniqueIds.includes(comment.id));
  if (targets.length !== uniqueIds.length) {
    return NextResponse.json({ error: "One or more comments are missing, system-generated, outside Criminal Division, or not authored by this account." }, { status: 404, headers: responseHeaders });
  }

  const result = await prisma.caseComment.deleteMany({
    where: {
      id: { in: uniqueIds },
      authorId: authResult.actor.user.id,
      isSystem: false,
      case: { is: { division: "Criminal Division" } },
    },
  });
  if (result.count !== uniqueIds.length) {
    return NextResponse.json({ error: "The comment set changed before deletion. Refresh the list and retry." }, { status: 409, headers: responseHeaders });
  }
  return NextResponse.json({ deletedCount: result.count }, { headers: responseHeaders });
}
