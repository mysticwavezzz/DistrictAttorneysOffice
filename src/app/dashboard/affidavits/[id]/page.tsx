import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { localUser } from "@/lib/case-access";
import { PrintButton } from "@/components/print-button";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short" });

export default async function AffidavitPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const canReview = session?.user && hasCapability(session.user.tiers, CAPABILITIES.AOPC_REVIEW);
  const canSubmit = session?.user && hasCapability(session.user.tiers, CAPABILITIES.AOPC_SUBMIT);
  if (!session?.user || (!canReview && !canSubmit)) redirect("/login?error=forbidden");

  const affidavit = await prisma.aopc.findUnique({
    where: { id },
    include: { submittedBy: true, reviewedBy: true, linkedCase: true },
  });
  if (!affidavit) notFound();
  if (!canReview) {
    const user = await localUser(session.user.discordUserId);
    if (!user || affidavit.submittedById !== user.id) redirect("/login?error=forbidden");
  }

  return (
    <main className="paper affidavit-print">
      <p className="eyebrow">Affidavit of Probable Cause · {affidavit.targetUnit}</p>
      <h1>{affidavit.title}</h1>
      <p><strong>Status:</strong> {affidavit.status}</p>
      <p><strong>Submitted by:</strong> {affidavit.submittedBy.displayName} · {dateFormatter.format(affidavit.createdAt)}</p>
      {affidavit.documentUrl ? <p><strong>AOPC document:</strong> <a href={affidavit.documentUrl}>{affidavit.documentUrl}</a></p> : affidavit.pdfFileName ? <p><strong>AOPC document:</strong> <a href={`/api/aopcs/${affidavit.id}/pdf`}>View or download {affidavit.pdfFileName}</a></p> : <><p><strong>Subject:</strong> {affidavit.subject}</p><h2>Narrative</h2><p className="affidavit-narrative">{affidavit.narrative}</p></>}
      {affidavit.reviewedAt && <p><strong>Reviewed:</strong> {affidavit.reviewedBy?.displayName ?? "—"} · {dateFormatter.format(affidavit.reviewedAt)}</p>}
      {affidavit.reviewNote && <p><strong>Review note:</strong> {affidavit.reviewNote}</p>}
      {affidavit.linkedCase && <p><strong>Linked case:</strong> <Link href={`/dashboard/cases/${affidavit.linkedCase.id}`}>{affidavit.linkedCase.caseNumber} — {affidavit.linkedCase.title}</Link></p>}
      <div className="screen-only"><PrintButton /> <Link href="/dashboard/affidavits">Back to affidavits</Link></div>
    </main>
  );
}
