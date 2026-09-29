import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn, signOut } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "Your Discord account doesn't hold a staff role that grants access to that page.",
  OAuthSignin: "We couldn't start the Discord sign-in flow. Please try again.",
  OAuthCallback: "Discord sign-in didn't complete successfully. Please try again.",
  OAuthAccountNotLinked:
    "This Discord account isn't linked correctly. Please contact an administrator.",
  AccessDenied: "Access was denied by Discord. Please try again.",
  Configuration: "Staff login is misconfigured. Please contact an administrator.",
  Default: "Something went wrong signing in. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const query = await searchParams;
  const session = await auth();
  const callbackUrl = query.callbackUrl ?? "/dashboard";

  if (session?.user?.discordUserId && !query.error) {
    redirect(callbackUrl);
  }

  const errorMessage = query.error
    ? ERROR_MESSAGES[query.error] ?? ERROR_MESSAGES.Default
    : null;

  const isSignedInButForbidden = Boolean(session?.user?.discordUserId) && Boolean(query.error);

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
          <div className="sbox">
            <h3>Notice</h3>
            <div className="notice">
              {siteConfig.county} is a Roblox roleplay community. Staff access is granted
              through the {siteConfig.county} Discord server and is not affiliated with any
              real government, county, or agency.
            </div>
          </div>
        </aside>

        <main className="paper" id="main">
          <p className="eyebrow">{siteConfig.county}</p>
          <h1>Staff Sign In</h1>
          <p className="lede">
            Authorized personnel only. Sign in with the Discord account linked to your Law
            Enforcement, Government, or District Attorney&apos;s Office role. Your server roles
            are checked automatically — no separate staff account is needed.
          </p>

          {errorMessage && (
            <p className="message message-error" role="alert">
              {errorMessage}
            </p>
          )}

          <div className="formbox" style={{ maxWidth: 420 }}>
            {isSignedInButForbidden ? (
              <>
                <p>
                  Signed in as <strong>{session!.user.displayName}</strong>. Sign out to try a
                  different Discord account.
                </p>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/login" });
                  }}
                >
                  <button type="submit" className="govbtn">
                    Sign Out
                  </button>
                </form>
              </>
            ) : (
              <form
                action={async () => {
                  "use server";
                  await signIn("discord", { redirectTo: callbackUrl });
                }}
              >
                <button type="submit" className="govbtn-discord">
                  Sign in with Discord
                </button>
              </form>
            )}
          </div>

          <p className="note-inline" style={{ marginTop: 14 }}>
            Don&apos;t have staff access but think you should? Contact the District Attorney or Deputy District Attorney on our <Link href="/contacts">Discord Contacts page</Link>.
            in-game.
          </p>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}
