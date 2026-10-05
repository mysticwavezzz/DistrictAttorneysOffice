import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How the Harrison County District Attorney's Office website handles account and submitted information.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy" intro="This policy explains what information this website receives, why it is used, and which services help operate the site. The site is a Roblox community project and is not affiliated with a real government office or with Roblox.">
      <p><strong>Effective date:</strong> October 4, 2026.</p>

      <h2>Information handled by the site</h2>
      <ul>
        <li><strong>Staff sign-in:</strong> Staff sign in with Roblox OAuth. The site receives the Roblox account identifier, username, display name, and avatar information, and checks current Roblox community roles to decide which staff pages are available. Discord sign-in and Discord server roles are not used for website access. A Discord user ID may be associated with a staff profile for identification or optional notifications.</li>
        <li><strong>Roblox information:</strong> When Roblox sign-in is enabled, the site uses Roblox OpenID Connect profile information to identify the account and checks its roles in the configured Roblox community. Those roles determine staff permissions. Roblox usernames or IDs entered in a criminal tip are separately submitted with that report to the configured Google Form.</li>
        <li><strong>Reports and requests:</strong> Information entered in a criminal tip, including submitter and suspect identifiers, incident details, evidence links, witness information, and acknowledgments, is forwarded by the site to the office&apos;s configured Google Form. The website does not keep the body of a successfully submitted tip in its own database. The form provider and the people authorized to view its responses may handle that information under their own access and retention settings.</li>
        <li><strong>Other site content:</strong> Staff may create or review cases, affidavits, records requests, announcements, notifications, roster entries, and activity records. These are stored in the site&apos;s database and are available to staff whose configured permissions allow access.</li>
        <li><strong>Technical information:</strong> The hosting platform and the site may process basic request information, such as IP address, browser request headers, and essential session cookies, to deliver the site, prevent abuse, and maintain sign-in sessions. Abuse-prevention counters use hashed network identifiers. If you opt in through Privacy Choices, the site records aggregate counts of public page views by page and UTC day. It does not store individual page-view histories, query strings, account identifiers, or advertising identifiers. Your choice is saved in this browser&apos;s local storage; optional analytics does not set tracking cookies.</li>
      </ul>

      <h2>How information is used</h2>
      <p>Information is used to authenticate staff, refresh role-based permissions, operate casework and site features, forward criminal tips to the configured form, prevent spam or blocked submissions, understand aggregate public-site use when a visitor opts in, and keep the service secure. The site does not sell personal information or use it for advertising. You may change your optional analytics choice using the Privacy Choices control.</p>

      <h2>Services that process information</h2>
      <p>Roblox provides staff authentication and group-role information. Discord may be used for an associated user identity and optional notifications, but does not determine website permissions. Google Forms receives criminal-tip submissions. Railway hosts the website and its database. These providers process information under their own policies and service settings.</p>

      <h2>Storage, access, and deletion</h2>
      <p>Site records are retained in the website database while needed to operate the project. An authorized administrator can use the admin controls to permanently clear staff accounts, roster entries, and case and content records; the action signs out all staff and cannot be undone. The website configuration, including sign-in and role mappings, Google Forms settings, site settings, configuration backups, and their audit trail, is preserved. Tip responses are managed in Google Forms and are subject to the form owner&apos;s retention and deletion controls. Signing out by itself does not erase records already submitted or created.</p>

      <h2>Security and limits</h2>
      <p>Access to staff information is restricted by sign-in and configured permissions. No internet service can promise perfect security. Do not include passwords, payment information, government identification numbers, or other information that is not needed for a report. A report is not an emergency service; contact local emergency services for immediate danger.</p>

      <h2>Your questions</h2>
      <p>For a privacy question or a request about information you submitted, send a private message through the <a href="/contacts">Contact Us mailbox</a>. Requests about a criminal tip may also need to be handled by the owner of the Google Form where the response was received.</p>

      <h2>Changes to this policy</h2>
      <p>This policy may be updated when the site&apos;s features or data practices change. The date at the top identifies the latest revision.</p>
    </LegalPage>
  );
}
