// The Fridgie Worker. One service, two clients (ADR 0003): this file wires the
// web app; #8 adds the OAuth server and /mcp around the same service layer.

import { Hono } from "hono";
import type { AppEnv } from "./web/session";
import { sameOriginPosts } from "./web/session";
import { auth } from "./web/auth";
import { dev } from "./web/dev";
import { inventory } from "./web/inventory";
import { NotFoundPage, renderPage } from "./web/views";

export const app = new Hono<AppEnv>();

app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  c.header("X-Frame-Options", "DENY");
  // No script runs on any page this Worker serves (design spec section 8).
  c.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self' https://github.com; frame-ancestors 'none'; base-uri 'none'");
});
app.use("*", sameOriginPosts);
app.route("/auth", auth);
app.route("/dev", dev);
app.route("/", inventory);
app.notFound((c) => c.html(renderPage("Not here", NotFoundPage()), 404));

export default app;
