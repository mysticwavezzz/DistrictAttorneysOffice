import Link from "next/link";
import { redirect } from "next/navigation";
import { Source_Sans_3 } from "next/font/google";
import { auth, signIn, signOut } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import "./login-theme.css";

const loginFont = Source_Sans_3({
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  style: ["normal", "italic"],
  variable: "--font-login-sans",
  display: "swap",
});

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "Your Roblox account doesn't hold a staff role that grants access to that page.",
  OAuthSignin: "We couldn't start the Roblox sign-in flow. Please try again.",
  OAuthCallback: "Roblox sign-in didn't complete successfully. Please try again.",
  OAuthAccountNotLinked:
    "This Roblox account isn't linked correctly. Please contact an administrator.",
  AccessDenied: "Access was denied by Roblox. Please try again.",
  Configuration: "Staff login is misconfigured. Please contact an administrator.",
  Default: "Something went wrong signing in. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string; error?: string };
}) {
  const session = await auth();
  const callbackUrl = searchParams.callbackUrl ?? "/dashboard";

  // avoid redirect loop: don't bounce back to callbackUrl if that's exactly what got them sent here
  if (session?.user?.robloxUserId && !searchParams.error) {
    redirect(callbackUrl);
  }

  const errorMessage = searchParams.error
    ? ERROR_MESSAGES[searchParams.error] ?? ERROR_MESSAGES.Default
    : null;

  const isSignedInButForbidden = Boolean(session?.user?.robloxUserId) && Boolean(searchParams.error);

  return (
    <div className={`login-scope login-shell ${loginFont.variable}`} style={{ fontFamily: "var(--font-login-sans), Arial, sans-serif" }}>
      <div className="login-window">
        <div className="login-header">
          <div className="login-bluemain">
            <div className="login-pat" aria-hidden="true" />
            <div>
              <div className="login-t1">{siteConfig.county.toUpperCase()}</div>
              <div className="login-t2">STAFF PORTAL</div>
            </div>
          </div>
          <div className="login-band" />
          <div className="login-ribbon">
            <span className="login-tab login-active">SIGN IN</span>
            <Link href="/" className="login-tab login-right">
              PUBLIC SITE
            </Link>
          </div>
        </div>

        <div className="login-page">
          <p className="login-ptitle">{siteConfig.name}</p>

          {errorMessage && (
            <p className="login-err" role="alert">
              {errorMessage}
            </p>
          )}

          <p className="login-body">
            Authorized personnel only. Sign in with the Roblox account linked to your Law
            Enforcement, Government, or District Attorney&apos;s Office role. Your group roles
            are checked automatically — no separate staff account is needed.
          </p>

          <hr className="login-rule" />

          {isSignedInButForbidden ? (
            <>
              <p className="login-body">
                Signed in as <strong>{session!.user.displayName}</strong>. Sign out to try a
                different Roblox account.
              </p>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <div className="login-btnrow">
                  <button type="submit" className="login-btn login-wide">
                    Sign Out
                  </button>
                </div>
              </form>
            </>
          ) : (
            <form
              action={async () => {
                "use server";
                await signIn("roblox", { redirectTo: callbackUrl });
              }}
            >
              <div className="login-btnrow">
                <button type="submit" className="login-btn login-maroon login-wide">
                  Sign in with Roblox
                </button>
              </div>
            </form>
          )}

          <p className="login-note">
            Don&apos;t have staff access but think you should? Contact office leadership
            in-game.
          </p>
        </div>
      </div>
    </div>
  );
}
