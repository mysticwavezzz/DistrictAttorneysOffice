import { describe, expect, it } from "vitest";
import RobloxProvider from "./provider";

describe("Roblox OAuth provider", () => {
  it("uses Roblox OIDC metadata and its ES256 ID-token signing algorithm", () => {
    const provider = RobloxProvider({ clientId: "client-id", clientSecret: "client-secret" });

    expect(provider.type).toBe("oidc");
    expect(provider.issuer).toBe("https://apis.roblox.com/oauth/");
    expect(provider.wellKnown).toBe("https://apis.roblox.com/oauth/.well-known/openid-configuration");
    expect(provider.client?.id_token_signed_response_alg).toBe("ES256");
    expect(provider.client?.token_endpoint_auth_method).toBe("client_secret_post");
    expect(provider.checks).toEqual(["pkce", "state", "nonce"]);
    expect(provider.authorization?.params?.scope).toBe("openid profile");
  });
});
