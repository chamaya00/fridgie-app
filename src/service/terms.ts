// The named terms (design spec section 5). Every label the web app shows and
// every word the assistant's tools return comes from here, so the two clients
// say the same thing. The words "stock", "product", "grocery" and "restock"
// appear in neither.

export const PLACES = ["fridge", "pantry"] as const;
export type Place = (typeof PLACES)[number];

export const STATES = ["untracked", "ok", "low", "out"] as const;
export type State = (typeof STATES)[number];

export const LOW_REASONS = ["count", "cycle"] as const;
export type LowReason = (typeof LOW_REASONS)[number];

export const EVENT_TYPES = ["purchase", "use", "count"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const USE_REASONS = ["used", "discarded"] as const;
export type UseReason = (typeof USE_REASONS)[number];

export const SOURCES = ["web", "mcp"] as const;
export type Source = (typeof SOURCES)[number];

/** The web app records every price in US dollars (spec section 7, Add item). */
export const WEB_CURRENCY = "USD";

export const TERMS = {
  appName: "Fridgie",
  placeName: { fridge: "Fridge", pantry: "Pantry" } satisfies Record<Place, string>,
  stateWord: { untracked: "Untracked", ok: "", low: "Low", out: "Out" } satisfies Record<State, string>,

  // Top bar and navigation
  assistants: "Assistants",
  addItemButton: "+ Add item",
  backToInventory: "‹ Inventory",
  signOut: "Sign out",

  // Row actions
  bought: "Bought",
  used: "Used",
  out: "Out",
  setQuantity: "Set quantity",
  change: "Change",

  // Quantity captions
  onRecord: "on record",
  notCounted: "not counted",
  noHistoryYet: "no history yet",

  // Sign-in
  signInWithGithub: "Sign in with GitHub",
  signedOutHeadline: "What's left in the fridge.",
  signedOutLede: "Your fridge and pantry, what's running low, and what you've spent on it.",
  signedOutFine: "Only invited GitHub accounts can sign in.",
  notInvitedHeadline: "You're not invited.",
  notInvitedNothingSaved: "Nothing was saved about you.",
  tryAnotherAccount: "Try another GitHub account",
  notInvitedFine: "If you think you should be on the list, ask whoever runs this Fridgie to add your GitHub account.",

  // Summary
  nothingLow: "Nothing's low.",
  nothingHereYet: "Nothing here yet.",
  emptyLede: "Add what's in your fridge and pantry, and Fridgie starts telling you what's low.",
  emptyFridgeTitle: "Your fridge is empty here.",
  emptyFridgeBody: "Start with what you buy every week, like milk and eggs, so Fridgie can learn how often you buy them.",
  emptyPantryTitle: "Your pantry is empty here.",
  emptyPantryBody: "Or tell your assistant: \"I bought rice, coffee and olive oil.\"",

  // Add item
  addItemTitle: "Add item",
  addItemLede: "Only the name is required. A quantity records it as bought today.",
  name: "Name",
  whereItLives: "Where it lives",
  quantity: "Quantity",
  unit: "Unit",
  pricePaid: "Price paid",
  optional: "(optional)",
  priceHint: "What you paid for all of them, in US dollars.",
  cancel: "Cancel",

  // Bought
  savePurchase: "Save purchase",
  firstTimeBuying: "First time buying this here.",
  when: "When",
  whenHint: "Change it to the receipt's date if you're catching up.",
  boughtFootnote: "Purchases can't be edited once saved. If a count is wrong afterwards, set the quantity on the item's page.",

  // Item page
  howManyTitle: "How many are there?",
  warnMeTitle: "Warn me when it's down to",
  save: "Save",
  threwAwayTitle: "Threw some away",
  threwAwayBody: "Counts as gone without being used, so your spending shows what was wasted.",
  record: "Record",
  historyTitle: "History",
  noHistory: "Nothing recorded yet.",

  // Rename or move
  renameOrMoveTitle: "Rename or move",
  saveChanges: "Save changes",

  // Remove
  keepIt: "Keep it",

  // Save failed
  saveFailedTitle: "That didn't save.",
  saveFailedBody: "Nothing was recorded. Your entries are still here, so try again. If the first try did get through, trying again won't count it twice.",
  tryAgain: "Try again",
} as const;

/** The verb a history line uses for each event, e.g. "Bought 1". */
export function historyVerb(type: EventType, reason: UseReason | null): string {
  if (type === "purchase") return "Bought";
  if (type === "count") return "Counted";
  return reason === "discarded" ? "Threw away" : "Used";
}
