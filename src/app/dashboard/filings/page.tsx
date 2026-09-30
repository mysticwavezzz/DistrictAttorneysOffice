import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { localUser } from "@/lib/case-access";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export default async function FilingHistoryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW)) redirect("/login?error=forbidden");
  const user = await localUser(session.user);
  if (!user) redirect("/login?error=forbidden");
  const query = (await searchParams).q?.trim() ?? "";
  const where = {
    ...(hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW_ALL) ? {} : { case: { OR: [{ assignedAttorneyId: user.id }, { createdById: user.id }] } }),
    ...(query ? { OR: [
      { title: { contains: query } },
      { case: { caseNumber: { contains: query } } },
      { case: { title: { contains: query } } },
    ] } : {}),
  };
  const filings = await prisma.caseFiling.findMany({
    where,
    select: {
      id: true, title: true, url: true, pdfFileName: true, createdAt: true,
      addedBy: { select: { displayName: true } },
      case: { select: { id: true, caseNumber: true, title: true, stage: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  }).catch((error) => {
    console.error("Failed to load case filing history", error);
    return [];
  });

  return <div>
    <p className="eyebrow">Casework</p>
    <div className="page-heading-row"><div><h1>Filing History</h1><p className="lede">Documents filed on cases you can access.</p></div><Link href="/dashboard/filings/new" className="govbtn">File on a Case</Link></div>
    <form className="field-row filing-search" role="search">
      <div className="field"><label htmlFor="filing-search">Search filings</label><input id="filing-search" name="q" defaultValue={query} placeholder="Document, case number, or title" /></div>
      <button className="govbtn-outline" type="submit">Search</button>
      {query && <Link className="govbtn-outline" href="/dashboard/filings">Clear</Link>}
    </form>
    {filings.length ? <div className="tablewrap"><table className="stat mobile-cards">
      <thead><tr><th scope="col">Date filed</th><th scope="col">Case</th><th scope="col">Document</th><th scope="col">Filed by</th><th scope="col">Next action</th></tr></thead>
      <tbody>{filings.map((filing) => <tr key={filing.id}>
        <td data-label="Date filed"><time dateTime={filing.createdAt.toISOString()}>{dateFormatter.format(filing.createdAt)}</time></td>
        <td data-label="Case"><Link href={`/dashboard/cases/${filing.case.id}`}><strong>{filing.case.caseNumber}</strong><br />{filing.case.title}</Link></td>
        <td data-label="Document">{filing.url ? <a href={filing.url} target="_blank" rel="noreferrer noopener">{filing.title}</a> : <strong>{filing.title}</strong>}{filing.pdfFileName && <span className="note-inline"> · {filing.pdfFileName}</span>}</td>
        <td data-label="Filed by">{filing.addedBy.displayName}</td>
        <td data-label="Next action"><span className="filing-row-actions">{filing.pdfFileName && <a href={`/api/cases/filings/${filing.id}/pdf`} target="_blank" rel="noreferrer noopener" className="govbtn-outline">View PDF</a>}<Link href={`/dashboard/cases/${filing.case.id}#filings`}>Open case</Link></span></td>
      </tr>)}</tbody>
    </table></div> : <div className="empty-state"><h2>No filings found</h2><p>{query ? "Try a different search." : "Documents filed on your cases will appear here."}</p><Link href="/dashboard/filings/new" className="govbtn-outline">File a document</Link></div>}
  </div>;
}
