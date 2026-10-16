// Users and web sessions (ADR 0002 "Web sign-in"). A user is one allowed
// GitHub account, keyed by GitHub's numeric ID and never by the login.

export const SESSION_DAYS = 30;
const DAY_MS = 86_400_000;

export interface User {
  id: string;
  github_id: number;
  github_login: string;
}

/** Parse ALLOWED_GITHUB_IDS: numeric IDs, comma-separated. Anything else is ignored. */
export function allowedGithubIds(raw: string | undefined): Set<number> {
  const ids = new Set<number>();
  for (const part of (raw ?? "").split(",")) {
    const trimmed = part.trim();
    if (/^\d+$/.test(trimmed)) ids.add(Number(trimmed));
  }
  return ids;
}

/** Find or create the user for an allowed GitHub account. Callers check the allow-list first. */
export async function upsertUser(db: D1Database, githubId: number, login: string, now = new Date()): Promise<User> {
  const user = await db
    .prepare(
      "INSERT INTO users (id, github_id, github_login, created_at) VALUES (?1, ?2, ?3, ?4) " +
        "ON CONFLICT (github_id) DO UPDATE SET github_login = excluded.github_login " +
        "RETURNING id, github_id, github_login",
    )
    .bind(crypto.randomUUID(), githubId, login, now.toISOString())
    .first<User>();
  if (!user) throw new Error("upsertUser returned no row");
  return user;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sessionId(token: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
}

/** Create a session and return the token for the cookie. Only its hash is stored. */
export async function createSession(db: D1Database, userId: string, now = new Date()): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await db
    .prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(await sessionId(token), userId, now.toISOString(), new Date(now.getTime() + SESSION_DAYS * DAY_MS).toISOString())
    .run();
  return token;
}

/** The user a session token belongs to, or null when it is unknown or expired. */
export async function userForSession(db: D1Database, token: string, now = new Date()): Promise<User | null> {
  return db
    .prepare(
      "SELECT users.id, users.github_id, users.github_login FROM sessions JOIN users ON users.id = sessions.user_id " +
        "WHERE sessions.id = ?1 AND sessions.expires_at > ?2",
    )
    .bind(await sessionId(token), now.toISOString())
    .first<User>();
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE id = ?1").bind(await sessionId(token)).run();
}
