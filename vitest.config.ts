import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Tests run inside workerd with a local D1 (Miniflare): no Cloudflare account
// and no network. migrations/ is read here and applied to a fresh database in
// test/setup.ts before any test, so a migration that does not apply fails
// `npm run test`.
export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            GITHUB_CLIENT_ID: "test-client-id",
            GITHUB_CLIENT_SECRET: "test-client-secret",
            COOKIE_SECRET: "test-cookie-secret-test-cookie-secret",
            ALLOWED_GITHUB_IDS: "1001,1002",
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/setup.ts"],
    },
  };
});
