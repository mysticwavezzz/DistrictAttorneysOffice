import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { localUser } from "@/lib/case-access";
import { addFiling } from "@/app/dashboard/cases/actions";

export default async function FileOnCasePage({ searchParams }: { searchParams: Promise<{ caseId?: string }> }) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW)) redirect("/login?error=forbidden");
  const user = await localUser(session.user);
  if (!user) redirect("/login?error=forbidden");
  const query = await searchParams;
  const cases = await prisma.case.findMany({
    where: hasCapability(session.user.tiers, CAPABILITIES.CASES_VIEW_ALL) ? {} : { OR: [{ assignedAttorneyId: user.id }, { createdById: user.id }] },
    select: { id: true, caseNumber: true, title: true, isDraft: true },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  const selectedId = cases.some((item) => item.id === query.caseId) ? query.caseId : "";

  return <div className="case-file-page">
    <p className="eyebrow">Casework</p><h1>File a Document</h1>
    <p className="lede">Upload a PDF to add it to an existing case record.</p>
    {!cases.length ? <div className="empty-state"><h2>No cases available</h2><p>You need access to a case before filing a document.</p><Link href="/dashboard/cases/new" className="govbtn-outline">Open a Case</Link></div> : <form action={addFiling} className="formbox case-file-form" encType="multipart/form-data" noValidate>
      <input type="hidden" name="returnTo" value="filings" />
      <div className="field"><label htmlFor="filing-case">Case</label><select id="filing-case" name="caseId" required defaultValue={selectedId}><option value="" disabled>Select a case</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.caseNumber} · {item.title}{item.isDraft ? " (Draft)" : ""}</option>)}</select></div>
      <div className="field"><label htmlFor="filing-title">Document name</label><input id="filing-title" name="title" required maxLength={200} placeholder="Example: Supplemental report" /></div>
      <div className="field"><label htmlFor="filing-pdf">Upload PDF (max 5 MB)</label><input id="filing-pdf" name="pdf" type="file" accept="application/pdf,.pdf" required /></div>
      <div className="case-opening-controls"><Link href="/dashboard/filings" className="govbtn-outline">Cancel</Link><button type="submit" className="govbtn">Submit Filing</button></div>
    </form>}
  </div>;
}
