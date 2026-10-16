import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

// Vite's ?raw import: a file's text, so a test can read the design spec itself.
declare module "*?raw" {
  const text: string;
  export default text;
}
