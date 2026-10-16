# ADR 0005: Item entry: manual with "bought again", and the assistant; barcode and in-app receipts deferred

Date: 2026-10-16
Status: proposed

Research: [docs/research/5-item-entry-and-low-rule.md](../research/5-item-entry-and-low-rule.md), section 1.

## Context

The owner left the choice of item entry to research (#1, #3). The research had to compare at least manual, barcode and receipt entry. The constraints that decide it:

- **$0, free tiers only** (#3 O3).
- **Phone first.** The web app runs in iOS Safari, and the assistant runs in the Claude iOS app (ADR 0001).
- **10 ms of Worker CPU per request** (ADR 0004). Image work cannot run in the Worker.
- **New outbound hosts stop for the owner.** Only GitHub's and Cloudflare's are approved (#3 D1).
- **New dependencies stop and ask.** Anything outside ADR 0003's table does.

Every method ends in the same write, a purchase or use event through the one service layer (ADR 0006). So this decision is about which front doors the first build has, not about data shape.

## Decision

The first build includes **two** entry methods:

1. **Manual entry in the web app, with "bought again".** Each item's row has **Bought**, **Used** and **Out**. **Bought** opens a form prefilled with the quantity and price of that item's last purchase, so a repeat purchase is two taps. **Add item** takes a name, quantity, optional unit and optional price. Plain HTML forms, handled in the Worker.
2. **Entry through the assistant over MCP.** The owner tells Claude what they bought or used ("bought milk and a dozen eggs for $4.29"), and Claude records it with Fridgie's tools. That includes **receipts**: the owner photographs a receipt in the Claude app, and Claude reads it, matches lines to existing items, asks about the ones it cannot match, and records the purchases with prices. To make that practical, the MCP tool design in #6 includes **a tool that records several purchases in one call** (each with item, quantity and optional price), and a way to look items up by name.

**Deferred**, each with its reason:

| Method | Deferred because | What brings it back |
| - | - | - |
| **Barcode scanning in the web app** (`barcode-detector` + `zxing-wasm` in the browser, optional Open Food Facts lookup) | iOS Safari has no usable native `BarcodeDetector` (it sits behind a feature flag), so it needs two new dependencies and about 1 MB of WebAssembly. The lookup is a new outbound host, `world.openfoodfacts.org`, at 15 product reads per minute per IP, and its US coverage is unknown. Fridge contents skew to produce and store-packed items without a useful barcode. | The owner says they would rather scan than tap and accepts the dependencies. The `.wasm` is then self-hosted in the Worker's static assets (not `fastly.jsdelivr.net`), decoding runs in the browser, and the lookup is optional: the owner names a barcode once and Fridgie remembers it. |
| **Receipt reading inside the web app via Workers AI** (a vision model behind the Worker's `AI` binding) | The assistant already reads receipts at no cost to Fridgie, and it understands the owner's item names. Workers AI adds no outbound host, but it is a new Cloudflare service (a category change) with a 10,000-neuron daily cap and a model licence. | The owner will not use the Claude app for receipts. |
| **Forwarded e-receipts** (Cloudflare Email Routing to an Email Worker) | It needs a domain on Cloudflare. Fridgie is on `workers.dev`, and a domain is not $0. | The owner already has, or buys, a domain. |

**Rejected:** receipt OCR with Tesseract.js in the browser. It returns unstructured text, and on receipt photos it misreads money values while reporting high confidence.

## Consequences

- **Easy:** nothing in the first build needs a new outbound host, a new dependency, a new service, or any image work in the Worker. The "bought again" prefill comes from the item's last purchase event, so it costs no extra storage.
- **Requirement on #6:** the MCP tools must include a batch purchase tool and an item lookup by name. Without them, a receipt costs one round trip per line.
- **The owner needs the Claude app for receipts and voice.** In Safari alone, entry is manual. This is the most likely reason for the owner to push back, and it is the reason barcode is deferred rather than rejected.
- **Nothing is ruled out.** Every deferred method writes the same events, so adding one later is a build issue with no data migration. Adding barcode later does add one nullable field to items (the barcode). That belongs to that later ADR.
- **What this decision rests on, by evidence type** (the research document marks each):
  - **[read]**: iOS Safari's `BarcodeDetector` is behind a flag (MDN browser-compat-data 8.1.6). Open Food Facts allows 15 product reads per minute per IP. The polyfill fetches its `.wasm` from jsDelivr by default. Workers AI Free is 10,000 neurons a day. Static assets are free.
  - **[excerpt]** (search snippets, pages not opened): the evidence that phone barcode scanning disappoints in practice comes from the Galaxus review of Grocy. The same goes for Tesseract's weakness on receipts, and for Email Routing being free but tied to a domain. A reviewer who doubts the deferrals should open those pages first.
  - **[inference]**: receipt-to-item matching, not OCR, is the hard part. The assistant does that matching better than an in-app OCR step would.
  - **[assumption]**: the owner can attach a photo in the Claude iOS app (the official help article lists image formats but does not mention the iOS camera). A noticeable share of the owner's US groceries is missing from Open Food Facts. Neither was verified.

## Alternatives rejected

- **Barcode in the first build:** loses on cost to the build. Two unapproved dependencies, 1 MB of WebAssembly in a server-rendered app, and an optional new host, for a method prior art suggests underperforms on phones. Deferred, not dropped.
- **Native `BarcodeDetector` only:** not available in iOS Safari without the user enabling a feature flag.
- **Tesseract.js receipt OCR:** quality on receipt photos, and it still leaves line parsing and item matching unsolved.
- **Workers AI receipt reading in the first build:** a weaker duplicate of what the assistant does on the owner's own plan. It also spends a shared daily quota. Deferred.
- **Forwarded e-receipts:** not $0 without a domain.
- **Paid OCR or barcode APIs on free trials (Veryfi, Mindee, Taggun, UPCitemdb, Google Cloud Vision):** each is a new host and a sign-up, and none beats the assistant on cost or on matching.
- **Hardware (scanner, scale, fridge camera, NFC) and grocery-account imports:** hardware is not $0. **[assumption]** There is no consumer API for grocery-account imports, and scraping one would mean holding the owner's store credentials.
