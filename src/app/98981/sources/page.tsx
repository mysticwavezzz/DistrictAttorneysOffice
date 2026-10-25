import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { shareMetadata } from "@/lib/share-metadata";
import { saveLegalSource, setLegalSourceActive } from "../source-actions";

export const metadata = shareMetadata("Legal Source Library", "Manage text sources available to the advisory research tools.", "/98981/sources");
const categories = ["Criminal Procedure", "Civil Procedure", "Statutes", "County Charter", "Justice Manual", "Guide to Law", "Case Law", "Other"];

export default async function LegalSourcesPage() {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.SETTINGS_MANAGE)) redirect("/login?error=forbidden");
  const sources = await prisma.legalSource.findMany({ orderBy: [{ category: "asc" }, { title: "asc" }], take: 200, select: { id: true, title: true, citation: true, category: true, version: true, sourceUrl: true, isActive: true, updatedAt: true } });
  return <main className="paper source-library-page">
    <p className="eyebrow">Hidden Control Panel · AI reference library</p><h1>Legal source library</h1>
    <p className="lede">Add current Harrison County rules, statutes, charter sections, manuals, and case law as separate text sources. Research runs can quote only connected text and show its citation, version, and link.</p>
    <p className="note-inline">Do not add case-specific facts here. Upload UTF-8 .txt or .md text under 500 KB, or paste source text. Files are stored in the app database and are not sent to an AI model during upload.</p>
    <section className="workbench-panel"><h2>Add a source</h2><form action={saveLegalSource} encType="multipart/form-data" className="workbench-form"><div className="field"><label htmlFor="source-title">Title</label><input id="source-title" name="title" maxLength={200} required/></div><div className="field"><label htmlFor="source-category">Category</label><select id="source-category" name="category">{categories.map((category) => <option key={category}>{category}</option>)}</select></div><div className="field"><label htmlFor="source-citation">Citation / section</label><input id="source-citation" name="citation" maxLength={240} placeholder="Ches. R. Crim. P. Rule 2.1"/></div><div className="field"><label htmlFor="source-version">Version / effective date</label><input id="source-version" name="version" maxLength={100} placeholder="Current as of YYYY-MM-DD"/></div><div className="field field-wide"><label htmlFor="source-url">Official source link</label><input id="source-url" name="sourceUrl" type="url" maxLength={2000}/></div><div className="field field-wide"><label htmlFor="source-file">Text file <span className="hint">.txt or .md, up to 500 KB</span></label><input id="source-file" name="sourceFile" type="file" accept=".txt,.md,text/plain,text/markdown"/></div><div className="field field-wide"><label htmlFor="source-content">Or paste source text</label><textarea id="source-content" name="content" rows={8} maxLength={500000}/></div><button className="govbtn" type="submit">Add source</button></form></section>
    <section className="workbench-panel"><div className="workbench-section-heading"><div><p className="eyebrow">Research authorities</p><h2>Connected sources</h2></div><span className="pill pill-muted">{sources.filter((source) => source.isActive).length} active</span></div>
      {sources.length ? <div className="source-library-list">{sources.map((source) => <article key={source.id}><div><span className={`pill ${source.isActive ? "pill-green" : "pill-muted"}`}>{source.isActive ? "Active" : "Inactive"}</span> <span className="pill pill-navy">{source.category}</span><h3>{source.title}</h3><p>{source.citation || "No citation entered"}{source.version ? ` · ${source.version}` : ""} · Updated {source.updatedAt.toLocaleDateString("en-US", { timeZone: "America/New_York" })}</p>{source.sourceUrl && <a href={source.sourceUrl} target="_blank" rel="noreferrer noopener">Open source ↗</a>}</div><div className="source-library-actions"><Link className="govbtn-outline" href={`/98981/sources/${source.id}`}>Edit</Link><form action={setLegalSourceActive}><input type="hidden" name="id" value={source.id}/><input type="hidden" name="active" value={String(!source.isActive)}/><button className="linklike" type="submit">{source.isActive ? "Deactivate" : "Activate"}</button></form></div></article>)}</div> : <div className="empty-state"><h2>No external sources have been loaded</h2><p>Add an official authority before using procedural research mode.</p></div>}
    </section>
    <p><Link className="govbtn-outline" href="/98981">Back to site settings</Link></p>
  </main>;
}
