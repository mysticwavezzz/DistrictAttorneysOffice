import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms for using the Harrison County District Attorney's Office Roblox community website.",
};

export default function TermsOfServicePage() {
  return (
    <LegalPage title="Terms of Service" intro="By visiting or using this website, you agree to these terms. If you do not agree, do not use the site or submit information through it.">
      <p><strong>Effective date:</strong> September 29, 2026.</p>

      <h2>What this site is</h2>
      <p>This is a community website connected to a Roblox game. It is not a real district attorney&apos;s office, government service, law-enforcement agency, or emergency service. It is not affiliated with, endorsed by, or operated by Roblox Corporation. Names and materials associated with Roblox remain subject to Roblox&apos;s terms and applicable rights.</p>

      <h2>Accounts and sign-in</h2>
      <p>Staff access uses Roblox sign-in and checks the account&apos;s current roles in the configured Roblox community. Discord may be linked to an account for identification or notifications, but Discord sign-in and server roles do not grant website access. You are responsible for keeping control of your Roblox account and for activity performed through it. Do not attempt to bypass permissions, impersonate another person, interfere with the site, or access information that is not intended for you.</p>

      <h2>Submitting information</h2>
      <p>Submit accurate information and only material you are permitted to share. Do not use forms to harass, threaten, impersonate, spam, or knowingly submit false or malicious reports. Tips are sent to a configured Google Form and may be reviewed by authorized people; submitting a tip does not create a confidential or privileged relationship and does not guarantee a response, investigation, or particular outcome.</p>
      <p>Do not submit emergencies through this site. Contact local emergency services if anyone is in immediate danger. Do not upload or link material that violates another person&apos;s rights or exposes sensitive information unrelated to the report.</p>

      <h2>Staff tools and content</h2>
      <p>Staff must use the portal only for its community and game-related purpose, follow their assigned permissions, and protect information they can access. Administrators may correct, restrict, archive, or remove site content and may suspend access when needed to protect the service or its users.</p>

      <h2>Availability and changes</h2>
      <p>The site is provided as available. Features may change, be paused for maintenance, or be removed. We do not promise uninterrupted access, permanent storage, or that every submitted item will be processed successfully. Keep your own copies of documents you need.</p>

      <h2>Limits</h2>
      <p>To the extent allowed by applicable law, the site operators are not responsible for losses arising from interruptions, inaccurate user submissions, third-party services, or reliance on information on this community site. Nothing on the site is legal advice or a real government determination.</p>

      <h2>Changes and contact</h2>
      <p>These terms may be revised as the site changes. Continued use after an updated version is posted means you accept the revised terms. Questions can be sent through the Discord contacts on the <a href="/contacts">Contact Us page</a>.</p>
    </LegalPage>
  );
}
