import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How the Harrison County District Attorney's Office website handles account and submitted information.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy" intro="This policy explains what information this website receives, why it is used, and which services help operate the site. The site is a Roblox community project and is not affiliated with a real government office or with Roblox.">
      <p><strong>Effective date:</strong> September 29, 2026.</p>

      <h2>Information handled by the site</h2>
      <ul>
        <li><strong>Staff sign-in:</strong> Staff sign in through Discord. The site receives the Discord account identifier, username, display name, and avatar information made available through the sign-in flow. It checks the account&apos;s current Discord server roles to decide which staff pages are available. A local staff profile stores the Discord identifier, display name, username, avatar URL, and permission tiers.</li>
        <li><strong>Roblox information:</strong> The site does not currently use Roblox OAuth as a sign-in method. Roblox usernames or IDs that you enter in a criminal tip are submitted with that report to the configured Google Form. If Roblox OAuth is added later, the Roblox authorization screen will show the requested access before you approve it; this policy will be updated to describe the information used before that feature goes live.</li>
        <li><strong>Reports and requests:</strong> Information entered in a criminal tip, including submitter and suspect identifiers, incident details, evidence links, witness information, and acknowledgments, is forwarded by the site to the office&apos;s configured Google Form. The website does not keep the body of a successfully submitted tip in its own database. The form provider and the people authorized to view its responses may handle that information under their own access and retention settings.</li>
        <li><strong>Other site content:</strong> Staff may create or review cases, affidavits, records requests, announcements, notifications, roster entries, and activity records. These are stored in the site&apos;s database and are available to staff whose configured permissions allow access.</li>
        <li><strong>Technical information:</strong> The hosting platform and the site may process basic request information, such as IP address, browser request headers, and session cookies, to deliver the site, prevent abuse, and maintain sign-in sessions. The site also uses rate-limit counters to restrict repeated crime-tip submissions.</li>
      </ul>

      <h2>How information is used</h2>
      <p>Information is used to authenticate staff, refresh Discord-role permissions, operate casework and site features, forward criminal tips to the configured form, prevent spam or blocked submissions, and keep the service secure. The site does not sell personal information or use it for advertising.</p>

      <h2>Services that process information</h2>
      <p>Discord provides staff authentication and server-role information. Google Forms receives criminal-tip submissions. Railway hosts the website and its database. Roblox is a separate platform; this website is not operated by Roblox. These providers process information under their own policies and service settings.</p>

      <h2>Storage, access, and deletion</h2>
      <p>Site records are retained in the website database while needed to operate the project. Authorized administrators can remove case and content records through the admin controls; that action does not remove staff accounts or roster entries. Tip responses are managed in Google Forms and are subject to the form owner&apos;s retention and deletion controls. Signing out ends your current browser session but does not automatically erase records already submitted or created.</p>

      <h2>Security and limits</h2>
      <p>Access to staff information is restricted by sign-in and configured permissions. No internet service can promise perfect security. Do not include passwords, payment information, government identification numbers, or other information that is not needed for a report. A report is not an emergency service; contact local emergency services for immediate danger.</p>

      <h2>Your questions</h2>
      <p>For a privacy question or a request about information you submitted, contact the site administrators through the Discord contacts listed on the <a href="/contacts">Contact Us page</a>. Requests about a criminal tip may also need to be handled by the owner of the Google Form where the response was received.</p>

      <h2>Changes to this policy</h2>
      <p>This policy may be updated when the site&apos;s features or data practices change. The date at the top identifies the latest revision.</p>
    </LegalPage>
  );
}
