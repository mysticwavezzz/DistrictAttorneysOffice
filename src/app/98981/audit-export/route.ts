import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function csvCell(value: unknown) {
  let text = String(value ?? "");
  // Prevent spreadsheet formula execution for values originating in audit data.
  if (/^[\s]*[=+@\-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const params = new URL(request.url).searchParams;
  const bounded = (key: string) => (params.get(key) ?? "").trim().slice(0, 120);
  const validDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  const query = bounded("audit"), actor = bounded("actor"), action = bounded("action");
  const from = validDay(bounded("from")), to = validDay(bounded("to"));
  const toExclusive = to ? new Date(`${to}T00:00:00.000Z`) : null;
  if (toExclusive) toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  const where = {
    ...(actor ? { actorName: { contains: actor } } : {}),
    ...(action ? { action: { contains: action } } : {}),
    ...(query ? { OR: [{ actorName: { contains: query } }, { action: { contains: query } }, { details: { contains: query } }] } : {}),
    ...(from || toExclusive ? { createdAt: { ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}), ...(toExclusive ? { lt: toExclusive } : {}) } } : {}),
  };
  const entries = await prisma.settingsAuditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 5000 });
  const rows = [["Timestamp (UTC)", "Actor", "Action", "Details"], ...entries.map((entry) => [entry.createdAt.toISOString(), entry.actorName, entry.action, entry.details])];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="settings-audit.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
