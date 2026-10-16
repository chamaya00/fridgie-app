# Research #4: agent protocol, authentication, stack, and $0 hosting

Issue: #4 (parent #1). All sources checked **2026-10-16**.

## The decision

Which open protocol an assistant uses to reach Fridgie, how that assistant and the owner's phone browser both authenticate as the same user, what Fridgie is built with (and the exact commands CI runs), and which free tier hosts it for $0.

**Recommendation in one line:** an MCP server over Streamable HTTP and a web app, served by **one TypeScript Worker on Cloudflare's free plan** with D1 (SQLite) as the one data store. The Worker is its own OAuth 2.1 authorization server for assistants, and the owner signs in with GitHub on both paths. The records are ADRs [0001](../decisions/0001-agent-protocol-mcp.md) (protocol), [0002](../decisions/0002-identity-github-sign-in-and-oauth-for-agents.md) (agent auth and web sign-in, one identity), [0003](../decisions/0003-stack-typescript-on-workers.md) (stack and `## Gate commands`), and [0004](../decisions/0004-hosting-cloudflare-workers-free.md) (hosting and `## Owner steps`).

## How to read the evidence marks

This run could open Anthropic's documentation directly. Its network policy refused connections to `developers.openai.com`, `help.openai.com`, `support.google.com`, `developers.cloudflare.com`, `vercel.com`, `supabase.com` and `modelcontextprotocol.io` (proxy answered `403` to `CONNECT`). For those hosts the claim rests on the search engine's quoted excerpt of the primary page, not on a reading of the whole page. The mark says which:

- **[read]**: verified by opening the primary page in this run. The line can be quoted.
- **[excerpt]**: verified from a search result's quoted excerpt of the primary page linked. The page itself was not opened. A reviewer opening the link should find the quoted words there. If they are not there, the claim falls.
- **[inference]**: reasoned from verified material. What it was reasoned from is named.
- **[assumption]**: neither verified nor inferred, and something rests on it. Named so it can be checked.

## What the issue fixed, and what it guessed

- **Constraints (checked, they hold):** one service and one data store for both clients (#1). The protocol must be an open standard no assistant vendor owns (#1). $0, free tiers only (#3 O3). No agent may write under `.github/workflows/`, so a deploy that needs a workflow file is a person's step (the `house-rules` skill and `CLAUDE.md`). Data scoped per user (#1).
- **Guesses:** the issue names "agent protocol", "auth" and "hosting" as separate choices. In practice the Claude client's OAuth requirements decide most of the auth design, and the auth library decides the host. The four records below are coupled, and each ADR says which others it leans on. The issue also presumes that the Claude iOS app is where a connector gets *added*. It is not the primary path (see criterion 1).

---

## 1. The Claude iOS app (criterion 1)

| Question | Answer | Mark and source |
| - | - | - |
| Protocol | The **Model Context Protocol (MCP)**. A custom connector is "a remote MCP server" added by URL. | [read] [Add a connector that isn't in the directory](https://claude.com/docs/connectors/custom/remote-mcp) |
| Transport | **Streamable HTTP**: "Use Streamable HTTP, which the MCP specification defines for remote servers. Claude also supports the legacy HTTP+SSE transport, which is being deprecated." A URL ending `/sse` selects SSE. | [read] [Build an MCP server for Claude](https://claude.com/docs/connectors/building/index.md), [Add a connector…](https://claude.com/docs/connectors/custom/remote-mcp) |
| MCP spec versions for auth | "Claude follows the 2025-03-26, 2025-06-18, and 2025-11-25 authorization specifications." The 2026-07-28 revision is **not** named. | [read] [Build an MCP server for Claude](https://claude.com/docs/connectors/building/index.md) |
| Does iOS use the same client? | Yes. "Claude connects to your server from claude.ai, Claude Desktop, Claude mobile, Cowork, and Claude Code, and the same connector infrastructure backs all of them." The auth requirements "apply to all of them". | [read] [Build an MCP server](https://claude.com/docs/connectors/building/index.md), [Authentication for connectors](https://claude.com/docs/connectors/building/authentication.md) |
| Where a connector is **added** | Customize > Connectors > Add custom connector. "Installing connectors on mobile is currently in beta—Claude Desktop and web remain the primary path for custom connectors." Once added, a connector "will be available to use the next time you log in to your account on Claude for iOS or Android." | [read] [Pre-built web connectors](https://support.claude.com/en/articles/11176164-pre-built-web-connectors-using-remote-mcp) |
| Tiers that can add one | **Free, Pro, Max, Team, Enterprise.** "Free users are limited to one custom connector." On Team and Enterprise an Owner adds it for the organisation, and members connect with their own account. | [read] [Get started with custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp), [Add a connector…](https://claude.com/docs/connectors/custom/remote-mcp) |
| Network | Requests come from Anthropic's cloud, from `160.79.104.0/21`, not from the phone. The server and its authorization server must be reachable on the public internet. | [read] [Authentication for connectors](https://claude.com/docs/connectors/building/authentication.md) |
| Limits | Tool result up to about 150,000 characters. 240 seconds per tool call. | [read] [Build an MCP server](https://claude.com/docs/connectors/building/index.md) |

**The authorization flow the app runs against the server.** [read] Everything in this list comes from [Authentication for connectors](https://claude.com/docs/connectors/building/authentication.md) unless marked otherwise.

1. Claude calls the MCP URL without a token. The server **must answer `401`** with `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"`. Claude ignores `WWW-Authenticate` on a `200`. Without the pointer it probes `/.well-known/oauth-protected-resource/<mcp-path>` and then `/.well-known/oauth-protected-resource`.
2. Claude reads the protected resource metadata ([RFC 9728](https://www.rfc-editor.org/rfc/rfc9728)). `resource` must equal the URL the user typed, path included. Claude uses only the **first** `authorization_servers` entry.
3. Claude reads the authorization server metadata ([RFC 8414](https://www.rfc-editor.org/rfc/rfc8414) or OpenID Connect Discovery).
4. **Client registration. Dynamic client registration is not required, and neither is a pre-registered client. Any one of three works.** The connector dialog offers them as ([Add a connector…](https://claude.com/docs/connectors/custom/remote-mcp)):
   - "**Use Claude's published identity** (Recommended)": a **Client ID Metadata Document** (CIMD) that Anthropic hosts. Claude picks it only when the server metadata advertises both `"client_id_metadata_document_supported": true` and `"none"` in `token_endpoint_auth_methods_supported`. Otherwise it falls back to DCR.
   - "**Register automatically**": Dynamic Client Registration ([RFC 7591](https://www.rfc-editor.org/rfc/rfc7591)) at the server's `registration_endpoint`, sent as JSON.
   - "**Use your own OAuth client**": a **pre-registered** client ID the user types in, with an optional secret ("Leave the secret blank unless your authorization server requires one").
   - Two more types (Anthropic-held credentials, credentials entered at connection time) need an email to Anthropic and are for directory listings. They are irrelevant here.
5. Authorization code request with **PKCE `S256`** on every request. The server should advertise `code_challenge_methods_supported: ["S256"]`. Scopes come from the `401`'s `scope` parameter, or else from `scopes_supported`. Claude appends `offline_access` when the server lists it, so that it gets a refresh token.
6. Redirect to **`https://claude.ai/api/mcp/auth_callback`** for every hosted surface, iOS included. Claude Code uses a loopback redirect on any port.
7. Token exchange as `application/x-www-form-urlencoded`. Discovery, registration and token endpoints get **10 seconds** to answer, and refresh gets 30.
8. Refresh happens on a `401` and up to five minutes before expiry. An invalid refresh token must return `invalid_grant`. Public clients (DCR and CIMD both register Claude as one) must get **rotated** refresh tokens.
9. A `client_credentials` grant with no user in the loop is not supported. Static request headers are a beta for "a limited set of organizations", and are set by an organisation Owner. **[inference]** On a personal Pro or Max plan, OAuth is therefore the only practical way to keep the server private.

The tool annotations `readOnlyHint` and `destructiveHint` are required on every tool ([read] [Model Context Protocol (MCP)](https://claude.com/docs/connectors/building/mcp.md)). That matters for the designer in #6.

**Not confirmed:** whether the Claude client speaks the MCP **2026-07-28** revision. Its docs name only the 2025 authorization specs. **[inference]** A server has to answer the 2025-era `initialize` handshake to be safe. The official TypeScript SDK v2 does that by default (see section 4).

## 2. Other assistants (criterion 2)

| Assistant | Can it connect to a remote MCP server today? | Surface and tier | Mark and source |
| - | - | - | - |
| **ChatGPT** | **Yes, with a tier caveat that matters to Fridgie.** Developer mode: "full MCP support … available for ChatGPT Business and Enterprise/Edu customers on ChatGPT web". "Pro users can connect MCPs with read/fetch permissions in developer mode." Transports are SSE and streaming HTTP. Auth: OAuth (static credentials if given, otherwise CIMD when the server advertises it, otherwise DCR), or none. | Web only. Writes need Business, Enterprise or Edu. Pro is read-only. **Plus: not mentioned on the current help page**, and community posts contradict each other. | [excerpt] [Developer mode and MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt), [excerpt] [ChatGPT Developer mode guide](https://developers.openai.com/api/docs/guides/developer-mode) |
| **Gemini (consumer app)** | **Yes, narrowly.** "Custom apps" are MCP servers added by URL under Connected Apps, connected only in the Gemini **web** app and then usable on mobile. Eligibility is 18+, in the US, a personal Google Account, and Keep Activity on. If the server does not support DCR, credentials can be entered manually. A newer variant of the same page limits custom apps to **Gemini Spark** tasks, and Spark needs a **Google AI Pro or Ultra** subscription ("Subscription required"). | Web to connect, mobile to use. Effectively a paid Google AI tier in the US. | [excerpt] [Connect & manage custom apps for Gemini Apps](https://support.google.com/gemini/answer/17209137?hl=en), [excerpt] [What's new for Gemini Spark](https://support.google.com/gemini/answer/17171264) |
| Gemini Enterprise | Yes. An administrator configures custom MCP connections, Streamable HTTP only. | Business or Enterprise edition, set up by an admin | [excerpt] [Set up your custom MCP server data store](https://docs.cloud.google.com/gemini/enterprise/docs/connectors/custom-mcp-server/set-up-custom-mcp-server) |
| Gemini CLI | Yes, from its own config file. | Developer tool, not a chat app | [excerpt] secondary only: [usecarly.com](https://www.usecarly.com/blog/gemini-mcp/). No primary page was found in the searches below. |
| **Mistral Le Chat** | **Yes.** Connectors > Custom MCP Connector, enter URL. The auth method is auto-detected, OAuth with DCR included. | The account owner is the admin on Free, Pro and Student. One undated third-party post says a paid plan is needed. | [excerpt] [Mistral docs: MCP Connectors](https://docs.mistral.ai/le-chat/knowledge-integrations/connectors/mcp-connectors), [excerpt] [Configuring a custom connector](https://help.mistral.ai/en/articles/393572-configuring-a-custom-connector) |
| **Microsoft Copilot (consumer)** | **Not found.** Only Copilot Studio, with a work account and a paid licence, connects custom MCP servers (Streamable HTTP). | n/a | Secondary only: [skillsplayground.com](https://skillsplayground.com/integrations/microsoft-copilot/) |

**What this means for Fridgie** [inference from the rows above]: one MCP server with standard OAuth (DCR plus CIMD) is the right shape for every assistant that exists today. But "I used the last of the milk" is a **write**, and ChatGPT allows writes only on business tiers. A personal ChatGPT Pro account would get read-only use, and the server can do nothing about that.

**Searches tried that came back empty or thin.** Recorded so a reader can judge the gaps.

- `ChatGPT Plus developer mode custom MCP connector 2026 release notes` (restricted to openai.com domains) found no official statement about Plus.
- `Microsoft Copilot consumer app add custom MCP server 2026` found no Microsoft page saying the consumer app supports it.
- No primary Google page for Gemini CLI MCP turned up in the Gemini searches. It was not pursued further, because the CLI is not an assistant the owner named.
- No comparison of assistants' MCP client support published by a neutral party was found. The table above is assembled from each vendor.

## 3. The agent protocol (ADR 0001)

| Option | What it does | Cost | Rules out | Right pick if |
| - | - | - | - | - |
| **MCP over Streamable HTTP** (recommended) | The tool protocol Claude, ChatGPT, Gemini and Le Chat all accept, per section 2 | One endpoint, plus the OAuth that Claude requires | Nothing. A REST API can still sit beside it for the web client. | The goal is any assistant, starting with Claude iOS. True today. |
| OpenAPI or REST "actions" | A plain HTTP API described by OpenAPI | Cheapest to build | Claude iOS. None of Claude's connector docs accept an OpenAPI description. [read, by absence across the pages cited in section 1] | Only ChatGPT's Custom GPT Actions mattered |
| Agent2Agent (A2A) | Agent-to-agent delegation | High | Not a tool-server protocol. No consumer assistant above takes one as a connector. [inference from section 2: no surface lists it] | Fridgie were itself an agent other agents delegate to |

**Is MCP vendor-neutral?** Anthropic donated MCP to the Linux Foundation's **Agentic AI Foundation** on 2025-12-09. OpenAI and Block are co-founders, and Google, Microsoft, AWS and Cloudflare are members. [excerpt] [Anthropic: Donating the Model Context Protocol](https://www.anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation). Claude's own docs still describe it as "an open standard created by Anthropic" [read] [MCP](https://claude.com/docs/connectors/building/mcp.md). That is origin, not ownership.

**Discarded:** a local (stdio) MCP server. The iOS app cannot run a local process, and only Claude Desktop installs local extensions [read] [Add a connector…](https://claude.com/docs/connectors/custom/remote-mcp).

**The spec is moving.** MCP **2026-07-28** made the transport stateless and removed the `initialize` handshake and `Mcp-Session-Id`. Write-ups disagree on whether old and new versions interoperate on the wire ([excerpt] [WorkOS](https://workos.com/blog/mcp-stateless-spec-2026-07-28), [AAIF blog](https://aaif.io/blog/mcp-2026-07-28-whats-changing-and-how-to-migrate)). The official TypeScript SDK v2 keeps "the unchanged 2025 initialize" as its default, and makes 2026 negotiation opt-in ([excerpt] [SDK v2: Supporting protocol revision 2026-07-28](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28), [Upgrading from v1.x to v2](https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2.html)). The npm README of `@modelcontextprotocol/sdk` 1.32.1 says v1 "implements the MCP spec up to 2025-11-25" and is the maintenance line [read, registry.npmjs.org].

## 4. Stack and hosting (ADRs 0003 and 0004)

These two are decided together, because the OAuth authorization server is the hardest part of the build and where it can run is set by the host.

**Requirements every candidate must meet**, derived from sections 1 and 2:

1. HTTPS on the public internet, reachable from `160.79.104.0/21`.
2. OAuth discovery, registration and token endpoints answer **within 10 s**. A host that sleeps and takes about a minute to wake fails the first connect after idle. [inference from the 10 s limit, read above]
3. Data does not expire or pause when the owner does not use Fridgie for a week or a month.
4. $0 for one user, and no workflow file needed to deploy.

| Option | What it is | $0 limits that apply | Fails requirement | Right pick if |
| - | - | - | - | - |
| **A. Cloudflare Workers Free + D1 + KV** (recommended) | One TypeScript Worker serving web, MCP and OAuth. D1 is SQLite. Cloudflare's own OAuth provider library. | 100,000 requests/day. **10 ms CPU per invocation.** D1: 5 M rows read/day, 100 k rows written/day, 500 MB per database. KV: 100 k reads/day, **1 k writes/day**. No sleep. | None found, with the CPU caveat below | Today. Full limits are in ADR 0004. |
| B. Vercel Hobby + Neon Free | A Node or Hono app on Vercel Functions, Postgres on Neon | 1 M function invocations a month, 4 active CPU-hours. Hobby is "non-commercial personal use only", and an exceeded cap stops the feature "until 30 days have passed". Neon has 1 GB storage and suspends compute after 5 min idle (always on, cannot be disabled). | None outright. The OAuth authorization server has to be assembled from general libraries, and Neon wakes on the first query after idle. | Fridgie needs Postgres, or CPU over 10 ms per request |
| C. Supabase Free (the candidate nobody asked for) | Postgres, Auth that is *already* an OAuth 2.1 server with DCR for MCP, and Edge Functions | 500 MB database. "Supabase pauses Free Plan projects that show low activity over a 7-day period." The project is resumed by hand from the dashboard. | **Requirement 3.** A week away and the assistant connection is dead until the owner logs in to Supabase. The OAuth server was a public beta at its 2025-12 changelog. | The pausing rule went away. It would then beat A on auth, which comes ready-made. |
| D. Python (FastAPI) on Render Free | A web service plus free Postgres | Spins down after 15 idle minutes and takes about a minute to wake. Free Postgres **expires after 30 days**. | **Requirements 2 and 3** | Never at $0 |

Sources: Cloudflare [excerpt] [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 free-tier enforcement changelog, 2026-09-01](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/), [KV limits](https://developers.cloudflare.com/kv/platform/limits/). Vercel [excerpt] [Hobby plan](https://vercel.com/docs/plans/hobby), [Limits](https://vercel.com/docs/limits). Neon [excerpt] [Neon plans](https://neon.com/docs/introduction/plans). Supabase [excerpt] [Project pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [OAuth 2.1 server for MCP](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication), [changelog](https://supabase.com/changelog/38022-oauth-2-1-server-capabilities-for-supabase-auth). Render: secondary only, [flaviocopes.com, checked September 2026](https://flaviocopes.com/hosting-free-tiers/). Render's own pricing page was not reached.

**Discarded:** Deno Deploy Free. A tracker reports its free limits were cut around August 2026 ([agentdeals.dev](https://agentdeals.dev/vendor/deno-deploy), secondary). It has no maintained MCP OAuth provider comparable to A's. The official pricing page could not be reached to confirm either point, so it was not carried further. Also discarded: **extending what exists.** The repository has no runtime at all, and `scripts/app-render` waits for a `BUILD_CMD` (#1), so there is nothing to extend.

**Why A, specifically:**

- `@cloudflare/workers-oauth-provider` 1.2.3 (2026-10-07, MIT) implements the authorization server Claude needs. It covers RFC 8414 metadata, DCR, **opt-in CIMD**, PKCE, resource and audience binding, and refresh. It can list and revoke a user's grants, and it supports upstream sign-in with GitHub [excerpt] [README](https://github.com/cloudflare/workers-oauth-provider), [CHANGELOG](https://github.com/cloudflare/workers-oauth-provider/blob/main/CHANGELOG.md). The npm README read in this run confirms the `OAUTH_KV` binding, `clientIdMetadataDocumentEnabled`, and the `global_fetch_strictly_public` flag CIMD needs [read, registry.npmjs.org].
- The MCP TypeScript SDK v2 (`@modelcontextprotocol/server` 2.3.1) ships a web-standard transport for Workers. Its docs say: "if you deploy to a web-standard runtime (Cloudflare Workers, Deno, Bun), use WebStandardStreamableHTTPServerTransport" [excerpt] [Upgrading to v2](https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2.html). There is an official Hono adapter, `@modelcontextprotocol/hono` 2.0.2 [read, registry.npmjs.org].
- Workers do not sleep. "No cold starts" is Cloudflare's own claim, and isolates "may be evicted" in rare cases [excerpt] [How Workers works](https://developers.cloudflare.com/workers/reference/how-workers-works/). This is a vendor claim with no independent measurement found.
- Deploy runs through **Workers Builds** (Cloudflare's GitHub integration), so there is **no workflow file and no repository secret**. It is free for 3,000 build minutes a month, 1 concurrent build, and a 20-minute timeout [excerpt] [Workers Builds limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/), [Builds](https://developers.cloudflare.com/workers/ci-cd/builds/).

## 5. Agent auth and web sign-in (ADR 0002)

One identity serves both paths, so ADR 0002 covers both, as the issue allows.

| Option | Web sign-in | Agent auth | Cost to the owner | Rules out |
| - | - | - | - | - |
| **GitHub sign-in, with Fridgie as its own OAuth server for agents** (recommended) | "Sign in with GitHub" (an OAuth App). The session is a Fridgie cookie. | The Worker issues its own tokens (option A library). Its `/authorize` step *is* the same GitHub sign-in followed by a consent page. | One free GitHub OAuth App, created once | A household member without a GitHub account, until another sign-in method is added. That is an addition, not a migration (ADR 0002). |
| Passkeys only | WebAuthn on the phone | Same authorization server, consent after a passkey prompt | Nothing to create | **Recovery.** A lost phone with a non-synced passkey locks out the only user, and there is no password reset ([excerpt] [MojoAuth](https://mojoauth.com/blog/passkey-recovery-and-lockout-relying-parties-guide)). A second factor would have to be built. |
| Email magic link | Link emailed to the owner | Same | A free email-sending account, a new outbound host, and an API key secret | Nothing, but it adds a vendor and a secret for no gain over GitHub |
| Supabase Auth (option C) | Supabase-hosted | Supabase OAuth 2.1 server | Supabase account | Tied to option C, which fails on pausing |

**Discarded:** putting Cloudflare Access (Zero Trust) in front of the app. It would protect the web pages, but the MCP endpoint must answer Claude's discovery itself with a `401` and metadata, and must be reachable from Anthropic's IP range ([read] [Authentication](https://claude.com/docs/connectors/building/authentication.md)). A login wall in front of it breaks the connect. [inference]

**Why GitHub:** the owner already has the account (they own this repository). The sign-in works in iOS Safari and needs no password hashing on the Worker. Hashing is the commonest reason a Worker on the free plan blows its 10 ms CPU budget ([excerpt] [nilaykabariya.blog on error 1102](https://nilaykabariya.blog/deploy/worker-exceeded-cpu-time-limit-error-1102), secondary). The GitHub OAuth App needs no scope at all to read the user's numeric ID ([excerpt] [Authorizing OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps): "If not provided, scope defaults to an empty list"). **[assumption]** That an empty-scope token can call `GET /user` for the public profile and numeric ID. This is long-standing GitHub behaviour, but no page read in this run states it. The engineer confirms it on the first sign-in.

## 6. The case against the recommendation

I went looking for people who chose Workers and this library and regretted it:

- **The 10 ms CPU cap is the real risk.** On the free plan a request over budget gets **error 1102**. Cloudflare's docs say occasional overruns are tolerated, but consistent ones are terminated, and the cap cannot be raised without going to Workers Paid at $5 a month ([excerpt] [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Error 1102](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1102/), [community thread](https://community.cloudflare.com/t/what-happens-when-the-cpu-time-is-more-than-10ms/434689)). I found no report specific to an MCP server or the OAuth provider hitting it (search: `Cloudflare Workers free plan 10ms CPU limit exceeded error 1102 MCP server OAuth regret`, no MCP or OAuth result). **[inference]** Token issuance uses WebCrypto (AES-GCM, SHA-256), which is native code, and waiting on D1 or KV does not count toward CPU. So the budget should hold, but nobody has measured it for this workload. ADR 0003 makes a CPU check part of the engineer's acceptance.
- **The library is young and had real bugs.** CVE-2025-4143 (open redirect) and CVE-2025-4144 (**PKCE bypass**) were both fixed in 0.0.5, in May 2025 ([excerpt] [GitLab advisory 4144](https://advisories.gitlab.com/npm/@cloudflare/workers-oauth-provider/CVE-2025-4144/), [4143](https://advisories.gitlab.com/npm/@cloudflare/workers-oauth-provider/CVE-2025-4143/)). No advisory newer than that was found. The 1.x line is current. One downstream project plans to move *off* the library and its KV requirement to Better Auth ([excerpt] [aotter/mantle#734](https://github.com/aotter/mantle/issues/734)). That is a preference, not a defect report.
- **KV free tier: 1,000 writes a day.** The provider stores grants and tokens in KV. **[inference]** One owner with one or two assistants refreshing hourly writes a few dozen a day. A loop that re-registers clients through DCR could exhaust it, and CIMD avoids that.
- **Lock-in.** D1, KV, the OAuth library and Workers Builds are all Cloudflare's. Moving to option B means rewriting the authorization server and the data layer. D1 is SQLite, so the data itself exports.
- **D1 free-tier limits became hard on 2026-09-01.** Queries over the daily row limits now fail rather than being billed or tolerated ([excerpt] [changelog](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/)). "Rows read" counts rows *scanned*, so an unindexed query over the event history is how one user could get there. **[inference]**

**What would flip it:**

- If the engineer measures any route consistently above 10 ms CPU and it cannot be brought under, the answer becomes option B (Vercel Hobby and Neon), or the owner paying $5 a month for Workers Paid. That second path breaks O3 and is theirs to choose.
- If Cloudflare removes or cuts the Workers free plan, the answer becomes option B.
- If Supabase dropped free-project pausing, option C would win on auth effort.

## 7. What I would read next

The comparison stopped moving after the Supabase, Vercel and Neon, and Render checks: none of them changed the ranking. If a later run can reach the hosts blocked here, it should open the **[excerpt]** pages in full. Most worth doing are the OpenAI developer-mode page (the Plus answer) and Cloudflare's Workers limits page (the CPU burst wording). A short engineer spike measuring CPU per request for `/token` and an MCP `tools/call` on the free plan would settle the main risk with evidence rather than inference. ADR 0003 folds that measurement into the first build instead of a separate issue.
