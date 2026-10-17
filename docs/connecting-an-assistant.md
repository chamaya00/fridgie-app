# Connecting an assistant to Fridgie

Fridgie is one service with two clients: the web app you sign in to, and any AI assistant you allow to act for you. This page covers the second one. It is written for someone who wants to connect Claude, or any other assistant that speaks the protocol below.

The decisions behind it: [ADR 0001](decisions/0001-agent-protocol-mcp.md) (protocol), [ADR 0002](decisions/0002-identity-github-sign-in-and-oauth-for-agents.md) (sign-in and authorization), [ADR 0004](decisions/0004-hosting-cloudflare-workers-free.md) (hosting and the owner's steps) and [ADR 0005](decisions/0005-item-entry-methods.md) (entry through the assistant). The tools are specified in the [design spec, section 10](design/6-inventory-and-tools.md#10-the-assistants-tools).

## What the assistant connects to

| | |
| - | - |
| **Server URL** | `https://<your Fridgie host>/mcp`. Deployed on Workers Free, that is `https://fridgie.<subdomain>.workers.dev/mcp`. The **Connected assistants** page in Fridgie shows the exact URL. |
| **Protocol** | The [Model Context Protocol](https://modelcontextprotocol.io) (MCP). Fridgie answers the 2025-era `initialize` handshake, protocol versions `2025-06-18` and `2025-11-25`, and the 2026-07-28 revision as well. |
| **Transport** | Streamable HTTP, stateless. There is no MCP session to keep, and every request stands alone. Legacy HTTP+SSE is not served. |
| **What it offers** | Tools only: no resources, prompts, sampling or subscriptions. |

## How the assistant is authorized

Fridgie is its own OAuth 2.1 authorization server. You sign in with the same GitHub account you use on the web, and only accounts on Fridgie's allow-list get in.

**Endpoints.** All are on the same host:

| What | Where |
| - | - |
| Protected resource metadata (RFC 9728) | `/.well-known/oauth-protected-resource` (also `/.well-known/oauth-protected-resource/mcp`) |
| Authorization server metadata (RFC 8414) | `/.well-known/oauth-authorization-server` |
| Authorization endpoint | `/authorize` |
| Token endpoint (and revocation) | `/token` |
| Dynamic client registration (RFC 7591) | `/register` |

**The flow, step by step:**

1. The assistant calls `/mcp` with no token. Fridgie answers **`401`** with `WWW-Authenticate: Bearer resource_metadata="https://<host>/.well-known/oauth-protected-resource", scope="mcp:read mcp:write"`.
2. The assistant reads the protected resource metadata. `resource` is `https://<host>/mcp`, and the one authorization server is Fridgie itself.
3. The assistant reads the authorization server metadata. It advertises:
   - PKCE with `S256` only;
   - the scopes `mcp:read`, `mcp:write` and `offline_access`;
   - token endpoint auth method `none`, for public clients;
   - `client_id_metadata_document_supported: true`.
4. **The assistant registers itself, in one of two ways.** It can use a Client ID Metadata Document (Claude's "published identity"), or Dynamic Client Registration at `/register`. Either way, its exact redirect URI is recorded, and no other redirect URI is accepted for it.
5. **Your browser opens `/authorize`.** If you're not signed in to Fridgie, you sign in with GitHub first and come back to the same request.
6. **You see Consent.** It shows:
   - the assistant's name, which the assistant chose itself, so don't trust it alone;
   - the host it will send you back to, in a grey monospace chip, which is the part an impostor cannot fake;
   - what it will be able to do;
   - who you are signed in as.

   **Allow** sends you back with a code. **Deny** sends you back with `error=access_denied`.
7. **The assistant exchanges the code at `/token`** (`application/x-www-form-urlencoded`) with its PKCE verifier. A wrong verifier is refused. Tokens are bound to `https://<host>/mcp` and are no good anywhere else:
   - Access tokens last 1 hour.
   - Refresh tokens last 30 days, renewed on each use, and rotate every time they are used.
   - A revoked or reused refresh token gets `invalid_grant`.

**Scopes.**
- `mcp:read` lets the assistant use the three read tools.
- `mcp:write` lets it use the seven tools that change things.
- A call without the scope it needs gets `403` with `error="insufficient_scope"`, and nothing is written.

**Taking access away.** Fridgie's **Connected assistants** page (the top bar's "Assistants" link) lists every assistant you've allowed. **Disconnect** revokes it at once: its next call gets `401`, and its refresh gets `invalid_grant`. Removing Fridgie inside the assistant does **not** do this. The Fridgie page is the one that does.

## The ten tools

The names, inputs and descriptions are the [design spec's](design/6-inventory-and-tools.md#the-tool-table), word for word.

| Tool | What it's for | Scope |
| - | - | - |
| `list_inventory` | Everything in the fridge and pantry, with each item's quantity and state | `mcp:read` |
| `list_low_and_out` | What's low or out, and why, with the same summary sentence as the web page | `mcp:read` |
| `find_items` | Look up several items by name in one call, before recording purchases | `mcp:read` |
| `add_item` | Add an item Fridgie doesn't track yet, optionally recording it as bought | `mcp:write` |
| `record_purchases` | Record one or more purchases of existing items, such as every line of a receipt | `mcp:write` |
| `record_use` | Record that some of an item was used, or thrown away | `mcp:write` |
| `mark_out` | Record that an item is all gone ("I used the last of the milk") | `mcp:write` |
| `set_quantity` | Set the count after you've counted | `mcp:write` |
| `update_item` | Rename, move, change the unit, or set the low warning level | `mcp:write` |
| `remove_item` | Stop tracking an item. Its history stays | `mcp:write` |

Every tool declares `readOnlyHint` and `destructiveHint`. Only `remove_item` is destructive, so assistants confirm it with you first. Every write takes a `client_ref`, so a retried call never records twice.

## Which assistants can change things, not just read

Whether an assistant can make changes depends on the assistant and your plan with it, not on Fridgie (ADR 0001, Consequences). This is what the research found in October 2026 ([research #4, sections 1 and 2](research/4-agent-auth-stack-hosting.md#1-the-claude-ios-app-criterion-1)). Plans change, so check the vendor's current page.

| Assistant | Can it connect? | Can it make changes? |
| - | - | - |
| **Claude** (web, desktop, iOS, Android) | Yes, as a custom connector, on Free, Pro, Max, Team and Enterprise. Free allows exactly one custom connector. | Yes, on every plan that can add the connector. |
| **ChatGPT** | Yes, in developer mode on the web. | Only on **Business, Enterprise and Edu**. Pro gets read and fetch only. Plus is not mentioned on OpenAI's current page. On a plan without writes, "I used the last of the milk" will not work, whatever Fridgie does. |
| **Gemini app** | Narrowly: "custom apps", connected in the web app, for US personal accounts. A newer help page ties them to Gemini Spark, which needs Google AI Pro or Ultra. | Where custom apps are available, as far as the research found. Unconfirmed. |
| **Mistral Le Chat** | Yes, under Connectors, Custom MCP Connector. It discovers OAuth and registers itself. | Yes, as far as the research found. One third-party post says a paid plan is needed. |
| **Microsoft Copilot** (consumer) | Not found. Only Copilot Studio, with a work account, connects custom MCP servers. | n/a |

Any other assistant that speaks MCP over Streamable HTTP, with OAuth 2.1, PKCE, and either DCR or Client ID Metadata Documents, should connect with the URL above.

## Adding Fridgie to Claude

This is ADR 0004's owner step 9, done once Fridgie is deployed.

1. On claude.ai, in a browser on your phone or a computer, go to **Customize > Connectors > Add custom connector**. Adding connectors in the mobile app is in beta, so the web is the reliable path.
2. **URL:** `https://fridgie.<subdomain>.workers.dev/mcp`. Copy it from Fridgie's Connected assistants page if you're unsure.
3. **Authentication:** **Sign in now**.
4. **OAuth client:** **Use Claude's published identity**. If that fails, use **Register automatically**.
5. Claude opens Fridgie. Sign in with GitHub if you're asked, check that the chip says `claude.ai`, and press **Allow**.
6. The connector appears in the Claude iOS app the next time you open it. Try "what's running low?", or "I used the last of the milk" and then reload Fridgie in the browser: milk shows as **Out**.

Fridgie's Connected assistants page now lists Claude, with "Returns to claude.ai" and the date.

## Adding a receipt through the assistant

ADR 0005 makes the assistant the way to enter a receipt.

1. **Attach a photo of the receipt in the Claude app** and say something like "record this receipt in Fridgie".
   - **This is ADR 0005's unverified assumption.** The research could not confirm that the Claude iOS app lets you take a photo with the camera. Its help article lists image formats but doesn't mention the camera.
   - If the camera isn't offered, take the photo with the Camera app first, then pick it from Photos in Claude.
2. Claude reads the lines and calls `find_items` once, with every item name it found.
3. It calls `record_purchases` once, with a line per item and the receipt's own date, and records the price paid on each line.
   - A price without a currency is in US dollars.
   - A date with no time counts as noon UTC that day.
4. **Lines it can't match are not recorded.** They come back as `no_match`, with any close matches, for example "I couldn't match 'GV HNY CRSP 12OZ'".
   - Claude should ask you about each one.
   - It then adds them with `add_item`, or records them against the item you name.
5. Sending the same receipt twice records nothing the second time. Each line keeps the key it was first recorded under, so a retry comes back `already_recorded`.
