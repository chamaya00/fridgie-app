// The MCP server at /mcp (ADR 0001): Streamable HTTP, stateless, tools only.
// It sits behind the OAuth resource server in src/oauth.ts, which has already
// answered every request without a valid token for this resource with a 401.
// What reaches here carries the token's props (the users.id) and its scopes.

import type { OAuthResourceContext } from "@cloudflare/workers-oauth-provider";
import { insufficientScope } from "@cloudflare/workers-oauth-provider";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import type { Env } from "../env";
import type { ToolContext } from "./tools";
import { SCOPE_READ, SCOPE_WRITE, TOOLS, WRITE_TOOL_NAMES } from "./tools";

/** What completeAuthorization stores with a grant: the internal users.id (ADR 0002 (a)). */
export interface AuthProps {
  userId: string;
}

export const SERVER_INFO = { name: "fridgie", version: "1.0.0" };

interface Extra {
  db: D1Database;
  userId: string;
}

function buildServer(extra: Extra): McpServer {
  const server = new McpServer(SERVER_INFO, { capabilities: { tools: {} } });
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          readOnlyHint: tool.readOnly,
          destructiveHint: tool.destructive,
          // Every write takes a client_ref, so a repeat is harmless (spec section 10).
          ...(tool.readOnly ? {} : { idempotentHint: true }),
          openWorldHint: false,
        },
      },
      (args: unknown) => {
        const ctx: ToolContext = { db: extra.db, userId: extra.userId, now: new Date() };
        return tool.run(ctx, args as never);
      },
    );
  }
  return server;
}

// One handler for the isolate. It accepts the 2025-era initialize handshake
// (2025-06-18 and 2025-11-25) through its stateless fallback, and answers the
// 2026-07-28 revision as well, which ADR 0001 allows.
const handler = createMcpHandler((ctx) => {
  const extra = ctx.authInfo?.extra as Extra | undefined;
  if (!extra) throw new Error("/mcp was reached without a validated token.");
  return buildServer(extra);
});

interface JsonRpcLike {
  method?: unknown;
  params?: { name?: unknown };
}

/** The scope a JSON-RPC message needs: a tool's own (spec section 10), nothing more for anything else. */
function scopeNeeded(message: unknown): string | null {
  const m = message as JsonRpcLike | null;
  if (!m || m.method !== "tools/call" || typeof m.params?.name !== "string") return null;
  return WRITE_TOOL_NAMES.has(m.params.name) ? SCOPE_WRITE : SCOPE_READ;
}

export async function serveMcp(request: Request, env: Env, ctx: OAuthResourceContext<AuthProps>): Promise<Response> {
  let parsedBody: unknown;
  if (request.method === "POST" && /^application\/json\b/i.test(request.headers.get("Content-Type") ?? "")) {
    try {
      parsedBody = await request.clone().json();
    } catch {
      parsedBody = undefined;
    }
  }

  // ADR 0002 (c) 9: a call without the scope it needs gets 403 insufficient_scope,
  // before anything runs, so nothing is written.
  const messages = Array.isArray(parsedBody) ? parsedBody : [parsedBody];
  const needed = new Set(messages.map(scopeNeeded).filter((s) => s !== null));
  if ([...needed].some((s) => !ctx.auth.scope.includes(s))) {
    return insufficientScope(ctx.auth, needed.has(SCOPE_WRITE) ? [SCOPE_READ, SCOPE_WRITE] : [SCOPE_READ]);
  }

  const authInfo: AuthInfo = {
    token: ctx.auth.token,
    clientId: ctx.auth.clientId ?? "",
    scopes: ctx.auth.scope,
    ...(ctx.auth.expiresAt === undefined ? {} : { expiresAt: ctx.auth.expiresAt }),
    extra: { db: env.DB, userId: ctx.props.userId } satisfies Extra,
  };
  return handler.fetch(request, parsedBody === undefined ? { authInfo } : { authInfo, parsedBody });
}
