// #8 criterion 2: access and scope at /mcp. Only the owner, or an assistant
// they authorised, and only with the scope a tool needs.

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { addItem, recordPurchase } from "../src/service/inventory";
import { TOOLS } from "../src/mcp/tools";
import { Client, eventsOf, itemRowsOf, ORIGIN, signedIn } from "./helpers";
import { call, connectAssistant, mcpClient, rawToolCall, tokenRequest } from "./oauth";

const METADATA = `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource"`;
const WRITE_TOOLS = TOOLS.filter((t) => !t.readOnly).map((t) => t.name);

/** Arguments that would write, for each write tool, against this item. */
function writeArgs(itemId: string, ref: string): Record<string, Record<string, unknown>> {
  return {
    add_item: { name: "Sneaky cheese", place: "fridge", quantity: 1, client_ref: `${ref}-add` },
    record_purchases: { lines: [{ item: { item_id: itemId }, quantity: 1 }], client_ref: `${ref}-buy` },
    record_use: { item: { item_id: itemId }, client_ref: `${ref}-use` },
    mark_out: { item: { item_id: itemId }, client_ref: `${ref}-out` },
    set_quantity: { item: { item_id: itemId }, quantity: 7, client_ref: `${ref}-set` },
    update_item: { item_id: itemId, name: "Renamed", low_at: 3, client_ref: `${ref}-upd` },
    remove_item: { item_id: itemId, client_ref: `${ref}-rem` },
  };
}

async function ownerWithItem(name: string) {
  const { user, client } = await signedIn();
  const { item } = await addItem(env.DB, user.id, { name, place: "fridge", unit: null, lowAt: null, purchase: null, clientRef: null, source: "web" });
  await recordPurchase(env.DB, user.id, item.id, { quantity: 2, priceCents: null, currency: null, occurredAt: new Date(), clientRef: null, source: "web" });
  return { user, client, item };
}

/** Everything stored for a user, to compare before and after. */
async function snapshot(userId: string): Promise<string> {
  return JSON.stringify({ items: await itemRowsOf(userId), events: await eventsOf(userId) });
}

function expectChallenge(response: Response): void {
  expect(response.status).toBe(401);
  const header = response.headers.get("WWW-Authenticate") ?? "";
  expect(header.startsWith("Bearer ")).toBe(true);
  expect(header).toContain(METADATA);
}

describe("/mcp without a token (#8 criterion 2)", () => {
  it("answers 401 with the resource metadata challenge, never a 200 or a redirect", async () => {
    const { item } = await ownerWithItem("Unseen butter");
    for (const init of [
      { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) },
      { method: "GET" },
    ]) {
      const response = await call("/mcp", init);
      expectChallenge(response);
      expect(response.headers.get("Location")).toBeNull();
      expect(await response.text()).not.toContain(item.id);
    }
    const tool = await rawToolCall(null, "list_inventory", {});
    expectChallenge(tool);
    expect(await tool.text()).not.toContain("Unseen butter");
  });
});

describe("/mcp with a token that is not good here (#8 criterion 2)", () => {
  it("refuses an invalid token with 401 and no item data", async () => {
    await ownerWithItem("Hidden ham");
    for (const token of ["not-a-token", "a:b:c", `${"x".repeat(40)}`]) {
      const response = await rawToolCall(token, "list_inventory", {});
      expectChallenge(response);
      expect(await response.text()).not.toContain("Hidden ham");
    }
  });

  it("refuses a token minted for another resource", async () => {
    // The same Worker at another origin is another issuer with another resource,
    // sharing one KV: its token's audience is http://localhost:8787/mcp.
    const { client: owner, item } = await ownerWithItem("Foreign figs");
    const elsewhere = new Client(env, "http://localhost:8787");
    for (const [k, v] of owner.cookies) elsewhere.cookies.set(k, v);
    const { access_token } = await connectAssistant(elsewhere, "mcp:read mcp:write offline_access", "http://localhost:8787");

    // The control: it is a real token, good at its own resource.
    const home = await call("http://localhost:8787/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${access_token}`, "MCP-Protocol-Version": "2025-11-25" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_inventory", arguments: {} } }),
    });
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("Foreign figs");

    const here = await rawToolCall(access_token, "list_inventory", {});
    expectChallenge(here);
    expect(await here.text()).not.toContain(item.id);
  });

  it("refuses a disconnected grant: its token gets 401 and its refresh token invalid_grant", async () => {
    const { client: browser } = await ownerWithItem("Gone gouda");
    const tokens = await connectAssistant(browser);
    expect((await rawToolCall(tokens.access_token, "list_inventory", {})).status).toBe(200);

    const page = await browser.html("/assistants");
    const action = page.match(/action="(\/assistants\/[^"]+\/disconnect)"/)?.[1];
    expect(action).toBeDefined();
    const disconnect = await browser.post(action ?? "", {});
    expect(disconnect.status).toBe(303);

    const after = await rawToolCall(tokens.access_token, "list_inventory", {});
    expectChallenge(after);
    expect(await after.text()).not.toContain("Gone gouda");

    const refresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token ?? "", client_id: tokens.clientId });
    expect(refresh.status).toBe(400);
    expect(((await refresh.json()) as { error: string }).error).toBe("invalid_grant");
  });
});

describe("scopes (#8 criterion 2)", () => {
  it("gives a read-only token 403 insufficient_scope on every write tool, and writes nothing", async () => {
    const { user, client: browser, item } = await ownerWithItem("Read-only rice");
    const { access_token, scope } = await connectAssistant(browser, "mcp:read offline_access");
    expect(scope?.split(" ")).not.toContain("mcp:write");
    const before = await snapshot(user.id);

    const args = writeArgs(item.id, "readonly-ref");
    expect(Object.keys(args).sort()).toEqual([...WRITE_TOOLS].sort());
    for (const name of WRITE_TOOLS) {
      const response = await rawToolCall(access_token, name, args[name] ?? {});
      expect(response.status, name).toBe(403);
      const header = response.headers.get("WWW-Authenticate") ?? "";
      expect(header, name).toContain('error="insufficient_scope"');
      expect(header, name).toContain("mcp:write");
    }
    expect(await snapshot(user.id)).toBe(before);

    // The control: the same token reads.
    const read = await rawToolCall(access_token, "list_inventory", {});
    expect(read.status).toBe(200);
    expect(await read.text()).toContain("Read-only rice");
  });
});

describe("one user's token and another user's items (#8 criterion 2)", () => {
  it("returns and changes nothing of B's, whatever A's token is handed", async () => {
    const a = await ownerWithItem("Apple juice");
    const b = await ownerWithItem("Bob's secret pickles");
    const { access_token } = await connectAssistant(a.client);
    const mcp = await mcpClient(access_token);
    const before = await snapshot(b.user.id);

    for (const [name, args] of Object.entries(writeArgs(b.item.id, "cross-user-ref"))) {
      const result = await mcp.callTool({ name, arguments: args });
      expect(JSON.stringify(result), name).not.toContain("secret pickles");
    }
    for (const [name, args] of [
      ["list_inventory", {}],
      ["list_low_and_out", {}],
      // find_items echoes the names it is asked for, so none of these is B's whole name.
      ["find_items", { names: ["pickles", "Bob's", "secret pickle jar"] }],
    ] as const) {
      const result = await mcp.callTool({ name, arguments: args });
      expect(JSON.stringify(result), name).not.toContain("Bob's secret pickles");
      expect(JSON.stringify(result), name).not.toContain(b.item.id);
    }
    await mcp.close();
    expect(await snapshot(b.user.id)).toBe(before);
  });
});
