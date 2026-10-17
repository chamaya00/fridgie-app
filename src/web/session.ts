// The web session cookie, the one-shot flash banner, and the guards every
// inventory route sits behind (ADR 0002 "Web sign-in").

import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import type { Env } from "../env";
import type { User } from "../service/users";
import { userForSession, SESSION_DAYS } from "../service/users";
import type { Flash } from "./views";
import { renderPage, SignedOutPage } from "./views";

export const SESSION_COOKIE = "fridgie_session";
export const FLASH_COOKIE = "fridgie_flash";

export type AppEnv = {
  Bindings: Env;
  Variables: {
    user: User;
    sessionToken: string;
    /** Origins this response's forms may also post or redirect to (Consent's hand-back). */
    formActionOrigins: string[];
  };
};
export type AppContext = Context<AppEnv>;

function secure(c: Context): boolean {
  return new URL(c.req.url).protocol === "https:";
}

export async function setSessionCookie(c: Context<AppEnv>, token: string): Promise<void> {
  await setSignedCookie(c, SESSION_COOKIE, token, c.env.COOKIE_SECRET, {
    httpOnly: true,
    secure: secure(c),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function sessionToken(c: Context<AppEnv>): Promise<string | null> {
  if (!c.env.COOKIE_SECRET) return null;
  const token = await getSignedCookie(c, c.env.COOKIE_SECRET, SESSION_COOKIE);
  return typeof token === "string" && token.length > 0 ? token : null;
}

export function clearSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: secure(c) });
}

/** The signed-in user, or null. */
export async function currentUser(c: Context<AppEnv>): Promise<{ user: User; token: string } | null> {
  const token = await sessionToken(c);
  if (!token) return null;
  const user = await userForSession(c.env.DB, token);
  return user ? { user, token } : null;
}

/**
 * Every inventory page and data endpoint sits behind this. Signed out, a page
 * request gets the Signed out page and anything else gets a 401; either way
 * nothing from any inventory is read.
 */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const found = await currentUser(c);
  if (!found) {
    const path = new URL(c.req.url).pathname;
    if (c.req.method === "GET") {
      return c.html(renderPage("Fridgie", SignedOutPage({ next: path === "/" ? undefined : path })), path === "/" ? 200 : 401);
    }
    return c.text("Sign in first.", 401);
  }
  c.set("user", found.user);
  c.set("sessionToken", found.token);
  await next();
};

/**
 * Refuse a form post from another origin. The session cookie is SameSite=Lax,
 * which already keeps it off cross-site posts; this is the second lock.
 */
export const sameOriginPosts: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.method === "POST") {
    const origin = c.req.header("Origin");
    if (origin && origin !== "null" && new URL(origin).host !== new URL(c.req.url).host) {
      return c.text("Cross-site form posts are refused.", 403);
    }
  }
  await next();
};

export async function setFlash(c: Context<AppEnv>, flash: Flash): Promise<void> {
  await setSignedCookie(c, FLASH_COOKIE, JSON.stringify(flash), c.env.COOKIE_SECRET, {
    httpOnly: true,
    secure: secure(c),
    sameSite: "Lax",
    path: "/",
    maxAge: 60,
  });
}

/** Read the flash once, and clear it so a reload does not show it again. */
export async function takeFlash(c: Context<AppEnv>): Promise<Flash | undefined> {
  const raw = await getSignedCookie(c, c.env.COOKIE_SECRET, FLASH_COOKIE);
  if (typeof raw !== "string" || raw === "") return undefined;
  deleteCookie(c, FLASH_COOKIE, { path: "/", secure: secure(c) });
  try {
    const parsed = JSON.parse(raw) as Flash;
    return typeof parsed.text === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
}
