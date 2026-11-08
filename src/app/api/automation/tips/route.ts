import { NextResponse } from "next/server";
import { authenticateLocalAutomationRequest } from "@/lib/local-automation-auth";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { decryptCrimeTip } from "@/lib/crime-tip-encryption";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const authResult = await authenticateLocalAutomationRequest(request, "");
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: { "Cache-Control": "no-store" } });
  }

  const { actor } = authResult;
  if (!hasCapability(actor.tiers, CAPABILITIES.TIPS_REVIEW)) {
    return NextResponse.json({ error: "Forbidden: You lack tips review capability." }, { status: 403 });
  }

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status")?.toUpperCase().trim();
  const categoryFilter = url.searchParams.get("category")?.toUpperCase().trim();
  const referenceFilter = url.searchParams.get("reference")?.toUpperCase().trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);

  const where: Record<string, unknown> = {};
  if (statusFilter) {
    where.status = statusFilter;
  }
  if (categoryFilter && (categoryFilter === "CRIME" || categoryFilter === "GANG")) {
    where.category = categoryFilter;
  }
  if (referenceFilter) {
    where.reference = { contains: referenceFilter };
  }

  const rows = await prisma.crimeTip.findMany({
    where,
    include: {
      assignedTo: { select: { id: true, displayName: true, username: true } },
      linkedCase: { select: { id: true, caseNumber: true, title: true } },
      attachments: { select: { id: true, fileName: true, byteSize: true, sha256: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const tips = rows.map((row) => {
    let details: Record<string, unknown> = {};
    try {
      details = decryptCrimeTip(row.encryptedPayload) as Record<string, unknown>;
    } catch {
      details = { error: "Failed to decrypt" };
    }

    return {
      id: row.id,
      reference: row.reference,
      category: row.category,
      status: row.status,
      crimeType: row.crimeType,
      suspect: details.suspectRoblox || details.suspectDiscord || details.suspectedGangName || "Unknown",
      location: details.location || null,
      incidentDateTime: details.incidentDateTime || null,
      narrativeSnippet: typeof details.narrative === "string" ? details.narrative.slice(0, 200) : null,
      assignedTo: row.assignedTo ? { id: row.assignedTo.id, displayName: row.assignedTo.displayName } : null,
      linkedCase: row.linkedCase ? { id: row.linkedCase.id, caseNumber: row.linkedCase.caseNumber, title: row.linkedCase.title } : null,
      attachmentsCount: row.attachments.length,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });

  return NextResponse.json({
    ok: true,
    count: tips.length,
    tips,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
