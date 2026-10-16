# ADR 0002: One identity: GitHub sign-in on the web, and Fridgie as the OAuth server for assistants

Date: 2026-10-16
Status: proposed

Research: [docs/research/4-agent-auth-stack-hosting.md](../research/4-agent-auth-stack-hosting.md), sections 1 and 5.

**This ADR covers two decisions,** how a remote agent client authenticates and how the owner signs in on the web. #4 allows that when the two share one identity, and they do.

## Context

Only the owner may reach the data: through the web app after signing in, and through an assistant they have authorised (#1). Single user for now, but every row is scoped to a user, so household sharing is an addition later rather than a migration.

Claude's connector client imposes these requirements (research, section 1):

- **OAuth 2.x authorization code with PKCE.**
- **Discovery through a `401`**, then protected resource metadata (RFC 9728), then authorization server metadata (RFC 8414).
- **Client registration** by a Client ID Metadata Document (CIMD), by Dynamic Client Registration (DCR), or by a client ID the user pre-registers and types in.
- **The redirect** is `https://claude.ai/api/mcp/auth_callback`.
- **Refresh tokens** are rotated, and an invalid one returns `invalid_grant`.
- **Response time:** each OAuth endpoint answers within 10 seconds.

Machine-to-machine `client_credentials` is not supported. Static request headers are a beta for organisations. On a personal plan, OAuth is the way to keep the server private.

The free plan of the host (ADR 0004) allows 10 ms of CPU per request, so the sign-in path should not hash passwords on the Worker.

## Decision

**One identity: the owner's GitHub account, mapped to one Fridgie user.**

- **The `users` table.** It has an internal `id`, a UUID that is the only user key any other table references, and `github_id`, which is GitHub's numeric user ID, unique and never the login name, because a login can be renamed.
- **Who may sign in.** Only GitHub accounts whose numeric ID is listed in the Worker variable `ALLOWED_GITHUB_IDS` can sign in. That is the owner alone for now. Any other account gets a "not invited" page, and no `users` row is created for it.

**Web sign-in.**

1. "Sign in with GitHub" sends the owner to GitHub's OAuth App authorize URL with **no scopes requested**.
2. On callback the Worker exchanges the code with the client secret, reads the numeric ID from `GET https://api.github.com/user`, then discards the GitHub token.
3. It finds or creates the `users` row.
4. It sets a Fridgie session cookie: random, `HttpOnly`, `Secure`, `SameSite=Lax`, stored server-side with an expiry.

The GitHub token is never kept. Fridgie does not act on GitHub.

**Agent authentication.** The Fridgie Worker is the **OAuth 2.1 authorization server and the protected resource** for `/mcp`, using `@cloudflare/workers-oauth-provider` (ADR 0003).

1. **Authorize.** Its `/authorize` handler parses the client's request. If there is no web session, it runs the same GitHub sign-in as above and comes back. It then shows a **consent page** naming the client and the redirect URI's host (for Claude, `claude.ai`). On approval it calls `completeAuthorization` with `userId` set to the internal `users.id`, and with `props: { userId }`.
2. **Resolve.** Every `/mcp` request carries a bearer token that the provider validates. The handler reads `userId` from the token's props and passes it into the service layer, exactly as the web routes pass the session's `userId`.

### (a) How an agent's credential resolves to the same user as the web sign-in

Both paths end at the same `users.id`.

- **Web:** the session cookie maps to `users.id`.
- **Agent:** an access token maps to a grant. The grant's `userId` and its encrypted props both hold `users.id`, and the grant can be created only by a person who has just completed the web sign-in on the consent page.

There is no separate agent account and no second credential store. Every query in the service layer filters on that `users.id`.

### (b) How the owner revokes an agent's access

- **Primary: in Fridgie.** The web app has a **Connected assistants** page that lists the owner's grants (`listUserGrants(userId)`: client name, created date, scopes). Each row has a **Disconnect** button that calls `revokeGrant(grantId, userId)`. That deletes the grant with its access and refresh tokens. The assistant's next call gets `401`, its refresh gets `invalid_grant`, and it must go through consent again.
- **In the assistant.** Removing the connector in Claude (Customize > Connectors > Remove) stops Claude using it. It does **not** delete Fridgie's grant, so the Fridgie page is the authoritative revoke.
- **Everything at once.** Removing an ID from `ALLOWED_GITHUB_IDS` blocks new sign-ins and consents for that account. The owner pairs it with Disconnect on every grant.

### (c) What the server must implement for Claude's flow

The engineer builds and tests each of these. The library provides most of them, and the ones it does not are marked.

1. **The `401` challenge.** `/mcp` without a valid token answers **`401`** with `WWW-Authenticate: Bearer resource_metadata="https://<host>/.well-known/oauth-protected-resource"`, optionally with `scope="mcp:read mcp:write"`. Never a `200` and never a redirect. *(Wiring is Fridgie's.)*
2. **Protected resource metadata.** `/.well-known/oauth-protected-resource` (and `/.well-known/oauth-protected-resource/mcp`) returns `resource` exactly equal to `https://<host>/mcp`, and `authorization_servers` with Fridgie's issuer **first** and only.
3. **Authorization server metadata.** `/.well-known/oauth-authorization-server` (RFC 8414) advertises:
   - the `authorization_endpoint`, `token_endpoint` and `registration_endpoint`;
   - `code_challenge_methods_supported: ["S256"]`;
   - `scopes_supported` including `mcp:read`, `mcp:write` and `offline_access`;
   - `token_endpoint_auth_methods_supported` including `"none"`;
   - `client_id_metadata_document_supported: true`.
4. **Client registration, both ways.** **DCR** at `registration_endpoint` (RFC 7591, a JSON body). **CIMD** enabled with `clientIdMetadataDocumentEnabled: true`, plus the `global_fetch_strictly_public` compatibility flag. Claude then uses its published identity and creates no registrations. DCR stays on as the fallback, and because Gemini's custom apps expect it.
5. **PKCE.** S256 is required on every authorization request, and a token request whose verifier does not match is refused. Use library ≥ 1.2. The 0.0.x versions had a PKCE bypass, CVE-2025-4144.
6. **Redirect URIs.** Accept exactly the redirect URIs a client registered or declared. For Claude that means `https://claude.ai/api/mcp/auth_callback`, and for Claude Code a loopback (`http://localhost` or `http://127.0.0.1`) on any port. The consent page shows the redirect host. *(The consent page is Fridgie's.)*
7. **Token endpoint.** It accepts `application/x-www-form-urlencoded`. **Refresh tokens rotate**, and an invalid or revoked refresh token returns `invalid_grant`. Access tokens last 1 hour, and refresh tokens 30 days, renewed on rotation.
8. **Audience.** Each token is bound to the resource `https://<host>/mcp`, and `/mcp` rejects a token minted for anything else.
9. **Scopes.** `mcp:read` for read-only tools and `mcp:write` for tools that change data. A call without the needed scope gets `403` with `insufficient_scope`. *(Fridgie's check.)*
10. **Speed and reachability.** Every OAuth endpoint answers in well under 10 seconds. Nothing in front of the Worker (no WAF rule, no Cloudflare Access) blocks `160.79.104.0/21`.

**Tests the engineer adds** cover the `401` shape, both metadata documents, DCR, a full authorization-code-plus-PKCE round trip, refresh rotation, `invalid_grant` after revoke, and a non-allow-listed GitHub ID being refused.

## Consequences

- **One login.** The owner signs in once with GitHub, and the same sign-in appears inside Claude's connect flow. Fridgie stores no passwords and hashes nothing on the Worker.
- **Accounts and secrets.** It needs one free **GitHub OAuth App**, plus three Worker secrets (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `COOKIE_SECRET`) and one variable (`ALLOWED_GITHUB_IDS`). ADR 0004 `## Owner steps` lists them. The Worker fetches two GitHub hosts at sign-in (`github.com`, `api.github.com`). Those are new outbound hosts, approved through this ADR under #3 O2.
- **Household sharing later** is an addition. It means more IDs on the allow-list, or an invitation table, plus a `households` table that items move under. User IDs stay where they are. Someone without a GitHub account needs a second sign-in method, such as passkeys, linked to the same `users.id`. That is also an addition.
- **Fridgie depends on GitHub's availability.** A GitHub outage blocks new sign-ins and new assistant consents. Existing sessions and existing assistant tokens keep working, because tokens are Fridgie's own.
- **Fridgie owns the security surface:** the consent page, the session cookie, and the allow-list. A bug there is a breach. The tests above are the guard.

## Alternatives rejected

- **Passkeys only.** A single user who loses a phone holding a non-synced passkey is locked out, and there is no reset. A recovery path would have to be built before launch.
- **Email magic links.** They add an email-sending vendor, an API secret and a new outbound host, for no gain over GitHub, which the owner already has.
- **Supabase Auth as the OAuth server.** It is tied to Supabase hosting, whose free projects pause after 7 days of low activity (ADR 0004).
- **Using GitHub itself as the authorization server for Claude.** GitHub OAuth Apps offer no DCR or CIMD, and GitHub tokens are not audience-bound to Fridgie. Every assistant would need a hand-registered client, and revoking would mean visiting GitHub.
- **Static API key in a request header.** On Claude this is a beta for organisation Owners only, and the docs say not to use it to identify a person.
- **Cloudflare Access in front of the app.** It would block Anthropic's unauthenticated discovery requests, so the connect flow fails.
