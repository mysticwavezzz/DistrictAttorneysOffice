import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SignOutButton } from "@/components/sign-out-button";
import { staffPageMetadata } from "@/lib/staff-metadata";

export const metadata = staffPageMetadata("Staff Sign In", "Sign in with Roblox to access staff casework and office tools.", "/login");

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "Your account doesn't hold a staff role that grants access to that page.",
  OAuthSignin: "We couldn't start the sign-in flow. Please try again.",
  OAuthCallback: "Sign-in didn't complete successfully. Please try again.",
  OAuthAccountNotLinked:
    "This account isn't linked correctly. Please contact an administrator.",
  AccessDenied: "Access was denied by the identity provider. Please try again.",
  Configuration: "Staff login is misconfigured. Please contact an administrator.",
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
  const requestedCallbackUrl = query.callbackUrl ?? "/dashboard";
  const callbackUrl = requestedCallbackUrl.startsWith("/") && !requestedCallbackUrl.startsWith("//") && !requestedCallbackUrl.includes("\\")
    ? requestedCallbackUrl
    : "/dashboard";
  const isContactFlow = callbackUrl === "/contacts" || callbackUrl.startsWith("/contacts?");

  if (session?.user?.providerUserId && session.user.identityProvider === "roblox" && !query.error) {
    redirect(callbackUrl);
  }

  const errorMessage = query.error
    ? ERROR_MESSAGES[query.error] ?? ERROR_MESSAGES.Default
    : null;

  const isSignedInButForbidden = Boolean(session?.user?.providerUserId) && (Boolean(query.error) || session?.user.identityProvider !== "roblox");

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
          <h1>{isContactFlow ? "Continue to Contact Us" : "Staff Sign In"}</h1>
          <p className="lede">
            {isContactFlow
              ? "Verify your Roblox account to open your private Contact Us mailbox. You will return to your message inbox automatically after verification."
              : "Authorized personnel only. Sign in with your Roblox account. Your current Roblox group roles determine which staff pages are available."}
          </p>

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
            {isSignedInButForbidden ? (
              <>
                <p>
                  Signed in as <strong>{session!.user.displayName}</strong> with {session!.user.identityProvider}. Sign out to switch to the configured sign-in provider.
                </p>
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
                  {isContactFlow ? "Verify with Roblox" : "Sign in with Roblox"}
                </button>
              </form> : <p className="message message-error" role="alert">Roblox sign-in is not configured yet. Add its client ID and rotated secret in Railway.</p>
            )}
          </div>

          <p className="note-inline" style={{ marginTop: 14 }}>
            Don&apos;t have staff access but think you should? Contact the District Attorney or Deputy District Attorney on our <Link href="/contacts">Contact Us page</Link>.
          </p>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}
