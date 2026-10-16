// The one name-matching rule (design spec section 10, "Name matching"), used by
// the web form's Add item and rename, and by the assistant's tools.

/**
 * Lowercase, trim, collapse internal spaces, and drop one trailing "s" from
 * the last word ("Eggs" becomes "egg").
 */
export function normaliseName(name: string): string {
  const words = name.toLowerCase().trim().split(/\s+/).filter((w) => w.length > 0);
  const last = words.at(-1);
  if (last !== undefined && last.length > 1 && last.endsWith("s")) {
    words[words.length - 1] = last.slice(0, -1);
  }
  return words.join(" ");
}

/** Exact match: the normalised names are equal. */
export function isExactMatch(a: string, b: string): boolean {
  return normaliseName(a) === normaliseName(b);
}

/**
 * Close match: one normalised name contains the other as whole words
 * ("milk" and "oat milk"). An exact match is not a close match.
 */
export function isCloseMatch(a: string, b: string): boolean {
  const x = normaliseName(a);
  const y = normaliseName(b);
  if (x === y || x.length === 0 || y.length === 0) return false;
  return containsWords(x, y) || containsWords(y, x);
}

function containsWords(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `);
}

export type NameMatch<T> =
  | { status: "found"; item: T }
  | { status: "ambiguous"; candidates: T[] }
  | { status: "no_match"; close: T[] };

/** Match a name against items not removed. Close matches never act on their own. */
export function matchName<T extends { name: string }>(name: string, items: readonly T[]): NameMatch<T> {
  const exact = items.filter((item) => isExactMatch(name, item.name));
  const [only] = exact;
  if (exact.length === 1 && only !== undefined) return { status: "found", item: only };
  if (exact.length > 1) return { status: "ambiguous", candidates: exact };
  return { status: "no_match", close: items.filter((item) => isCloseMatch(name, item.name)) };
}
