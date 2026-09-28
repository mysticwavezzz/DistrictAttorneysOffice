import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers";

/**
 * Raw claims returned by Roblox's OIDC userinfo endpoint for the
 * `openid profile` scope. See Roblox's OAuth 2.0 developer docs
 * (creator.roblox.com/docs -> OAuth 2.0) for the authoritative field list;
 * verify these endpoint URLs and claim names against that doc before
 * going live, since this was written without live network access to
 * Roblox's docs in this environment.
 */
export interface RobloxOAuthProfile {
  sub: string;
  name?: string;
  nickname?: string;
  preferred_username?: string;
  profile?: string;
  picture?: string;
  created_at?: number;
}

/**
 * Custom Auth.js OAuth2/OIDC provider for Roblox. We only request
 * `openid profile` — just enough to identify the signed-in Roblox account
 * (via the `sub` claim). Group membership and roles are looked up
 * separately through Roblox's public Groups API (see `groups.ts`), which
 * avoids depending on any group-specific OAuth scope Roblox may or may not
 * grant to this app.
 */
export default function RobloxProvider(
  config: OAuthUserConfig<RobloxOAuthProfile>
): OAuthConfig<RobloxOAuthProfile> {
  return {
    // Spread first so the fixed fields below always win — both at
    // runtime and for type inference (a `checks` override coming from
    // `config` after these fields could otherwise widen the literal
    // union type this provider needs).
    ...config,
    id: "roblox",
    name: "Roblox",
    type: "oauth",
    authorization: {
      url: "https://apis.roblox.com/oauth/v1/authorize",
      params: { scope: "openid profile" },
    },
    token: "https://apis.roblox.com/oauth/v1/token",
    userinfo: "https://apis.roblox.com/oauth/v1/userinfo",
    checks: ["pkce", "state"],
    client: {
      token_endpoint_auth_method: "client_secret_post",
    },
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.preferred_username ?? profile.nickname ?? profile.name ?? profile.sub,
        email: null,
        image: profile.picture ?? null,
      };
    },
    style: { bg: "#000000", text: "#ffffff" },
  };
}
