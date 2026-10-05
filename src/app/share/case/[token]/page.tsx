import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { siteConfig } from "@/config/site";
import { getCaseSharePreview } from "@/lib/case-share-preview";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

async function previewFromParams(params: Props["params"]) {
  return getCaseSharePreview((await params).token);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const record = await getCaseSharePreview(token);
  if (!record) return { title: "Shared case preview" };
  const title = `${record.caseNumber} · ${record.title}`;
  const description = [record.type || "Case", record.stage || "Status not set", "Shared case preview"].join(" · ");
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.AUTH_URL || "https://districtattorneysoffice-production.up.railway.app";
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      type: "article",
      title,
      description,
      url: new URL(`/share/case/${token}`, baseUrl).toString(),
      siteName: `${siteConfig.county} ${siteConfig.name}`,
      images: [{ url: `/share/case/${token}/opengraph-image`, width: 1200, height: 630, alt: `Case ${record.caseNumber}` }],
    },
    twitter: { card: "summary_large_image", title, description, images: [`/share/case/${token}/opengraph-image`] },
  };
}

export default async function CaseSharePreviewPage({ params }: Props) {
  const record = await previewFromParams(params);
  if (!record) notFound();
  return <main className="shared-case-preview">
    <p className="eyebrow">Shared case preview</p>
    <h1>{record.caseNumber}</h1>
    <h2>{record.title}</h2>
    <dl>
      <div><dt>Type</dt><dd>{record.type || "Not set"}</dd></div>
      <div><dt>Status</dt><dd>{record.stage || "Not set"}</dd></div>
    </dl>
    <p>This limited preview was shared by a staff member. Case documents, parties, filings, and internal notes are not shown here.</p>
    <Link href={`/login?callbackUrl=${encodeURIComponent(`/dashboard/cases/${record.id}`)}`} className="govbtn">Sign in to view the case</Link>
  </main>;
}
