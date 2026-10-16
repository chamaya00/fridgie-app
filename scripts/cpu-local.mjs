// A local CPU figure per request for #7's heaviest routes: the GitHub sign-in
// callback, the inventory page, and recording a use (ADR 0003 "CPU check").
//
//   node scripts/cpu-local.mjs
//
// How: bundle the Worker with the esbuild wrangler already installs, run it in
// Node 24 against an in-memory D1 stand-in built on node:sqlite, and read
// process.cpuUsage() around each request. GitHub is answered in-process.
//
// Read the result as an upper bound, labelled local. In production D1 is a
// separate service and its query time is I/O, which does not count towards
// the 10 ms; here SQLite runs inside the measured process, so it does. Node's
// V8 stands in for workerd's. The deployed figure comes from the dashboard's
// CPU-time metric or `wrangler tail` after the first deploy.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const repo = new URL("..", import.meta.url).pathname;
const work = mkdtempSync(join(repo, ".wrangler-cpu-"));
const ITERATIONS = Number(process.env.CPU_ITERATIONS ?? 300);
const WARMUP = 50;

try {
  execFileSync(join(repo, "node_modules/.bin/esbuild"), [join(repo, "src/index.ts"), "--bundle", "--format=esm", "--platform=neutral", "--main-fields=module,main", `--outfile=${join(work, "worker.mjs")}`, "--log-level=warning"]);
  const { default: app } = await import(pathToFileURL(join(work, "worker.mjs")).href);

  // ---- a D1 stand-in on node:sqlite ----
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(join(repo, "migrations")).sort()) sqlite.exec(readFileSync(join(repo, "migrations", file), "utf8"));
  const returnsRows = (sql) => /^\s*(SELECT|EXPLAIN|WITH)/i.test(sql) || /\bRETURNING\b/i.test(sql);
  const exec = (sql, params) => {
    const stmt = sqlite.prepare(sql);
    if (returnsRows(sql)) return { results: stmt.all(...params), meta: { changes: 0, rows_read: 0 }, success: true };
    const r = stmt.run(...params);
    return { results: [], meta: { changes: Number(r.changes), rows_read: 0 }, success: true };
  };
  const statement = (sql, params = []) => ({
    sql,
    params,
    bind: (...p) => statement(sql, p),
    all: async () => exec(sql, params),
    run: async () => exec(sql, params),
    first: async () => exec(sql, params).results[0] ?? null,
  });
  const DB = {
    prepare: (sql) => statement(sql),
    batch: async (stmts) => {
      sqlite.exec("BEGIN");
      try {
        const out = stmts.map((s) => exec(s.sql, s.params));
        sqlite.exec("COMMIT");
        return out;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  const env = { DB, OAUTH_KV: {}, GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "secret", COOKIE_SECRET: "cpu-local-cookie-secret-cpu-local", ALLOWED_GITHUB_IDS: "1001", DEV_SESSION_SEEDING: "1" };
  const ctx = { waitUntil() {}, passThroughOnException() {} };

  globalThis.fetch = async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/login/oauth/access_token")) return Response.json({ access_token: "gho_local" });
    if (url.includes("api.github.com/user")) return Response.json({ id: 1001, login: "owner" });
    return new Response("unexpected", { status: 500 });
  };

  const jar = new Map();
  const call = async (path, init = {}, origin = "http://localhost:8787") => {
    const headers = new Headers(init.headers);
    if (jar.size) headers.set("Cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    const res = await app.fetch(new Request(origin + path, { ...init, headers, redirect: "manual" }), env, ctx);
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const i = pair.indexOf("=");
      if (/max-age=0/i.test(line)) jar.delete(pair.slice(0, i));
      else jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    await res.arrayBuffer();
    return res;
  };
  const cpuMs = async (fn) => {
    const before = process.cpuUsage();
    const res = await fn();
    const used = process.cpuUsage(before);
    return { ms: (used.user + used.system) / 1000, status: res.status };
  };
  const summary = (label, samples) => {
    const sorted = samples.map((s) => s.ms).sort((a, b) => a - b);
    const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(2);
    const statuses = [...new Set(samples.map((s) => s.status))].join(",");
    console.log(`${label.padEnd(34)} median ${pick(0.5)} ms   p95 ${pick(0.95)} ms   max ${sorted.at(-1).toFixed(2)} ms   (n=${sorted.length}, status ${statuses})`);
  };

  // Sign-in callback: start the flow for its state cookie, then measure the callback alone.
  const callback = [];
  for (let i = 0; i < ITERATIONS + WARMUP; i++) {
    jar.clear();
    const start = await call("/auth/github");
    const state = new URL(start.headers.get("Location")).searchParams.get("state");
    const sample = await cpuMs(() => call(`/auth/github/callback?code=c&state=${state}`));
    if (i >= WARMUP) callback.push(sample);
  }

  // Inventory and Used, signed in as the seed user with the spec's six items.
  jar.clear();
  await call("/dev/session?next=/");
  const inventory = [];
  const used = [];
  for (let i = 0; i < ITERATIONS + WARMUP; i++) {
    const page = await cpuMs(() => call("/"));
    const use = await cpuMs(() => call("/items/itm_seed_yogurt/used", { method: "POST", body: new URLSearchParams({ client_ref: crypto.randomUUID() }) }));
    if (i % 20 === 0) await call("/items/itm_seed_yogurt/quantity", { method: "POST", body: new URLSearchParams({ quantity: "50", set: "1", client_ref: crypto.randomUUID() }) });
    if (i >= WARMUP) {
      inventory.push(page);
      used.push(use);
    }
  }

  // A bigger inventory: 60 items with 20 events each.
  for (let n = 0; n < 60; n++) {
    const res = await call("/items", { method: "POST", body: new URLSearchParams({ name: `item ${n}`, place: n % 2 ? "fridge" : "pantry", quantity: "4", unit: "", price: "1.00", client_ref: crypto.randomUUID() }) });
    const id = res.headers.get("Location").split("#item-")[1];
    for (let e = 0; e < 19; e++) await call(`/items/${id}/${e % 2 ? "used" : "bought"}`, { method: "POST", body: new URLSearchParams({ quantity: "1", price: "", when: "", client_ref: crypto.randomUUID() }) });
  }
  await call("/");
  const big = [];
  for (let i = 0; i < 100 + 10; i++) {
    const s = await cpuMs(() => call("/"));
    if (i >= 10) big.push(s);
  }

  console.log(`Local CPU per request (Node ${process.version}, SQLite in-process, so an upper bound):`);
  summary("GET /auth/github/callback", callback);
  summary("GET / (6 items)", inventory);
  summary("POST /items/:id/used", used);
  summary("GET / (66 items, ~20 events each)", big);
} finally {
  rmSync(work, { recursive: true, force: true });
}
