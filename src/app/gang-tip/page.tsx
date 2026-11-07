import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Sidebar } from "@/components/sidebar";
import { GangTipForm } from "@/components/gang-tip-form";
import { shareMetadata } from "@/lib/share-metadata";

export const metadata = shareMetadata("Gang Tip Line", "Submit information about suspected organized criminal activity for restricted review.", "/gang-tip");

export default async function GangTipPage() {
  const session = await auth();
  if (session?.user?.identityProvider !== "roblox" || !session.user.robloxUserId || !session.user.username) redirect("/login?callbackUrl=%2Fgang-tip");
  return <div className="wrap"><a href="#main" className="skiplink">Skip to main content</a><SiteHeader/><div className="body"><Sidebar/><main className="paper" id="main">
    <p className="eyebrow">District Attorney&apos;s Office · Restricted intake</p><h1>Gang Tip Line</h1><h2>Report Suspected Gang Activity</h2>
    <p className="lede">Send information about suspected organized criminal activity to the District Attorney&apos;s Office for review. Include what you personally observed and how you know it. A tip is an allegation, not a determination.</p>
    <section className="tip-notice" aria-labelledby="gang-confidentiality-heading"><h2 id="gang-confidentiality-heading">Confidentiality Notice</h2><p>Your Roblox username is verified through sign-in and included with the report. The report and attached files are stored encrypted and can be opened only by authorized tip reviewers. Do not include passwords or real-world sensitive information.</p><p>Submissions enter the restricted Review Inbox. They do not automatically designate a group, open a case, or establish criminal conduct.</p></section>
    <section className="tip-notice tip-emergency" aria-labelledby="gang-emergency-heading"><h2 id="gang-emergency-heading">Emergency Disclaimer</h2><p>This tip line is not monitored for emergencies. If someone is in immediate danger, contact local emergency services now.</p></section>
    <GangTipForm username={session.user.username} robloxUserId={session.user.robloxUserId}/>
  </main></div><SiteFooter/></div>;
}
