import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasCapability, CAPABILITIES } from "@/lib/permissions";
import { caseVisibilityWhere, localUser } from "@/lib/case-access";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !hasCapability(session.user.tiers, CAPABILITIES.DASHBOARD_VIEW)) {
    redirect("/login?error=forbidden");
  }

  const q = ((await searchParams).q ?? "").trim();
  const tiers = session.user.tiers;

  const canViewCases = hasCapability(tiers, CAPABILITIES.CASES_VIEW);
  const canViewRoster = hasCapability(tiers, CAPABILITIES.ROSTER_VIEW);
  const canManageAnnouncements = hasCapability(tiers, CAPABILITIES.ANNOUNCEMENTS_MANAGE);

  let cases: { id: string; title: string; caseNumber: string }[] = [];
  let roster: { id: string; name: string; rank: string | null }[] = [];
  let releases: { id: string; title: string; audience: string }[] = [];

  if (q) {
    if (canViewCases) {
      const user = await localUser(session.user);
      const where: Prisma.CaseWhereInput = {
        OR: [{ title: { contains: q } }, { caseNumber: { contains: q } }],
      };
      const visibility = caseVisibilityWhere(tiers, user?.id, user?.division);
      if (visibility) {
        where.AND = [visibility];
        cases = await prisma.case.findMany({
          where,
          select: { id: true, title: true, caseNumber: true },
          take: 20,
        });
      }
    }
    if (canViewRoster) {
      roster = await prisma.rosterEntry.findMany({
        where: { name: { contains: q } },
        select: { id: true, name: true, rank: true },
        take: 20,
      });
    }
    if (canManageAnnouncements) {
      releases = await prisma.announcement.findMany({
        where: { title: { contains: q } },
        select: { id: true, title: true, audience: true },
        take: 20,
      });
    }
  }

  return (
    <div>
      <h1>Staff Search</h1>
      <form className="field-row" style={{ alignItems: "flex-end", marginBottom: 16 }}>
        <div className="field" style={{ flex: "1 1 300px" }}>
          <label htmlFor="q">Search cases, roster, and releases</label>
          <input type="text" id="q" name="q" defaultValue={q} placeholder="Search..." />
        </div>
        <button type="submit" className="govbtn">
          Search
        </button>
      </form>

      {q && (
        <>
          {canViewCases && (
            <>
              <h2>Cases</h2>
              {cases.length === 0 ? (
                <p className="note-inline">No matching cases.</p>
              ) : (
                <ul style={{ paddingLeft: 18 }}>
                  {cases.map((c) => (
                    <li key={c.id}>
                      <Link href={`/dashboard/cases/${c.id}`}>
                        {c.caseNumber} &mdash; {c.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {canViewRoster && (
            <>
              <h2>Roster</h2>
              {roster.length === 0 ? (
                <p className="note-inline">No matching roster entries.</p>
              ) : (
                <ul style={{ paddingLeft: 18 }}>
                  {roster.map((r) => (
                    <li key={r.id}>
                      <Link href="/dashboard/roster">
                        {r.name} &mdash; {r.rank ?? "No rank set"}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {canManageAnnouncements && (
            <>
              <h2>Releases</h2>
              {releases.length === 0 ? (
                <p className="note-inline">No matching releases.</p>
              ) : (
                <ul style={{ paddingLeft: 18 }}>
                  {releases.map((r) => (
                    <li key={r.id}>
                      <Link href={`/dashboard/announcements/${r.id}`}>{r.title}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
