// Low and out (ADR 0006 "The rule"). Computed when read, never stored. This
// module is pure: it takes what the two indexed queries return and the time,
// and says what state the item is in.

import type { LowReason, State } from "./terms";

/** An item is low by cycle once this fraction of its usual buying interval has passed. */
export const LOW_FRACTION = 0.8;
/** How many recent purchases the cycle and the default threshold read. */
export const PURCHASE_WINDOW = 4;
/** With no low_at, the threshold is floor(Q / DEFAULT_LOW_DIVISOR). */
export const DEFAULT_LOW_DIVISOR = 4;
/** Gaps between purchases shorter than this (in days) are discarded. */
export const MIN_GAP_DAYS = 1;

const DAY_MS = 86_400_000;

export interface PurchaseInput {
  quantity: number;
  occurredAt: Date;
}

export interface RuleInput {
  /** on_hand_after of the item's latest event in record order, or null when it has no events. */
  latestOnHand: number | null;
  /** The item's most recent purchases by occurred_at, newest first (at most PURCHASE_WINDOW are read). */
  purchases: readonly PurchaseInput[];
  lowAt: number | null;
  now: Date;
}

export interface Classification {
  state: State;
  reason: LowReason | null;
  /** The quantity on hand, or null when untracked. */
  q: number | null;
  /** The low threshold L. */
  threshold: number;
  /** Quantity of the newest purchase, Q, or null with no purchase. */
  lastQuantity: number | null;
  /** The purchase cycle C in days, or null when undefined. */
  cycleDays: number | null;
  /** Days since the newest purchase, a, or null with no purchase. */
  ageDays: number | null;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid] as number;
  return sorted.length % 2 === 1 ? hi : ((sorted[mid - 1] as number) + hi) / 2;
}

/** C: the median of the gaps (in days) between consecutive purchases, ignoring gaps under a day. */
export function purchaseCycle(purchases: readonly PurchaseInput[]): number | null {
  const window = [...purchases]
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, PURCHASE_WINDOW);
  const gaps: number[] = [];
  for (let i = 0; i + 1 < window.length; i++) {
    const gap = ((window[i] as PurchaseInput).occurredAt.getTime() - (window[i + 1] as PurchaseInput).occurredAt.getTime()) / DAY_MS;
    if (gap >= MIN_GAP_DAYS) gaps.push(gap);
  }
  return median(gaps);
}

export function classify(input: RuleInput): Classification {
  const window = [...input.purchases]
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, PURCHASE_WINDOW);
  const newest = window[0];
  const lastQuantity = newest?.quantity ?? null;
  const threshold = input.lowAt ?? (lastQuantity === null ? 0 : Math.floor(lastQuantity / DEFAULT_LOW_DIVISOR));
  const cycleDays = purchaseCycle(window);
  const ageDays = newest === undefined ? null : (input.now.getTime() - newest.occurredAt.getTime()) / DAY_MS;
  const base = { threshold, lastQuantity, cycleDays, ageDays };

  // No events at all: ADR 0006 computes ok, and Fridgie shows it as untracked.
  if (input.latestOnHand === null) return { ...base, state: "untracked", reason: null, q: null };

  const q = input.latestOnHand;
  if (q <= 0) return { ...base, state: "out", reason: null, q };
  if (q <= threshold) return { ...base, state: "low", reason: "count", q };
  if (cycleDays !== null && ageDays !== null && ageDays >= LOW_FRACTION * cycleDays) {
    return { ...base, state: "low", reason: "cycle", q };
  }
  return { ...base, state: "ok", reason: null, q };
}
