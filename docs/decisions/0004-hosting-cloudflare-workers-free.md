# ADR 0004: Hosting: Cloudflare Workers Free, with D1 and KV, deployed by Workers Builds

Date: 2026-10-16
Status: proposed

Research: [docs/research/4-agent-auth-stack-hosting.md](../research/4-agent-auth-stack-hosting.md), sections 4 and 6.

## Context

The hosting budget is **$0, free tiers only** (#3 O3). Fridgie must meet four requirements:

1. **Public HTTPS.** Be reachable over public HTTPS from Anthropic's egress range `160.79.104.0/21`.
2. **Fast OAuth.** Answer OAuth discovery, registration and token requests **within 10 seconds**, because Claude treats a slower answer as a failure. That rules out hosts that sleep and take about a minute to wake.
3. **No expiry.** Keep its data and stay reachable through weeks of no use.
4. **No workflow file.** Deploy without anything new under `.github/workflows/`, because no agent may add one there.

The owner creates the accounts and enters the secrets (#3, "Still yours").

## Decision

Fridgie runs as one Worker named **`fridgie`** on **Cloudflare Workers Free**, at **`https://fridgie.<owner-subdomain>.workers.dev`**. A custom domain is optional and not needed. It uses:

- **D1** (database `fridgie`, binding `DB`) for all application data;
- **Workers KV** (namespace bound as `OAUTH_KV`) for OAuth grants and tokens;
- **Workers static assets** for any CSS, JS or icons.

It deploys through **Workers Builds**, Cloudflare's GitHub integration. That integration builds on Cloudflare on every push to `main` and runs `npm run deploy` (ADR 0003). **No file under `.github/workflows/` and no GitHub repository secret is involved.** Preview builds for other branches are **off**, because a preview Worker would share the production D1 binding.

### Free-tier limits that apply to one user, and what happens at each

| Limit (Workers Free) | Value | What happens when it is hit | Expected for one user |
| - | - | - | - |
| Worker requests | 100,000/day, reset 00:00 UTC | Further requests fail (`429` or error 1027) until the reset. Static assets are free and unlimited. | Hundreds a day *[inference]* |
| **CPU per request** | **10 ms** | Occasional overruns are tolerated. Consistent ones end the request with **error 1102**, "Worker exceeded resource limits". Cannot be raised on Free. | The main risk. Measured in #7 (ADR 0003). |
| Memory per isolate | 128 MB | The request fails | Far below |
| Subrequests per request | 50 | Further `fetch` calls fail | At most a few (GitHub at sign-in) |
| D1 rows **read** | 5,000,000/day | Since 2026-09-01, **queries fail** until the reset. Stored data is unaffected. Rows *scanned* count, not rows returned. | Small, if queries use indexes *[inference]* |
| D1 rows **written** | 100,000/day | Same: writes fail until the reset | Tens a day |
| D1 storage | 500 MB per database, 5 GB per account, 10 databases | Writes fail when the database is full | Kilobytes to a few MB a year *[inference]* |
| D1 Time Travel (point-in-time restore) | 7 days on Free | Older states cannot be restored | Backup horizon is one week |
| KV reads | 100,000/day | Reads fail until the reset. Token validation reads KV, so `/mcp` calls fail. | Hundreds a day |
| **KV writes** | **1,000/day** | Writes fail until the reset. New tokens, refreshes and grants fail, so assistants cannot connect or refresh. | A few dozen a day. CIMD avoids per-connection registrations. *[inference]* |
| KV storage | 1 GB | Writes fail | Kilobytes |
| Sleep or cold start | **None.** Workers do not sleep. Cloudflare claims no cold starts on root hostnames. Isolates "may be evicted" rarely. | n/a | n/a |
| Idle free projects | **No expiry or pausing found.** Searched for a Workers inactivity rule and found none. The only Cloudflare idle rule found is for DNS zones never activated (28 days), which does not apply to `workers.dev`. | n/a | n/a |
| Workers Builds | 3,000 build minutes a month, 1 concurrent build, 20-minute timeout | Builds queue, or fail at the timeout | About 1 to 2 minutes per merge |

Sources are in the research document, section 4: Workers limits and pricing, D1 limits and the 2026-09-01 enforcement changelog, KV limits, static assets billing, Workers Builds limits, and "How Workers works". All were checked on 2026-10-16 from the search engine's excerpts of the Cloudflare pages.

## Owner steps

Everything the owner does with their own accounts, in order. Steps 1 to 6 can happen before or while #7 is built. Step 7 needs #7 merged, and step 9 needs #8 deployed.

1. **Create a Cloudflare account** (free) at `https://dash.cloudflare.com/sign-up`. Under **Workers & Pages**, choose your `workers.dev` subdomain. Fridgie will live at `https://fridgie.<subdomain>.workers.dev`. Post the subdomain on #1.
2. **Create the D1 database.** Workers & Pages > D1 > **Create**, name it **`fridgie`**. Copy its **Database ID**.
3. **Create the KV namespace.** Workers & Pages > KV > **Create**, name it **`fridgie-oauth`**. Copy its **Namespace ID**.
4. **Post both IDs on #1**, or on the engineer's pull request, so they go into `wrangler.jsonc`. They are identifiers, not secrets.
5. **Create a GitHub OAuth App** at GitHub > Settings > Developer settings > **OAuth Apps** > New OAuth App:
   - **Application name:** `Fridgie`
   - **Homepage URL:** `https://fridgie.<subdomain>.workers.dev`
   - **Authorization callback URL:** `https://fridgie.<subdomain>.workers.dev/auth/github/callback`

   Copy the **Client ID** and click **Generate a new client secret**. Find your numeric GitHub user ID: open `https://api.github.com/users/<your-login>` and read the `"id"` field.
6. **Set the Worker's secrets and variables.** This step needs the Worker to exist, so do it straight after the first deploy in step 7, or create an empty Worker named `fridgie` first. Under Workers & Pages > `fridgie` > Settings > **Variables and Secrets**, add:
   - Secret **`GITHUB_CLIENT_ID`**: the OAuth App's client ID
   - Secret **`GITHUB_CLIENT_SECRET`**: the OAuth App's client secret
   - Secret **`COOKIE_SECRET`**: 32 or more random bytes, for example the output of `openssl rand -base64 32`
   - Variable **`ALLOWED_GITHUB_IDS`**: your numeric GitHub user ID, comma-separated if more are ever added

   These are **Cloudflare Worker secrets**, entered in Cloudflare.
7. **Connect the repository with Workers Builds.** In Workers & Pages > `fridgie` > Settings > **Builds** > Connect, authorise the Cloudflare GitHub app for `chamaya00/fridgie-app` only. Then set:
   - **Production branch:** `main`
   - **Build command:** leave empty
   - **Deploy command:** `npm run deploy`
   - **Preview builds:** **off** (Branch control)

   Then edit the **build API token** Cloudflare created for this Worker and add **Account > D1 > Edit**. Without it, the migration step in `npm run deploy` fails with an authorisation error *[secondary sources only; confirm on the first deploy]*.
8. **Repository secrets and variables: none.** **Files under `.github/workflows/`: none.** Deploying needs neither. The CI gate replacement (ADR 0003 `## Gate commands`) needs no secret either.
9. **Connect Claude after deploy** (#8). On claude.ai, in a browser on the phone or on a computer, go to Customize > Connectors > **Add custom connector**:
   - **URL:** `https://fridgie.<subdomain>.workers.dev/mcp`
   - **Authentication:** **Sign in now**
   - **OAuth client:** **Use Claude's published identity** (or **Register automatically**)

   Sign in with GitHub and approve. The connector then appears in the Claude iOS app. A Claude Free plan allows exactly one custom connector.

## Consequences

- **$0 with no sleeping and no expiry.** That meets requirements 2 and 3 where every free alternative checked failed at least one.
- **Deploys are a person-free path once set up.** There is no workflow file, and no Cloudflare credential sits in GitHub. The cost is that the deploy runs where the gate cannot see it. ADR 0003 says what covers that gap.
- **Hard daily caps.** Over a limit, Fridgie fails until 00:00 UTC rather than billing. For one user, the KV write cap (1,000 a day) and the CPU cap are the ones that could plausibly bite. Both are named in tests and in #7's measurement.
- **Backups are short.** D1 Time Travel covers 7 days on Free. A longer history of the database means an export, for example `wrangler d1 export`, which is not built now.
- **Paid fallback.** If the CPU cap is consistently exceeded, the cheapest exit is **Workers Paid at $5 a month**, with the same code and the same deploy. That breaks O3, so it is the owner's decision, not an agent's.
- **Owner's lock-in.** The account, data and OAuth store all sit in one Cloudflare account the owner controls. D1 is SQLite and exports to SQL.

## Alternatives rejected

- **Vercel Hobby with Neon Free.** It meets the requirements and is the fallback. It lost on needing two vendors and on assembling the OAuth server from general libraries (ADR 0003). A cap exceeded on Hobby can stop the feature "until 30 days have passed", where Cloudflare stops it until the next UTC midnight.
- **Supabase Free.** It fails requirement 3. Free projects pause after 7 days of low activity, and a paused project must be resumed by hand from the dashboard. During that time the assistant connection fails.
- **Render Free.** It fails requirements 2 and 3. The web service sleeps after 15 minutes, takes about a minute to wake, and the free Postgres expires after 30 days.
- **Deno Deploy Free.** Its limits were reportedly cut around August 2026, and it has no maintained MCP OAuth provider comparable to Cloudflare's. Discarded without a full comparison.
- **Deploying from GitHub Actions with `cloudflare/wrangler-action`.** It needs a workflow file, which only a person may add, plus a third-party action and two repository secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). All three widen what the automation may do, and Workers Builds does the same job with none of them.
