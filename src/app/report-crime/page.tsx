import Link from "next/link";
import { auth } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { CRIME_TIP_FORM, type CrimeTipFormConfiguration } from "@/config/crime-tip-form";
import { getSiteConfiguration } from "@/lib/site-settings";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Sidebar } from "@/components/sidebar";
import { TipForm } from "@/components/tip-form";

export default async function ReportCrimePage() {
  const [session, form] = await Promise.all([
    auth(),
    getSiteConfiguration<CrimeTipFormConfiguration>("crimeTipForm", CRIME_TIP_FORM),
  ]);
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
          <p className="eyebrow">Office of the District Attorney</p>
          <h1>Official Criminal Tip Line</h1>
          <h2>Report Suspicious or Criminal Activity</h2>
          <p className="lede">The District Attorney’s Office relies on community vigilance to help keep {siteConfig.county} safe. This portal forwards roleplay tips to the office’s investigators.</p>
          <blockquote className="tip-mission">“To serve {siteConfig.county} with integrity, fairness, and an unwavering commitment to equal justice for all.”</blockquote>

          <section className="tip-notice" aria-labelledby="confidentiality-heading">
            <h2 id="confidentiality-heading">Confidentiality and Roleplay Notice</h2>
            <p>This is an in-character roleplay reporting system, not a channel for reporting real-world crimes. The form is hosted by Google Forms, and responses are available to the form owner and staff granted access there. The website cannot guarantee confidentiality or anonymity. Do not submit real sensitive personal information.</p>
            <p>Within the roleplay setting, investigators will handle reports discreetly. A reporter may be contacted in-character or asked to participate if a report leads to a roleplay case.</p>
          </section>

          <section className="tip-notice tip-emergency" aria-labelledby="emergency-heading">
            <h2 id="emergency-heading">Emergency Disclaimer</h2>
            <p>This tip line is for roleplay investigative information only. If there is a real emergency or someone is in immediate danger, contact local emergency services now.</p>
          </section>

          <TipForm crimeTypes={form.crimeTypes} defaultDiscordIdentity={discordIdentity} />
          <p className="source"><Link href="/">← Return to the office homepage</Link></p>
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}
