import Link from "next/link";
import { auth } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { CRIME_TIP_FORM, type CrimeTipFormConfiguration } from "@/config/crime-tip-form";
import { getSiteConfiguration } from "@/lib/site-settings";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Sidebar } from "@/components/sidebar";
import { TipForm } from "@/components/tip-form";
import { shareMetadata } from "@/lib/share-metadata";

export const metadata = shareMetadata("Official Criminal Tip Line", "Submit incident details and supporting information through the dedicated report form. Not for emergencies.", "/report-crime");

export default async function ReportCrimePage() {
  const [session, form] = await Promise.all([
    auth(),
    getSiteConfiguration<CrimeTipFormConfiguration>("crimeTipForm", CRIME_TIP_FORM),
  ]);
  const robloxIdentity = session?.user?.identityProvider === "roblox"
    ? `${session.user.username} / ${session.user.robloxUserId}`
    : "";
  const discordIdentity = session?.user?.discordUserId
    ? `${session.user.username} / ${session.user.discordUserId}`
    : "";

  return (
    <div className="wrap">
      <a href="#main" className="skiplink">Skip to main content</a>
      <SiteHeader />
      <div className="body">
        <Sidebar />
        <main className="paper" id="main">
          <p className="eyebrow">District Attorney&apos;s Office</p>
          <h1>Official Criminal Tip Line</h1>
          <h2>Report Suspicious or Criminal Activity</h2>
          <p className="lede">The District Attorney&apos;s Office relies on community vigilance to help keep {siteConfig.county} safe. This portal forwards tips to the office&apos;s investigators.</p>

          <section className="tip-notice" aria-labelledby="confidentiality-heading">
            <h2 id="confidentiality-heading">Confidentiality Notice</h2>
            <p>The form is hosted by Google Forms, and responses are available to the form owner and staff granted access there. The website cannot guarantee confidentiality or anonymity. Do not submit sensitive personal information.</p>
            <p>Investigators will handle reports discreetly. A reporter may be contacted if additional information is needed.</p>
          </section>

          <section className="tip-notice tip-emergency" aria-labelledby="emergency-heading">
            <h2 id="emergency-heading">Emergency Disclaimer</h2>
            <p>This tip line is not monitored for emergencies. If someone is in immediate danger, contact local emergency services now.</p>
          </section>

          <TipForm crimeTypes={form.crimeTypes} defaultRobloxIdentity={robloxIdentity} defaultDiscordIdentity={discordIdentity} />
          <p className="source"><Link href="/">← Return to the office homepage</Link></p>
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}
