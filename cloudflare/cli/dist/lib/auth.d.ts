/**
 * Cloudflare authentication helpers.
 *
 * Supports two modes:
 *  1. OAuth PKCE flow (opens browser, catches callback on localhost)
 *  2. API Token (user pastes a token they created in the dashboard)
 *
 * For OAuth, you need to register a Cloudflare OAuth application:
 *   https://developers.cloudflare.com/cloudflare-one/identity/idp-integration/
 * Then set CF_CLIENT_ID env var or pass it to loginWithOAuth().
 */
/**
 * Cloudflare's publicly registered OAuth client for the Wrangler CLI.
 * This is the same client_id used by `wrangler login` — open source, MIT licensed.
 * The redirect URI must be http://localhost:8976/oauth/callback to match.
 */
export declare const CF_DEFAULT_CLIENT_ID = "54d11594-84e4-41aa-b438-e81b8fa78ee7";
export declare function generateCodeVerifier(): string;
export declare function generateCodeChallenge(verifier: string): Promise<string>;
export declare function generateState(): string;
export interface OAuthTokens {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
}
export declare function startOAuthFlow(clientId?: string): Promise<OAuthTokens>;
export declare function refreshAccessToken(clientId: string, refreshToken: string): Promise<OAuthTokens>;
export declare function revokeToken(clientId: string, token: string): Promise<void>;
export declare function buildOAuthUrl(clientId?: string): {
    url: string;
    state: string;
    verifier: string;
};
//# sourceMappingURL=auth.d.ts.map