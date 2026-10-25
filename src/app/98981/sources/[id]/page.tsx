import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { shareMetadata } from "@/lib/share-metadata";
import { saveLegalSource } from "../../source-actions";

export const metadata = shareMetadata("Edit Legal Source", "Update a text-only authority used by procedural research.", "/98981/sources");
const categories = ["Criminal Procedure", "Civil Procedure", "Statutes", "County Charter", "Justice Manual", "Guide to Law", "Case Law", "Other"];

export default async function EditLegalSourcePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.SETTINGS_MANAGE)) redirect("/login?error=forbidden");
  const { id } = await params;
  const source = await prisma.legalSource.findUnique({ where: { id } });
  if (!source) notFound();
  return <main className="paper source-library-page"><p className="eyebrow">Hidden Control Panel · AI reference library</p><h1>Edit source</h1><p className="lede">Keep one current authority per source record and update the version whenever the text changes.</p>
    <section className="workbench-panel"><form action={saveLegalSource} encType="multipart/form-data" className="workbench-form"><input type="hidden" name="id" value={source.id}/><div className="field"><label htmlFor="source-title">Title</label><input id="source-title" name="title" maxLength={200} required defaultValue={source.title}/></div><div className="field"><label htmlFor="source-category">Category</label><select id="source-category" name="category" defaultValue={source.category}>{categories.map((category) => <option key={category}>{category}</option>)}</select></div><div className="field"><label htmlFor="source-citation">Citation / section</label><input id="source-citation" name="citation" maxLength={240} defaultValue={source.citation}/></div><div className="field"><label htmlFor="source-version">Version / effective date</label><input id="source-version" name="version" maxLength={100} defaultValue={source.version}/></div><div className="field field-wide"><label htmlFor="source-url">Official source link</label><input id="source-url" name="sourceUrl" type="url" maxLength={2000} defaultValue={source.sourceUrl ?? ""}/></div><div className="field field-wide"><label htmlFor="source-file">Replace text file <span className="hint">.txt or .md, up to 500 KB</span></label><input id="source-file" name="sourceFile" type="file" accept=".txt,.md,text/plain,text/markdown"/></div><div className="field field-wide"><label htmlFor="source-content">Source text</label><textarea id="source-content" name="content" rows={18} maxLength={500000} required defaultValue={source.content}/></div><button className="govbtn" type="submit">Save changes</button><Link className="govbtn-outline" href="/98981/sources">Cancel</Link></form></section>
  </main>;
}
