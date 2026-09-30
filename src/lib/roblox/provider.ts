import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers";

// Verify these endpoints/claims against Roblox's current OAuth 2.0 docs before going live.
export interface RobloxOAuthProfile {
  sub: string;
  name?: string;
  nickname?: string;
  preferred_username?: string;
  profile?: string;
  picture?: string;
  created_at?: number;
}

export default function RobloxProvider(
  config: OAuthUserConfig<RobloxOAuthProfile>
): OAuthConfig<RobloxOAuthProfile> {
  return {
    ...config,
    id: "roblox",
    name: "Roblox",
    type: "oidc",
    issuer: "https://apis.roblox.com/oauth/",
    wellKnown: "https://apis.roblox.com/oauth/.well-known/openid-configuration",
    authorization: { params: { scope: "openid profile" } },
    checks: ["pkce", "state", "nonce"],
    client: {
      id_token_signed_response_alg: "ES256",
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
