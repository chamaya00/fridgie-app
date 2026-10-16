// GitHub web sign-in (ADR 0002 "Web sign-in"): no scopes, the numeric ID read
// once, the GitHub token discarded, and only allow-listed IDs get a users row.

import { Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { allowedGithubIds, createSession, deleteSession, upsertUser } from "../service/users";
import type { AppContext, AppEnv } from "./session";
import { clearSessionCookie, sessionToken, setSessionCookie } from "./session";
import { NotInvitedPage, renderPage, SignedOutPage } from "./views";

const STATE_COOKIE = "fridgie_oauth_state";
export const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
export const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GITHUB_USER_URL = "https://api.github.com/user";

/** Only same-site paths may be returned to after sign-in. */
export function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

function randomState(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const auth = new Hono<AppEnv>();

auth.get("/github", async (c) => {
  const url = new URL(c.req.url);
  const state = randomState();
  const next = safeNext(c.req.query("next"));
  await setSignedCookie(c, STATE_COOKIE, JSON.stringify({ state, next }), c.env.COOKIE_SECRET, {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "Lax",
    path: "/auth",
    maxAge: 600,
  });
  const authorize = new URL(GITHUB_AUTHORIZE_URL);
  authorize.searchParams.set("client_id", c.env.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", `${url.origin}/auth/github/callback`);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("allow_signup", "false");
  // "Try another GitHub account" asks GitHub to offer the account picker.
  if (c.req.query("prompt") === "select_account") authorize.searchParams.set("prompt", "select_account");
  return c.redirect(authorize.toString(), 302);
});

function signInFailed(c: AppContext) {
  return c.html(renderPage("Fridgie", SignedOutPage({ message: "Sign-in didn't finish. Try again." })), 400);
}

auth.get("/github/callback", async (c) => {
  const url = new URL(c.req.url);
  const raw = await getSignedCookie(c, c.env.COOKIE_SECRET, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/auth", secure: url.protocol === "https:" });
  let expected: { state: string; next: string } | null;
  try {
    expected = typeof raw === "string" ? (JSON.parse(raw) as { state: string; next: string }) : null;
  } catch {
    expected = null;
  }
  const code = c.req.query("code");
  if (!expected || !code || c.req.query("state") !== expected.state) return signInFailed(c);

  // Exchange the code, read the numeric ID, and let the GitHub token go out of scope.
  const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/auth/github/callback`,
    }),
  });
  if (!tokenResponse.ok) return signInFailed(c);
  const { access_token: accessToken } = (await tokenResponse.json()) as { access_token?: string };
  if (!accessToken) return signInFailed(c);

  const userResponse = await fetch(GITHUB_USER_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json", "User-Agent": "fridgie" },
  });
  if (!userResponse.ok) return signInFailed(c);
  const profile = (await userResponse.json()) as { id?: unknown; login?: unknown };
  if (typeof profile.id !== "number" || typeof profile.login !== "string") return signInFailed(c);

  if (!allowedGithubIds(c.env.ALLOWED_GITHUB_IDS).has(profile.id)) {
    // No users row, no session: nothing is saved about this account.
    return c.html(renderPage("Fridgie", NotInvitedPage({ login: profile.login })), 403);
  }
  const user = await upsertUser(c.env.DB, profile.id, profile.login);
  await setSessionCookie(c, await createSession(c.env.DB, user.id));
  return c.redirect(safeNext(expected.next), 303);
});

async function signOut(c: AppContext) {
  const token = await sessionToken(c);
  if (token) await deleteSession(c.env.DB, token);
  clearSessionCookie(c);
  return c.redirect("/", 303);
}

auth.get("/sign-out", signOut);
auth.post("/sign-out", signOut);
