import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SignOutButton } from "@/components/sign-out-button";
import { shareMetadata } from "@/lib/share-metadata";

export const metadata = shareMetadata("Sign In", "Sign in with Roblox to submit a tip, contact the office, or access staff tools when your account has an active role.", "/login");

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "Your Roblox sign-in is valid for public services, but this account does not currently have a role for the requested staff page.",
  OAuthSignin: "We couldn't start the sign-in flow. Please try again.",
  OAuthCallback: "Sign-in didn't complete successfully. Please try again.",
  OAuthAccountNotLinked:
    "This account isn't linked correctly. Please contact an administrator.",
  AccessDenied: "Access was denied by the identity provider. Please try again.",
  Configuration: "Roblox sign-in is misconfigured. Please contact the office.",
  Default: "Something went wrong signing in. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string; reset?: string }>;
}) {
  const query = await searchParams;
  const session = await auth();
  const providerReady = Boolean(process.env.ROBLOX_CLIENT_ID && process.env.ROBLOX_CLIENT_SECRET);
  const requestedCallbackUrl = query.callbackUrl ?? "/";
  const callbackUrl = requestedCallbackUrl.startsWith("/") && !requestedCallbackUrl.startsWith("//") && !requestedCallbackUrl.includes("\\")
    ? requestedCallbackUrl
    : "/";
  const returnDestination = callbackUrl.startsWith("/contacts")
    ? "Contact Us"
    : callbackUrl.startsWith("/report-crime")
      ? "the crime tip line"
      : callbackUrl.startsWith("/gang-tip")
        ? "the gang tip line"
        : callbackUrl.startsWith("/dashboard")
          ? "the staff portal"
          : "the public website";

  if (session?.user?.providerUserId && session.user.identityProvider === "roblox" && !query.error) {
    redirect(callbackUrl);
  }

  const errorMessage = query.error
    ? ERROR_MESSAGES[query.error] ?? ERROR_MESSAGES.Default
    : null;

  const isDifferentProvider = Boolean(session?.user?.providerUserId) && session?.user.identityProvider !== "roblox";

  return (
    <div className="wrap">
      <a href="#main" className="skiplink">
        Skip to main content
      </a>

      <SiteHeader />

      <div className="body">
        <aside className="side">
          <div className="sbox">
            <h3>This Section</h3>
            <ul>
              <li>
                <Link href="/">Return to Public Site</Link>
              </li>
            </ul>
          </div>
        </aside>

        <main className="paper" id="main">
          <p className="eyebrow">{siteConfig.county}</p>
          <h1>Sign In</h1>
          <p className="lede">Sign in with Roblox to continue to {returnDestination}. Roblox verification is used to identify public submissions. Staff tools remain limited to accounts with an active role.</p>

          {errorMessage && (
            <p className="message message-error" role="alert">
              {errorMessage}
            </p>
          )}

          {query.reset === "complete" && (
            <p className="message message-success" role="status">
              All saved website data was cleared. All staff must sign in again.
            </p>
          )}

          <div className="formbox" style={{ maxWidth: 420 }}>
            {isDifferentProvider ? (
              <>
                <p>Signed in as <strong>{session!.user.displayName}</strong> with {session!.user.identityProvider}. Sign out to use Roblox sign-in.</p>
                <SignOutButton redirectTo="/login" className="govbtn">Sign Out</SignOutButton>
              </>
            ) : (
              providerReady ? <form
                action={async () => {
                  "use server";
                  await signIn("roblox", { redirectTo: callbackUrl });
                }}
              >
                <button type="submit" className="govbtn">
                  Continue with Roblox
                </button>
              </form> : <p className="message message-error" role="alert">Roblox sign-in is not configured yet. Add its client ID and rotated secret in Railway.</p>
            )}
          </div>

          <section className="tip-notice" aria-label="Available services" style={{ marginTop: 18 }}>
            <h2>Use the site</h2>
            <ul>
              <li><Link href="/report-crime">Submit a crime tip</Link></li>
              <li><Link href="/gang-tip">Submit a gang tip</Link></li>
              <li><Link href="/contacts">Contact the office</Link></li>
            </ul>
            <p>Staff access is based on active Roblox group roles. If you believe your role is wrong, contact the office.</p>
          </section>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}
