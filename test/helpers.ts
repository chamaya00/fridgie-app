// Shared test helpers: a signed-in user, requests through the Worker, and a
// small cookie jar so a redirect's flash is seen by the next GET.

import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { serializeSigned } from "hono/utils/cookie";
import app from "../src/index";
import type { EventRow } from "../src/service/inventory";
import { createSession, upsertUser, type User } from "../src/service/users";
import { SESSION_COOKIE } from "../src/web/session";

export const ORIGIN = "https://fridgie.example.workers.dev";

let nextGithubId = 50_000 + Math.floor(Math.random() * 1_000_000);

export class Client {
  readonly cookies = new Map<string, string>();
  constructor(
    readonly testEnv: Cloudflare.Env = env,
    readonly origin: string = ORIGIN,
  ) {}

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookies.size > 0) headers.set("Cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    const ctx = createExecutionContext();
    const response = await app.fetch(new Request(`${this.origin}${path}`, { ...init, headers, redirect: "manual" }), this.testEnv, ctx);
    await waitOnExecutionContext(ctx);
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const eq = (pair ?? "").indexOf("=");
      const name = (pair ?? "").slice(0, eq);
      const value = (pair ?? "").slice(eq + 1);
      if (/max-age=0/i.test(line) || value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }

  get(path: string): Promise<Response> {
    return this.fetch(path);
  }

  post(path: string, fields: Record<string, string>): Promise<Response> {
    return this.fetch(path, { method: "POST", body: new URLSearchParams(fields), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  }

  async html(path: string): Promise<string> {
    return decode(await (await this.get(path)).text());
  }
}

/** A fresh user with a signed-in client. */
export async function signedIn(testEnv: Cloudflare.Env = env): Promise<{ user: User; client: Client }> {
  const user = await upsertUser(env.DB, nextGithubId++, "tester");
  const token = await createSession(env.DB, user.id);
  const cookie = await serializeSigned(SESSION_COOKIE, token, testEnv.COOKIE_SECRET);
  const client = new Client(testEnv);
  const [pair] = cookie.split(";");
  client.cookies.set(SESSION_COOKIE, (pair ?? "").slice(SESSION_COOKIE.length + 1));
  return { user, client };
}

export async function eventsOf(userId: string): Promise<EventRow[]> {
  return (await env.DB.prepare("SELECT * FROM events WHERE user_id = ?1 ORDER BY id").bind(userId).all<EventRow>()).results;
}

export async function itemRowsOf(userId: string): Promise<Record<string, unknown>[]> {
  return (await env.DB.prepare("SELECT * FROM items WHERE user_id = ?1 ORDER BY created_at, id").bind(userId).all()).results;
}

/** Pull the value of a named hidden or text input out of rendered HTML. */
export function inputValue(html: string, name: string, nth = 0): string | undefined {
  const matches = [...html.matchAll(new RegExp(`<input[^>]*name="${name}"[^>]*>`, "g"))];
  const tag = matches[nth]?.[0];
  return tag?.match(/value="([^"]*)"/)?.[1];
}

/** Undo HTML escaping so assertions can quote the spec's copy as written. */
export function decode(html: string): string {
  return html.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

export async function textOf(response: Response): Promise<string> {
  return decode(await response.text());
}
