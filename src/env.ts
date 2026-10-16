// The Worker's bindings (wrangler.jsonc) and its secrets and variables
// (ADR 0004 owner step 6).

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      OAUTH_KV: KVNamespace;
      GITHUB_CLIENT_ID: string;
      GITHUB_CLIENT_SECRET: string;
      COOKIE_SECRET: string;
      /** Numeric GitHub user IDs, comma-separated. Unset lets nobody in. */
      ALLOWED_GITHUB_IDS?: string;
      /**
       * "1" turns on /dev/session for scripts/app-render. Only ever passed on
       * the `wrangler dev` command line; never in wrangler.jsonc or a secret.
       */
      DEV_SESSION_SEEDING?: string;
    }
  }
}

export type Env = Cloudflare.Env;
