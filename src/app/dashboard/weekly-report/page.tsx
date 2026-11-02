import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasActiveDeveloperProfile } from "@/lib/developer-profile-access";
import { DEVELOPER_PROFILE_TIER } from "@/lib/permissions/tiers";
import { getWeekStartKey, getWeeklyReportPostConvictionMetrics } from "@/lib/weekly-report-metrics";
import { saveWeeklyReportMetrics } from "./actions";

export const metadata = { title: "Weekly Report Figures | DAO", robots: { index: false } };
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

export default async function WeeklyReportEditorPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const session = await auth();
  const user = session?.user;
  const isDistrictAttorney = Boolean(user?.tiers.includes("district_attorney"));
  const isDeveloper = user
    ? user.tiers.includes(DEVELOPER_PROFILE_TIER) && await hasActiveDeveloperProfile(user)
    : false;
  if (!user?.providerUserId || (!isDistrictAttorney && !isDeveloper)) redirect("/login?error=forbidden");

  const weekStart = getWeekStartKey();
  const data = await getWeeklyReportPostConvictionMetrics(weekStart);
  const params = await searchParams;
  const formatDate = (value: string) => dateFormat.format(new Date(`${value}T00:00:00.000Z`));

  return <div className="weekly-report-editor">
    <p className="eyebrow">Public reporting · District Attorney</p>
    <h1>Weekly report figures</h1>
    <p className="lede">Maintain this week’s post-conviction figures for the public report. These counts appear without case names or personal details.</p>
    {params.saved === "1" && <p className="notice success" role="status">This week’s figures were saved and the public report updated.</p>}
    <section className="workbench-panel weekly-report-editor-panel" aria-labelledby="report-period-title">
      <div className="workbench-section-heading"><div><p className="eyebrow">Reporting period</p><h2 id="report-period-title">Week of {formatDate(weekStart)}</h2></div></div>
      <p className="note-inline">Enter verified totals for this reporting week. Prior figures are not carried into a new week.</p>
      <form action={saveWeeklyReportMetrics} className="weekly-report-edit-form">
        <input type="hidden" name="weekStart" value={weekStart} />
        <div className="weekly-report-edit-grid">
          <label className="field"><span>Expungements contested</span><input type="number" name="expungementsContested" min="0" max="100000" step="1" required defaultValue={data.expungementsContested} /><small>Contested expungement requests recorded this week.</small></label>
          <label className="field"><span>Expungements processed</span><input type="number" name="expungementsProcessed" min="0" max="100000" step="1" required defaultValue={data.expungementsProcessed} /><small>Expungement requests processed this week.</small></label>
          <label className="field"><span>Vacatur requests issued</span><input type="number" name="vacaturRequestsIssued" min="0" max="100000" step="1" required defaultValue={data.vacaturRequestsIssued} /><small>Vacatur requests issued this week.</small></label>
          <label className="field"><span>Vacatur requests processed</span><input type="number" name="vacaturRequestsProcessed" min="0" max="100000" step="1" required defaultValue={data.vacaturRequestsProcessed} /><small>Vacatur requests processed this week.</small></label>
        </div>
        <div className="weekly-report-editor-footer">
          <p>{data.updatedAt ? `Last updated ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(data.updatedAt))} by ${data.updatedBy ?? "office leadership"}.` : "No post-conviction figures have been entered for this week."}</p>
          <button type="submit" className="govbtn">Save this week’s figures</button>
        </div>
      </form>
    </section>
    <p className="note-inline">The weekly report’s case and filing totals continue to come from the case system. These four post-conviction figures are manually maintained here.</p>
  </div>;
}
