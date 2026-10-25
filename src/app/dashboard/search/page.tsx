import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { caseVisibilityWhere, localUser } from "@/lib/case-access";
import { staffPageMetadata } from "@/lib/staff-metadata";
import { indexAcceptedCaseFiling } from "@/lib/filing-text-index";

export const metadata = staffPageMetadata("Staff Search", "Search accessible cases, filings, people, and connected source records.", "/dashboard/search");

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.DASHBOARD_VIEW)) redirect("/login?error=forbidden");

  const q = ((await searchParams).q ?? "").trim().slice(0, 120);
  const tiers = session.user.tiers;
  const canViewCases = hasCapability(tiers, CAPABILITIES.CASES_VIEW);
  const canViewRoster = hasCapability(tiers, CAPABILITIES.ROSTER_VIEW);
  const canManageAnnouncements = hasCapability(tiers, CAPABILITIES.ANNOUNCEMENTS_MANAGE);

  let cases: Array<{ id: string; title: string; caseNumber: string; stage: string | null; assignedAttorney: { displayName: string } | null }> = [];
  let pdfHits: Array<{ filingId: string; title: string; fileName: string | null; case: { id: string; caseNumber: string; title: string }; snippet: string }> = [];
  let indexQueued = 0;
  let roster: Array<{ id: string; name: string; rank: string | null }> = [];
  let releases: Array<{ id: string; title: string; audience: string }> = [];

  if (q) {
    if (canViewCases) {
      const user = await localUser(session.user);
      const visibility = caseVisibilityWhere(tiers, user?.id, user?.division, user?.divisionGroup);
      const visibleCase = visibility ? { AND: [visibility] } : {};
      const caseWhere: Prisma.CaseWhereInput = {
        archived: false,
        ...visibleCase,
        OR: [
          { title: { contains: q } }, { caseNumber: { contains: q } }, { summary: { contains: q } },
          { partyDetails: { contains: q } }, { assignedJudge: { contains: q } },
          { comments: { some: { body: { contains: q } } } },
          { filings: { some: { title: { contains: q } } } },
          { aopcs: { some: { OR: [{ reportId: { contains: q } }, { title: { contains: q } }, { subject: { contains: q } }, { narrative: { contains: q } }, { documentUrl: { contains: q } }] } } },
          { events: { some: { OR: [{ title: { contains: q } }, { details: { contains: q } }, { sourceUrl: { contains: q } }] } } },
          { evidence: { some: { OR: [{ title: { contains: q } }, { sourceName: { contains: q } }, { fileName: { contains: q } }, { notes: { contains: q } }, { sourceUrl: { contains: q } }] } } },
        ],
      };
      cases = await prisma.case.findMany({ where: caseWhere, select: { id: true, title: true, caseNumber: true, stage: true, assignedAttorney: { select: { displayName: true } } }, orderBy: { updatedAt: "desc" }, take: 30 });

      // Backfill a small number of previously accepted PDFs in the background of a search request.
      // Extraction runs locally; the PDF text is never submitted to a model by search.
      const unindexed = await prisma.caseFiling.findMany({
        where: { status: "ACCEPTED", pdfData: { not: null }, textIndex: null, ...(visibility ? { case: { AND: [visibility] } } : {}) },
        select: { id: true }, orderBy: { createdAt: "asc" }, take: 8,
      });
      const indexed = await Promise.allSettled(unindexed.map((filing) => indexAcceptedCaseFiling(filing.id)));
      indexQueued = indexed.filter((result) => result.status === "fulfilled" && result.value).length;

      const indexRows = await prisma.caseFilingTextIndex.findMany({
        where: { searchText: { contains: q }, filing: { status: "ACCEPTED", ...(visibility ? { case: { AND: [visibility] } } : {}) } },
        select: { pagesJson: true, filing: { select: { id: true, title: true, pdfFileName: true, case: { select: { id: true, caseNumber: true, title: true } } } } },
        take: 20,
      });
      pdfHits = indexRows.map((row) => {
        let snippet = "Matching words found in selectable PDF text.";
        try {
          const pages = JSON.parse(row.pagesJson) as Array<{ page: number; text: string }>;
          const match = pages.find((page) => page.text.toLocaleLowerCase().includes(q.toLocaleLowerCase()));
          if (match) {
            const position = match.text.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());
            snippet = `Page ${match.page}: …${match.text.slice(Math.max(0, position - 100), Math.min(match.text.length, position + q.length + 180)).replace(/\s+/g, " ")}…`;
          }
        } catch { /* Search result remains usable without a snippet. */ }
        return { filingId: row.filing.id, title: row.filing.title, fileName: row.filing.pdfFileName, case: row.filing.case, snippet };
      });
    }
    if (canViewRoster) roster = await prisma.rosterEntry.findMany({ where: { name: { contains: q } }, select: { id: true, name: true, rank: true }, take: 20 });
    if (canManageAnnouncements) releases = await prisma.announcement.findMany({ where: { title: { contains: q } }, select: { id: true, title: true, audience: true }, take: 20 });
  }

  return <div className="staff-search-page">
    <p className="eyebrow">Casework tools</p><h1>Staff Search</h1>
    <form className="field-row" style={{ alignItems: "flex-end", marginBottom: 16 }}>
      <div className="field" style={{ flex: "1 1 300px" }}><label htmlFor="q">Search case numbers, parties, charges, filings, transcripts, and staff</label><input type="search" id="q" name="q" defaultValue={q} placeholder="Search text or a case number" maxLength={120}/></div>
      <button type="submit" className="govbtn">Search records</button>
    </form>
    {q && <>
      {canViewCases && <section className="search-result-group"><h2>Cases and source records</h2>{cases.length || pdfHits.length ? <ul className="search-results">{cases.map((item) => <li key={item.id}><Link href={`/dashboard/cases/${item.id}`}><strong>{item.caseNumber} · {item.title}</strong></Link><span>{item.stage ?? "Stage not set"} · {item.assignedAttorney?.displayName ?? "Unassigned"}</span></li>)}</ul> : <p className="note-inline">No matching case records.</p>}
        {pdfHits.length > 0 && <><h3>Selectable text in accepted PDFs</h3><ul className="search-results">{pdfHits.map((hit) => <li key={hit.filingId}><Link href={`/dashboard/cases/${hit.case.id}#filings`}><strong>{hit.case.caseNumber} · {hit.title}</strong></Link><span>{hit.fileName ?? "PDF"} · {hit.snippet}</span></li>)}</ul></>}
        {indexQueued > 0 && <p className="note-inline">Indexed {indexQueued} accepted PDF{indexQueued === 1 ? "" : "s"} locally. Search again to include newly indexed text.</p>}
        <p className="hint">PDF text extraction runs on this server. Search does not send documents to AI.</p>
      </section>}
      {canViewRoster && <section className="search-result-group"><h2>Staff roster</h2>{roster.length ? <ul className="search-results">{roster.map((item) => <li key={item.id}><Link href="/dashboard/roster"><strong>{item.name}</strong></Link><span>{item.rank ?? "No rank set"}</span></li>)}</ul> : <p className="note-inline">No matching staff.</p>}</section>}
      {canManageAnnouncements && <section className="search-result-group"><h2>Public releases</h2>{releases.length ? <ul className="search-results">{releases.map((item) => <li key={item.id}><Link href={`/dashboard/announcements/${item.id}`}><strong>{item.title}</strong></Link><span>{item.audience}</span></li>)}</ul> : <p className="note-inline">No matching releases.</p>}</section>}
    </>}
  </div>;
}
