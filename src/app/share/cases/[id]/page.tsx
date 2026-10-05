import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { shareMetadata } from "@/lib/share-metadata";

type PageProps = { params: Promise<{ id: string }> };

async function getPreview(id: string) {
  return prisma.case.findUnique({
    where: { id },
    select: { caseNumber: true, title: true, type: true, stage: true },
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const record = await getPreview(id).catch(() => null);
  if (!record) return { title: "Case preview unavailable", robots: { index: false, follow: false } };

  const title = `${record.caseNumber} · ${record.title}`;
  const description = [record.type, record.stage ? `Status: ${record.stage}` : "Case record"]
    .filter(Boolean)
    .join(" · ");
  return {
    ...shareMetadata(title, description, `/dashboard/cases/${id}`),
    robots: { index: false, follow: false },
  };
}

export default async function CaseSharePreview({ params }: PageProps) {
  const { id } = await params;
  const record = await getPreview(id).catch(() => null);
  if (!record) notFound();

  return (
    <main className="share-preview-page">
      <p className="eyebrow">Harrison County District Attorney&apos;s Office · Case preview</p>
      <h1>{record.caseNumber}</h1>
      <p className="share-preview-title">{record.title}</p>
      <p>{[record.type, record.stage].filter(Boolean).join(" · ") || "Case record"}</p>
      <p>This preview contains basic case information only. Staff sign-in is required to view the case record.</p>
      <a className="govbtn" href={`/dashboard/cases/${encodeURIComponent(id)}`}>Open staff case record</a>
    </main>
  );
}
