// When something happened (occurred_at), as both clients give it (design spec
// section 10, "Shared types").

const DAY_MS = 86_400_000;
/** occurred_at may be at most this far ahead of now. */
export const MAX_FUTURE_MS = DAY_MS;

export type ParsedWhen = { ok: true; at: Date } | { ok: false; error: "invalid" | "future" };

/**
 * Parse an ISO 8601 date or timestamp. A date with no time means noon UTC on
 * that date. More than 1 day after `now` is refused.
 */
export function parseOccurredAt(input: string, now: Date): ParsedWhen {
  const trimmed = input.trim();
  let at: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    at = new Date(`${trimmed}T12:00:00.000Z`);
    if (at.toISOString().slice(0, 10) !== trimmed) return { ok: false, error: "invalid" };
  } else if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    at = new Date(trimmed);
  } else {
    return { ok: false, error: "invalid" };
  }
  if (Number.isNaN(at.getTime())) return { ok: false, error: "invalid" };
  if (at.getTime() - now.getTime() > MAX_FUTURE_MS) return { ok: false, error: "future" };
  return { ok: true, at };
}

/** The UTC date of a moment, as the date input wants it: 2026-10-16. */
export function isoDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 2", as the history and the Bought lede show a date. */
export function shortDate(at: Date): string {
  return `${MONTHS[at.getUTCMonth()] as string} ${at.getUTCDate()}`;
}
