import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn, signOut } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { env } from "@/lib/env";
import { getSiteConfiguration } from "@/lib/site-settings";

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
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const query = await searchParams;
  const session = await auth();
  const defaultProvider = env.ROBLOX_CLIENT_ID && env.ROBLOX_CLIENT_SECRET ? "roblox" : "discord";
  const configuredProvider = await getSiteConfiguration<"discord" | "roblox">("authProvider", defaultProvider);
  const providerReady = configuredProvider === "roblox"
    ? Boolean(env.ROBLOX_CLIENT_ID && env.ROBLOX_CLIENT_SECRET)
    : Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID);
  const callbackUrl = query.callbackUrl ?? "/dashboard";

  if (session?.user?.providerUserId && session.user.identityProvider === configuredProvider && !query.error) {
    redirect(callbackUrl);
  }

  const errorMessage = query.error
    ? ERROR_MESSAGES[query.error] ?? ERROR_MESSAGES.Default
    : null;

  const isSignedInButForbidden = Boolean(session?.user?.providerUserId) && (Boolean(query.error) || session?.user.identityProvider !== configuredProvider);

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
          <h1>Staff Sign In</h1>
          <p className="lede">
            Authorized personnel only. Sign in with your {configuredProvider === "roblox" ? "Roblox account" : "Discord account"}. Your current group roles determine which staff pages are available.
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
                  Signed in as <strong>{session!.user.displayName}</strong> with {session!.user.identityProvider}. Sign out to switch to the configured sign-in provider.
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
              providerReady ? <form
                action={async () => {
                  "use server";
                  await signIn(configuredProvider, { redirectTo: callbackUrl });
                }}
              >
                <button type="submit" className={configuredProvider === "discord" ? "govbtn-discord" : "govbtn"}>
                  Sign in with {configuredProvider === "roblox" ? "Roblox" : "Discord"}
                </button>
              </form> : <p className="message message-error" role="alert">{configuredProvider === "roblox" ? "Roblox sign-in is not configured yet. Add its client ID and rotated secret in Railway." : "Discord sign-in is not configured."}</p>
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
