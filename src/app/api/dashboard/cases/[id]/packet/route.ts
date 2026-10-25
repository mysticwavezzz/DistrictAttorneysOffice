import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { canAccessCase, localUser } from "@/lib/case-access";
import { decodeCasePdf } from "@/lib/filing-upload";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;

function clean(value: string) {
  return value.replace(/[\r\n\t]+/g, " ").replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?").trim();
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.providerUserId || !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await localUser(session.user);
  const { id } = await params;
  const record = user ? await prisma.case.findUnique({ where: { id }, include: {
    assignedAttorney: { select: { displayName: true } },
    createdBy: { select: { displayName: true } },
    filings: { where: { status: "ACCEPTED" }, orderBy: { createdAt: "asc" }, select: { title: true, pdfFileName: true, pdfData: true, url: true, createdAt: true, status: true, isInitial: true, reviewedAt: true } },
    aopcs: { where: { status: "ACCEPTED" }, orderBy: { createdAt: "asc" }, select: { title: true, reportId: true, pdfFileName: true, pdfData: true, documentUrl: true, createdAt: true, status: true } },
    events: { orderBy: { startsAt: "asc" }, select: { title: true, startsAt: true, kind: true, isCourtOrdered: true, details: true, sourceUrl: true } },
    evidence: { orderBy: { receivedAt: "asc" }, select: { title: true, kind: true, sourceName: true, fileName: true, sha256: true, sourceUrl: true, receivedAt: true, notes: true } },
  } }) : null;
  if (!user || !record || !canAccessCase(session!.user!.tiers, user.id, record, user.division, user.divisionGroup)) return NextResponse.json({ error: "Case not found" }, { status: 404 });

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  const lineHeight = 15;
  const addPage = () => { page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]); y = PAGE_HEIGHT - MARGIN; };
  const addLine = (value: string, size = 10, strong = false) => {
    if (y < MARGIN + lineHeight) addPage();
    page.drawText(clean(value).slice(0, 180), { x: MARGIN, y, size, font: strong ? bold : regular, color: rgb(0.12, 0.16, 0.22), maxWidth: PAGE_WIDTH - 2 * MARGIN });
    y -= lineHeight;
  };
  const section = (label: string) => { y -= 8; addLine(label.toUpperCase(), 12, true); };

  addLine("HARRISON COUNTY DISTRICT ATTORNEY'S OFFICE", 11, true);
  addLine("CASE PACKET INDEX · GENERATED FROM THE PORTAL RECORD", 9);
  section("Portal approval and actual court filing");
  const approvedInitial = record.filings.find((filing) => filing.isInitial);
  addLine(approvedInitial ? `Initial complaint approved in portal ${approvedInitial.reviewedAt ? approvedInitial.reviewedAt.toISOString() : ""}` : "No portal-approved initial complaint is linked.");
  addLine(record.courtFiledAt ? `Actual court filing date: ${record.courtFiledAt.toISOString()}` : "Actual court filing date has not been recorded.");
  if (record.courtDocketUrl) addLine(`Court record source: ${record.courtDocketUrl}`);
  y -= 8;
  addLine(`${record.caseNumber} · ${record.title}`, 16, true);
  addLine(`Division: ${record.division ?? "Unassigned"} · Attorney: ${record.assignedAttorney?.displayName ?? "Unassigned"} · Judge: ${record.assignedJudge ?? "Not assigned"}`);
  addLine(`Stage: ${record.stage ?? "Not set"} · Case type: ${record.type ?? "Not set"} · Updated: ${record.updatedAt.toISOString()}`);
  addLine(`Submitted by: ${record.createdBy.displayName} · Opened: ${record.createdAt.toISOString()}`);
  section("Case summary");
  for (const part of (record.summary || "No summary entered.").match(/.{1,100}(?:\s|$)/g) ?? []) addLine(part);
  if (record.disclosures) { section("Disclosure notes"); for (const part of record.disclosures.match(/.{1,100}(?:\s|$)/g) ?? []) addLine(part); }

  section("Accepted filings");
  if (!record.filings.length) addLine("No accepted filings are linked.");
  for (const filing of record.filings) {
    addLine(`${filing.title} · ${filing.pdfFileName ?? "No PDF"} · accepted ${filing.createdAt.toISOString()}`, 10, true);
    if (filing.url) addLine(`Source link: ${filing.url}`);
  }
  section("Accepted AOPCs and reports");
  if (!record.aopcs.length) addLine("No accepted AOPCs or reports are linked.");
  for (const aopc of record.aopcs) {
    addLine(`${aopc.reportId ?? aopc.title} · ${aopc.pdfFileName ?? "No PDF"} · accepted ${aopc.createdAt.toISOString()}`, 10, true);
    if (aopc.documentUrl) addLine(`Source link: ${aopc.documentUrl}`);
  }
  section("Calendar events");
  if (!record.events.length) addLine("No case-specific calendar events.");
  for (const event of record.events) addLine(`${event.startsAt.toISOString()} · ${event.isCourtOrdered ? "Court ordered" : "Office target"} · ${event.title}${event.details ? ` · ${event.details}` : ""}`);
  section("Evidence register");
  if (!record.evidence.length) addLine("No additional evidence inventory records.");
  for (const item of record.evidence) {
    addLine(`${item.kind} · ${item.title} · received ${item.receivedAt.toISOString()}`);
    if (item.fileName || item.sourceName) addLine(`File/source: ${item.fileName ?? ""} ${item.sourceName ?? ""}`);
    if (item.sha256) addLine(`SHA-256: ${item.sha256}`);
    if (item.sourceUrl) addLine(`Source link: ${item.sourceUrl}`);
    if (item.notes) for (const part of item.notes.match(/.{1,100}(?:\s|$)/g) ?? []) addLine(part);
  }
  section("Packet contents");
  addLine("The PDF index is followed by accepted PDF filings and accepted AOPC/report PDFs stored in the portal.");
  addLine("External source links are listed above and are not embedded. Pending or returned filings are excluded.");

  for (const filing of record.filings) {
    if (filing.pdfData && filing.pdfFileName) await pdf.attach(decodeCasePdf(filing.pdfData), filing.pdfFileName, { mimeType: "application/pdf", description: `${record.caseNumber} · ${filing.title} · ${filing.createdAt.toISOString()}` });
  }
  for (const aopc of record.aopcs) {
    if (aopc.pdfData && aopc.pdfFileName) await pdf.attach(decodeCasePdf(aopc.pdfData), aopc.pdfFileName, { mimeType: "application/pdf", description: `${record.caseNumber} · ${aopc.reportId ?? aopc.title} · ${aopc.createdAt.toISOString()}` });
  }

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${record.caseNumber.replace(/[^A-Za-z0-9_-]/g, "_")}-packet.pdf"`,
    "Cache-Control": "private, no-store",
  } });
}
