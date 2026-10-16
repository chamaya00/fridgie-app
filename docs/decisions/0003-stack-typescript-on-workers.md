# ADR 0003: Stack: TypeScript on Cloudflare Workers, D1, Hono, the MCP TypeScript SDK, and workers-oauth-provider

Date: 2026-10-16
Status: proposed

Research: [docs/research/4-agent-auth-stack-hosting.md](../research/4-agent-auth-stack-hosting.md), sections 4 and 6.

## Context

Fridgie is one service with two clients: a web app used in the owner's phone browser, and an MCP server for assistants (ADR 0001). Both share one data store and one write path (#1).

- **Authorization server.** The agent side needs a full OAuth 2.1 authorization server that meets Claude's requirements (ADR 0002).
- **Budget.** Hosting is $0 (#3 O3), and ADR 0004 chooses Cloudflare Workers Free. Its binding constraint is **10 ms of CPU per request**.
- **The gate.** No agent may edit `.github/workflows/ci.yml`. The driver replaces it with exactly the commands named below (#3 O4), through the factory reusable workflow's Node path. That path takes `node-version` and `checks` (a list of `package.json` script names), and installs with `npm ci` when it finds `package-lock.json`.

Nothing exists yet. The repository holds only scaffolding.

## Decision

**Language and runtime.** TypeScript, running on **Cloudflare Workers** (workerd). Local tooling runs on **Node.js 24**. Wrangler 4 needs Node ≥ 22, and Vitest 4 supports 24. The package manager is **npm**, and `package-lock.json` is committed.

**One Worker serves everything.**

| Route | What it is |
| - | - |
| `/` and the app pages | Server-rendered HTML for the phone browser, with as little client JavaScript as the design needs |
| `/auth/*` | GitHub sign-in (ADR 0002) |
| `/authorize`, `/token`, `/register`, `/.well-known/*` | The OAuth authorization server (ADR 0002) |
| `/mcp` | The MCP server (ADR 0001) |

Every route calls one **service layer** module (`src/service/`). That module is the only code that touches the database.

**Dependencies.** These are approved for the builds that follow (#3 O2). Anything else stops and asks.

| Package | Version range | Role |
| - | - | - |
| `wrangler` | `^4` | Build, local dev, deploy, D1 migrations |
| `@cloudflare/workers-oauth-provider` | `^1.2` | OAuth 2.1 authorization server and token validation. Must be ≥ 1.2, because earlier lines carried CVE-2025-4143 and CVE-2025-4144. |
| `@modelcontextprotocol/server` | `^2.3` | MCP server (SDK v2, `WebStandardStreamableHTTPServerTransport`, stateless). Keeps its default 2025-era `initialize` handshake (ADR 0001). |
| `@modelcontextprotocol/hono` | `^2.0` | Official Hono adapter for the MCP server. Optional: use it if it fits, otherwise the transport directly. |
| `hono` | `^4` | Routing, cookies, and JSX for server-rendered HTML |
| `zod` | `^4` | Input validation for tool inputs and forms. MCP tool schemas use it too. |
| `typescript` | `~6.0` | Type checker. Pinned below 6.1 because `typescript-eslint` 8 supports `<6.1.0`. |
| `@cloudflare/workers-types` | latest | Worker runtime types |
| `vitest` | `~4.1` | Test runner. `@cloudflare/vitest-pool-workers` 0.23 peers on `^4.1`. |
| `@cloudflare/vitest-pool-workers` | `^0.23` | Runs tests inside workerd with local D1 and KV (Miniflare). No Cloudflare account is needed. |
| `eslint`, `typescript-eslint`, `@eslint/js` | `^10`, `^8`, `^10` | Lint |

**Data.** **Cloudflare D1** (SQLite). SQL migrations live in `migrations/` and are applied with `wrangler d1 migrations apply`. No ORM, because plain SQL with prepared statements is enough at this size. Adding one later is its own decision. The schema itself is the engineer's ADR in #7, because a schema is a category change. This ADR fixes only that it is SQLite on D1, and that every table carrying user data has a `user_id` column referencing `users.id` (ADR 0002). **KV** namespace `OAUTH_KV` holds OAuth grants and tokens. The library requires it.

**Worker configuration.** `wrangler.jsonc` is committed, with the Worker name `fridgie`, binding `DB` (D1) and binding `OAUTH_KV` (KV). It sets `compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"]`. The second flag is required for CIMD (ADR 0002).

**`package.json` scripts.** The engineer creates exactly these names, because the gate runs them by name:

| Script | Command |
| - | - |
| `typecheck` | `tsc --noEmit` |
| `lint` | `eslint .` |
| `test` | `vitest run` |
| `build` | `wrangler deploy --dry-run --outdir dist` |
| `dev` | `wrangler dev` |
| `deploy` | `wrangler d1 migrations apply DB --remote && wrangler deploy` |

The last two are not gate checks. `deploy` is what Workers Builds runs (ADR 0004).

**CPU check.** The first build (#7) includes the 10 ms CPU check: a test or recorded measurement showing that `/token` and one MCP `tools/call` stay under 10 ms of CPU on the free plan. Reading `wrangler tail` or the dashboard's CPU-time metric after deploy is enough, recorded in the pull request. If it fails, see "What would flip it" in the research.

## Gate commands

These are the exact lines the driver's replacement for `.github/workflows/ci.yml` runs. Each one must exit 0 from a clean checkout after install, on the first engineer pull request (#7) that adds `package.json` and `package-lock.json`. Before that pull request, none of these scripts exists, which is why the placeholder gate stays until then.

- **Runtime:** Node.js **24**, with npm as bundled with Node 24.
- **Install:** `npm ci`
- **Checks, in order:**
  1. `npm run typecheck`
  2. `npm run lint`
  3. `npm run test`
  4. `npm run build`

On the factory reusable workflow's **Node path** this is:

```yaml
with:
  check-name: 'checks'
  node-version: '24'
  checks: 'typecheck,lint,test,build'
```

The reusable workflow detects npm from `package-lock.json` and runs `npm ci` itself, then the four scripts in order. `check-name` stays `checks`.

**Permissions, secrets and third-party actions: none beyond the factory reusable workflow.**

- **Tests** run in workerd locally through `@cloudflare/vitest-pool-workers` and Miniflare. They need no Cloudflare credentials or network. *[inference from the package's role and dependencies, verified in the run that first executes it]*
- **`wrangler deploy --dry-run`** bundles without uploading and needs no login. *[inference: dry-run is documented as not deploying; the engineer confirms it in #7's CI run, and if it ever demands credentials the gate fails visibly rather than silently]*
- **Permissions.** The reusable workflow already declares `contents: read`, and uses only `actions/checkout` and `actions/setup-node`.

No repository secret is added. Deploy credentials live in Cloudflare, not in GitHub (ADR 0004).

### Does the gate run what publishes it?

**Partly, and the rest is covered as follows.**

- **What publishes Fridgie.** **Cloudflare Workers Builds** publishes it. On each push to `main` it runs `npm ci` and then `npm run deploy` on Cloudflare's build machines, which is `wrangler d1 migrations apply DB --remote` followed by `wrangler deploy`. This gate cannot reach it.
- **What the gate shares with it.** The gate runs the **same bundler with the same `wrangler.jsonc`** through `wrangler deploy --dry-run`. A bundle that fails to build fails the gate first.
- **What the gate does not run:**
  - applying migrations to the remote D1 database;
  - the upload itself;
  - checking that the bindings' resource IDs and the Worker secrets exist in the owner's Cloudflare account.
- **What covers the gap:**
  1. **Migrations.** Migrations are tested locally: Vitest applies `migrations/` to a fresh local D1 before the suite, so a migration that does not apply fails `npm run test`.
  2. **Failed builds are reported.** Workers Builds reports each build's success or failure on the commit in GitHub *[inference from the Builds docs describing GitHub integration and pull request comments; the driver confirms on the first deploy]*. The house rule says to watch the merge commit until the deploy settles, and the driver does.
  3. **Smoke check.** After each deploy, the driver requests `https://<host>/.well-known/oauth-protected-resource` and expects `200` with the right `resource`, and requests `/mcp` with no token and expects `401`. That is the smoke check that the published Worker is the one the gate built.

That bound is the whole protection between merge and production. A broken deploy is visible on the merge commit, but nothing blocks the merge on it.

## Consequences

- **One language for everything.** The web app, MCP server and OAuth server are one TypeScript codebase and one deploy. There is one write path by construction.
- **Tests run in the real runtime** (workerd) with real SQLite, offline, inside the gate.
- **CPU discipline is required.** No password hashing, no large synchronous parsing, and no heavy JSON work per request. Waiting on D1 or KV does not count toward CPU.
- **Portability.** The code is tied to Workers APIs (D1, KV bindings, `WorkerEntrypoint`). Hono, the MCP SDK and the service layer are portable. The OAuth provider and the D1 calls are not. Moving hosts means swapping those two.
- **`scripts/app-render`.** It gets `BUILD_CMD` from `npm run build`, and serves through `npx wrangler dev`, the dev server. Filling it in is #7's job.
- **TypeScript 7** (the native compiler) is out until `typescript-eslint` supports it. Moving up is a version bump with its reasoning in the pull request, not a new ADR.

## Alternatives rejected

- **TypeScript on Vercel Hobby with Neon Postgres.** Viable, and the fallback if the 10 ms CPU budget fails. It lost because the OAuth authorization server would be assembled from general-purpose libraries rather than one built for this exact flow and runtime. It also adds a second vendor (Neon), whose compute suspends after 5 minutes idle.
- **Supabase (Postgres, Auth with OAuth 2.1, Edge Functions).** The least auth work of any option. It lost because free projects pause after 7 days of low activity (ADR 0004).
- **Python (FastAPI) on Render Free.** Its free web service sleeps after 15 minutes and takes about a minute to wake, which is longer than Claude's 10-second limit on OAuth endpoints. Its free Postgres expires after 30 days.
- **The MCP TypeScript SDK v1 (`@modelcontextprotocol/sdk`).** It is the maintenance line and pulls in Express and Node-only dependencies. v2's web-standard transport is the documented path for Workers.
- **Cloudflare's `agents` package (`McpAgent` or `createMcpHandler`).** It brings a large peer-dependency surface for features Fridgie does not use, and Cloudflare marks `McpAgent` as legacy. The official SDK v2 is vendor-neutral.
- **A client-side SPA framework (React or similar).** Server-rendered HTML through Hono JSX is enough for a phone inventory list, and keeps one build and one bundle. The designer (#6) can ask for client interactivity within that.
