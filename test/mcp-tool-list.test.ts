// #8 criterion 1: the tool list, through the MCP SDK's own client, against the
// design spec's section 10 as written. The spec file itself is read here, so
// an edit to its table or its descriptions that the tools do not follow fails.

import { describe, expect, it } from "vitest";
import spec from "../docs/design/6-inventory-and-tools.md?raw";
import { signedIn } from "./helpers";
import { connectAssistant, mcpClient } from "./oauth";

interface SpecTool {
  name: string;
  inputs: string;
  readOnly: boolean;
  destructive: boolean;
  scope: string;
}

function section(start: string, end: string): string {
  const from = spec.indexOf(start);
  const to = spec.indexOf(end, from);
  expect(from, start).toBeGreaterThan(-1);
  expect(to, end).toBeGreaterThan(from);
  return spec.slice(from, to);
}

function specTools(): SpecTool[] {
  return section("### The tool table", "Notes on the hints")
    .split("\n")
    .filter((line) => line.startsWith("| `"))
    .map((line) => {
      const cells = line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim().replace(/\\\|/g, "|"));
      return {
        name: (cells[0] ?? "").replace(/`/g, ""),
        inputs: cells[1] ?? "",
        readOnly: (cells[3] ?? "").includes("true"),
        destructive: (cells[4] ?? "").includes("true"),
        scope: (cells[5] ?? "").replace(/`/g, ""),
      };
    });
}

function specDescriptions(): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of section("### Descriptions", "### The three phrases").split("\n")) {
    const m = line.match(/^- \*\*`([a-z_]+)`\*\*: "(.*)"$/);
    if (m) map.set(m[1] as string, m[2] as string);
  }
  return map;
}

interface SpecField {
  name: string;
  optional: boolean;
  type: string;
}

/** The top-level fields of a tool's inputs cell: each backtick segment opens with `name:` or `name?:`. */
function topLevelFields(inputs: string): SpecField[] {
  return [...inputs.matchAll(/`([a-z_]+)(\??): ([^`]*)`/g)].map((m) => ({ name: m[1] as string, optional: m[2] === "?", type: (m[3] as string).trim() }));
}

/** The fields inside `[{ ... }]` (record_purchases' lines). */
function nestedFields(type: string): SpecField[] {
  const inner = type.match(/\[\{(.*)\}\]/)?.[1] ?? "";
  return [...inner.matchAll(/([a-z_]+)(\??): ([^,]*)/g)].map((m) => ({ name: m[1] as string, optional: m[2] === "?", type: (m[3] as string).trim() }));
}

type JsonSchema = {
  type?: string | string[];
  anyOf?: JsonSchema[];
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  minimum?: number;
  exclusiveMinimum?: number;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  additionalProperties?: unknown;
};

function typesOf(schema: JsonSchema): string[] {
  if (schema.anyOf) return schema.anyOf.flatMap(typesOf);
  if (Array.isArray(schema.type)) return schema.type;
  return schema.type ? [schema.type] : [];
}

/** Check one field's JSON Schema against the spec's type text for it. */
function expectType(where: string, schema: JsonSchema | undefined, field: SpecField): void {
  expect(schema, where).toBeDefined();
  const s = schema as JsonSchema;
  const t = field.type;
  if (t.startsWith("ItemRef")) {
    // ItemRef = { item_id: string } | { name: string }, exactly one of the two.
    const shapes = (s.anyOf ?? []).map((a) => Object.keys(a.properties ?? {}).sort().join(","));
    expect(shapes.sort(), where).toEqual(["item_id", "name"]);
    for (const a of s.anyOf ?? []) expect(a.additionalProperties, where).toBe(false);
    return;
  }
  if (t.startsWith('"')) {
    const values = [...t.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const enumValues = s.enum ?? s.anyOf?.flatMap((a) => a.enum ?? []);
    expect(enumValues, where).toEqual(values);
    return;
  }
  if (t.startsWith("[{")) {
    expect(typesOf(s), where).toContain("array");
    return;
  }
  if (t.startsWith("string[]")) {
    expect(typesOf(s), where).toEqual(["array"]);
    expect(typesOf(s.items ?? {}), where).toEqual(["string"]);
    return;
  }
  const base = t.split(/\s/)[0] as string;
  const expected = t.includes("| null") ? [base, "null"].sort() : [base];
  expect(typesOf(s).sort(), where).toEqual(expected);
  const numeric = s.anyOf?.find((a) => a.type === "number") ?? s;
  if (t.includes("> 0")) expect(numeric.exclusiveMinimum, where).toBe(0);
  if (t.includes("≥ 0")) expect(numeric.minimum, where).toBe(0);
}

describe("the tool list (#8 criterion 1)", () => {
  for (const version of ["2025-06-18", "2025-11-25"]) {
    it(`initializes with protocol version ${version}`, async () => {
      const { client: browser } = await signedIn();
      const { access_token } = await connectAssistant(browser);
      const mcp = await mcpClient(access_token, version);
      expect(mcp.getNegotiatedProtocolVersion()).toBe(version);
      expect(mcp.getServerCapabilities()?.tools).toBeDefined();
      await mcp.close();
    });
  }

  it("lists exactly the spec's ten tools: names, input schemas, descriptions and hints", async () => {
    const { client: browser } = await signedIn();
    const { access_token } = await connectAssistant(browser);
    const mcp = await mcpClient(access_token, "2025-06-18");
    const { tools } = await mcp.listTools();
    await mcp.close();

    const table = specTools();
    const descriptions = specDescriptions();
    expect(table).toHaveLength(10);
    expect(descriptions.size).toBe(10);
    expect(tools.map((t) => t.name).sort()).toEqual(table.map((t) => t.name).sort());

    for (const row of table) {
      const tool = tools.find((t) => t.name === row.name);
      expect(tool, row.name).toBeDefined();
      if (!tool) continue;
      expect(tool.description, row.name).toBe(descriptions.get(row.name));

      expect(tool.annotations?.readOnlyHint, row.name).toBe(row.readOnly);
      expect(tool.annotations?.destructiveHint, row.name).toBe(row.destructive);
      expect(tool.annotations?.openWorldHint, row.name).toBe(false);
      if (!row.readOnly) expect(tool.annotations?.idempotentHint, row.name).toBe(true);
      expect(row.scope, row.name).toBe(row.readOnly ? "mcp:read" : "mcp:write");

      const schema = tool.inputSchema as JsonSchema;
      const fields = topLevelFields(row.inputs);
      expect(Object.keys(schema.properties ?? {}).sort(), row.name).toEqual(fields.map((f) => f.name).sort());
      expect([...(schema.required ?? [])].sort(), row.name).toEqual(fields.filter((f) => !f.optional).map((f) => f.name).sort());
      for (const field of fields) expectType(`${row.name}.${field.name}`, schema.properties?.[field.name], field);

      // Lists given as (1–50) in the table.
      for (const listName of ["names", "lines"]) {
        const list = schema.properties?.[listName];
        if (list) {
          expect(list.minItems, `${row.name}.${listName}`).toBe(1);
          expect(list.maxItems, `${row.name}.${listName}`).toBe(50);
        }
      }
      // Spec "Idempotency": client_ref is required on every write, 8 to 64 characters.
      if (!row.readOnly) {
        expect(schema.required, row.name).toContain("client_ref");
        expect(schema.properties?.client_ref?.minLength, row.name).toBe(8);
        expect(schema.properties?.client_ref?.maxLength, row.name).toBe(64);
      }
      // record_purchases' lines, field by field.
      const lines = fields.find((f) => f.name === "lines");
      if (lines) {
        const itemSchema = schema.properties?.lines?.items ?? {};
        const nested = nestedFields(lines.type);
        expect(nested.map((f) => f.name)).toEqual(["item", "quantity", "price", "currency", "occurred_at"]);
        expect(Object.keys(itemSchema.properties ?? {}).sort()).toEqual(nested.map((f) => f.name).sort());
        expect([...(itemSchema.required ?? [])].sort()).toEqual(nested.filter((f) => !f.optional).map((f) => f.name).sort());
        for (const field of nested) expectType(`lines.${field.name}`, itemSchema.properties?.[field.name], field);
      }
    }
  });
});
