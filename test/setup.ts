import { applyD1Migrations, env } from "cloudflare:test";

// Every test file starts from migrations/ applied to a fresh local D1.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
