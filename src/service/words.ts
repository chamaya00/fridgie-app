// The words for a state: each item's reason_text (design spec section 7,
// "Reason text, exact templates") and the Summary sentence (section 6,
// "Sentence rules"). The web page and the assistant's list_low_and_out return
// these same strings.

import type { LowReason, State } from "./terms";
import { TERMS } from "./terms";

/** Up to 2 decimals, trailing zeros dropped: 2, 0.5, 1.25. */
export function formatQuantity(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export interface ReasonInput {
  reason: LowReason | null;
  q: number | null;
  lastQuantity: number | null;
  lowAt: number | null;
  cycleDays: number | null;
}

export function reasonText(input: ReasonInput): string | null {
  if (input.reason === "count" && input.q !== null) {
    if (input.lowAt !== null) return `down to ${formatQuantity(input.q)}, you warn at ${formatQuantity(input.lowAt)}`;
    if (input.lastQuantity !== null) return `down to ${formatQuantity(input.q)}, you buy ${formatQuantity(input.lastQuantity)}`;
  }
  if (input.reason === "cycle" && input.cycleDays !== null) {
    return `due, usually every ${Math.round(input.cycleDays)} days`;
  }
  return null;
}

export interface SummaryItem {
  name: string;
  state: State;
}

export interface SummaryParts {
  /** The whole sentence, as one string (list_low_and_out.summary). */
  text: string;
  /** The low clause, or null. The web page colours it with the low colour. */
  low: string | null;
  /** The out clause, or null. The web page colours it with the out colour. */
  out: string | null;
}

/**
 * The Summary sentence. `items` must be in inventory order (fridge, then
 * pantry, each in row order); each clause keeps that order.
 */
export function summarise(items: readonly SummaryItem[]): SummaryParts {
  if (items.length === 0) return { text: TERMS.nothingHereYet, low: null, out: null };
  const low = clause(items.filter((i) => i.state === "low").map((i) => i.name), "low");
  const out = clause(items.filter((i) => i.state === "out").map((i) => i.name), "out");
  if (low === null && out === null) return { text: TERMS.nothingLow, low: null, out: null };
  return { text: [low, out].filter((c) => c !== null).join(" "), low, out };
}

function clause(names: readonly string[], word: "low" | "out"): string | null {
  if (names.length === 0) return null;
  const shown = names.map((name, i) => (i === 0 ? capitalise(name) : lowerFirst(name)));
  let subject: string;
  let plural: boolean;
  if (shown.length === 1) {
    subject = shown[0] as string;
    plural = looksPlural(subject);
  } else if (shown.length <= 3) {
    subject = `${shown.slice(0, -1).join(", ")} and ${shown.at(-1) as string}`;
    plural = true;
  } else {
    subject = `${shown[0] as string}, ${shown[1] as string} and ${shown.length - 2} more`;
    plural = true;
  }
  return `${subject} ${plural ? "are" : "is"} ${word}.`;
}

/**
 * "Eggs are low", "Rice is low". The spec's template for one name is "X is
 * low.", and its mock writes "Coffee beans are out." and "Eggs are low.": a
 * name whose last word ends in "s" reads as plural, the same test the
 * name-matching rule uses to drop a trailing "s".
 */
function looksPlural(name: string): boolean {
  const last = name.trim().split(/\s+/).at(-1) ?? "";
  return last.length > 1 && /s$/i.test(last) && !/ss$/i.test(last);
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
