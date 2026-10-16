# Research #5: how items get entered, and how Fridgie decides an item is low or out

Issue: #5 (parent #1). Sources checked **2026-10-16**.

## The decision

Which ways of getting items into Fridgie the first build includes (and which wait), and the rule, computed from stored events, that calls an item **low** or **out**.

**Recommendation in one line:** the first build ships **manual entry in the web app, with one-tap "bought again" for known items**, and **entry through the assistant over MCP**. The assistant route also covers receipts: the owner photographs a receipt in the Claude app, and Claude records the lines. In-app barcode scanning and in-app receipt OCR are deferred. "Out" comes from the count. "Low" fires on **either** a low count **or** an overdue purchase cycle, so it keeps working when nobody logs what they use. The records are [ADR 0005](../decisions/0005-item-entry-methods.md) (entry) and [ADR 0006](../decisions/0006-low-and-out-rule-and-events.md) (the rule and its events).

## How to read the evidence marks

This run's network policy refused `developer.mozilla.org`, `caniuse.com`, `developers.cloudflare.com`, `world.openfoodfacts.org`, `openfoodfacts.github.io`, `cdn.jsdelivr.net` and `intelligence.smaily.com` (the proxy rejected the connection). Two ways around that were used, and the marks say which:

- Cloudflare's docs and the Open Food Facts API docs are published from GitHub repositories. Those **source files** were opened on `raw.githubusercontent.com`. The link given is the published page, and a reviewer should find the same words there.
- Browser support comes from **MDN's browser-compat-data**, version 8.1.6 (2026-10-15), downloaded from npm. That is the data MDN's and caniuse's compatibility tables are drawn from.

Marks:

- **[read]**: opened in this run (the page, or its source file as above). The line can be quoted.
- **[read in #4]**: opened by the #4 research run on the same day, and not re-opened here.
- **[excerpt]**: from a search engine's quoted excerpt. The page itself was not opened. If the words are not on the linked page, the claim falls.
- **[inference]**: reasoned from verified material. What it was reasoned from is named.
- **[assumption]**: neither, and something rests on it. Named so it can be checked.

## What the issue fixed, and what it guessed

- **Constraints (checked, they hold):** $0 (#3 O3). One TypeScript Worker on Workers Free with **10 ms CPU per request**, server-rendered HTML, D1 (ADRs 0003, 0004). Approved outbound hosts are GitHub's and Cloudflare's, and any other host stops for the owner (#3 D1). ADR 0003 also says any dependency outside its table "stops and asks", which the issue does not restate but which matters here: every in-browser scanner or OCR library is a new dependency. D1 free limits: 5,000,000 rows read and 100,000 rows written per day, reset 00:00 UTC [read] ([D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)). Keep usage and purchase history, with prices.
- **Guesses:** the issue frames entry as a choice among *in-app* methods (manual, barcode, receipt). Fridgie already has a second client, the assistant (ADR 0001), and it can do two of the three jobs without any new host or library. That changes the comparison more than any library does. The issue also implies one method wins. The evidence points to two cheap methods now and the expensive ones later, once there is history to show which item names the owner actually buys.

---

## 1. Item entry

### What every option shares

[inference, from the issue and ADR 0003] Whatever the method, it ends in the same write: a **purchase** event (item, quantity, optional price) or a **use** event, through the one service layer. The entry methods differ only in how the owner gets to that write. So none of them is a different data shape, and deferring one costs nothing later except the build.

A receipt line or a barcode still has to be **matched to an item** the owner already tracks ("GV 2% MLK GAL" is the owner's "milk"). [inference] That matching is the hard part of both barcode and receipt entry, not reading the pixels. A barcode lookup returns a product name, not the owner's name for it, and a receipt prints abbreviations.

### Option A: manual entry in the web app, with "bought again"

**What the owner does, on the phone:**

1. Open Fridgie in Safari. The home page lists their items.
2. Known item: tap **Bought** on its row. A small form opens with quantity prefilled from the last purchase, and a price field prefilled from the last price. Tap **Save**. That is two taps when nothing changed.
3. New item: tap **Add item**, type a name (iOS keyboard dictation works in any text field), and enter a quantity and, optionally, a unit and price. Save.
4. Using something: tap **Used** on the row (one unit by default), or **Out** when it is gone.

The prefill is the "option nobody asked for" folded into manual entry: a repeat purchase is most of what a household records, and the data to prefill it is in the item's last purchase event.

| Question | Answer | Mark |
| - | - | - |
| Cost at $0 | No service. Each save is one Worker request and a few D1 rows written (ADR 0006 counts them). Workers Free allows 100,000 requests a day. | [read] [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) |
| iOS Safari today | Plain HTML forms. No API beyond `<input>` and `<form>`. File and text inputs have been in iOS Safari since version 1. | [read] browser-compat-data `html.elements.input.type_file` ([data](https://github.com/mdn/browser-compat-data/blob/main/html/elements/input/file.json)) |
| Where the work runs | The Worker, well inside 10 ms: parse a form, one or two prepared statements. The 10 ms excludes waiting on D1. | [read] "Waiting on network requests (such as `fetch()` calls, KV reads, or database queries) does **not** count toward CPU time." [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Outbound hosts | None beyond Cloudflare. | [inference] |
| What it rules out later | Nothing. Every other method lands on the same events. | [inference] |

### Option B: the assistant over MCP, typed or spoken (nobody asked for this one)

**What the owner does:** in the Claude app on the phone, with the Fridgie connector added, they say or type "I bought milk, a dozen eggs for $4.29 and two yogurts". Claude calls Fridgie's MCP tools and records three purchases, asking which existing item "yogurt" means if it is ambiguous. "We're out of butter" records an out.

| Question | Answer | Mark |
| - | - | - |
| Cost at $0 | Nothing on Fridgie's side beyond one request per tool call. The model runs under the owner's own Claude plan. Free-plan users "are limited to one custom connector", which Fridgie would be. | [read in #4] [Get started with custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) |
| iOS today | Not Safari: the Claude iOS app. A connector added on the web "will be available to use the next time you log in to your account on Claude for iOS or Android". Adding one *on* mobile is in beta. | [read in #4] [research #4, section 1](4-agent-auth-stack-hosting.md) |
| Where the work runs | Language understanding runs at Anthropic. Fridgie's Worker only executes the tool call. | [read in #4] requests "come from Anthropic's cloud" |
| Outbound hosts | None new. Anthropic calls Fridgie, and Fridgie calls nobody. | [inference] |
| What it rules out later | Nothing, but it puts a requirement on the MCP tools in #6: recording **several purchases in one call**, each with an optional price, and a way to find an item by name. Without a batch tool, a ten-line receipt is ten round trips. | [inference] |

This is in scope already. ADR 0001 decided the MCP server exists, and #1 asked for the assistant to drive Fridgie. Treating it as an *entry method* costs nothing extra.

### Option C: receipt, read by the assistant (nobody asked for this one either)

**What the owner does:**

1. In the Claude app, tap the attachment button and take a photo of the receipt (or pick one from Photos).
2. Ask: "Add this to Fridgie."
3. Claude reads the lines, matches them to items it lists from Fridgie, and asks about anything it cannot match ("Is 'KS ORG BRTH' your 'bread'?"). It then records the purchases with their prices in one batch.

| Question | Answer | Mark |
| - | - | - |
| Cost at $0 | As option B. Image formats Claude accepts: JPEG, PNG, GIF, WebP, "up to 8000x8000 pixels". | [read] [Upload files to Claude](https://support.claude.com/en/articles/8241126-upload-files-to-claude) |
| iOS today | The Claude iOS app. The help article does not say the iOS app offers a camera button. Third-party guides say it does. | [excerpt] [claudemaster.net](https://claudemaster.net/learn/how-to-analyze-images-with-claude-mobile-app). **[assumption]** The owner can attach a photo in the iOS app. Picking from Photos is the fallback. |
| Where the work runs | Anthropic reads the image. Fridgie receives text tool calls, so no image ever reaches the Worker. | [inference] |
| Outbound hosts | None new. | [inference] |
| What it rules out later | Nothing. A later in-app receipt flow writes the same events. | [inference] |

**[inference]** Reading the receipt *and* mapping abbreviations to the owner's items is the step every in-app OCR route still has to solve after the OCR. A general model holding the owner's item list does both in one pass. No in-app option below does that for $0 without adding a model call of its own.

### Option D: barcode scanning in the web app

**What the owner does:**

1. Tap **Scan** in Fridgie in Safari.
2. Either a live camera view opens (Safari asks for camera permission the first time), or the iOS camera opens to take one photo of the barcode.
3. Fridgie decodes the barcode **in the browser**. A barcode Fridgie has seen before goes straight to the **Bought** form for that item.
4. An unknown barcode looks up a product name (optional, see the hosts row), and the owner confirms or renames it, picks the unit and enters quantity and price.

| Question | Answer | Mark |
| - | - | - |
| iOS Safari: native `BarcodeDetector` | **Not usable.** Present in Safari 17+ on iOS only behind the "Shape Detection API" feature flag, which a user would have to turn on in Settings. Marked experimental. | [read] browser-compat-data `api.BarcodeDetector`: `safari_ios: {version_added: "17", flags: [{name: "Shape Detection API", type: "preference"}]}` ([data](https://github.com/mdn/browser-compat-data/blob/main/api/BarcodeDetector.json), [MDN](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector)) |
| iOS Safari: what does work | Live camera via `getUserMedia` (iOS Safari 11+). One photo via `<input type="file" accept="image/*" capture>` (`capture` iOS Safari 10+). WebAssembly (`WebAssembly.instantiate` iOS Safari 11+, `instantiateStreaming` 15+). | [read] browser-compat-data `api.MediaDevices.getUserMedia`, `html.elements.input.capture`, `webassembly.api.instantiate_static` |
| The decoder | A polyfill of the same API built on ZXing-C++ compiled to WebAssembly: `barcode-detector` 3.2.2 (MIT), backed by `zxing-wasm` 3.1.5. Reads `ean_13`, `ean_8`, `upc_a`, `upc_e`. The reader-only `.wasm` file is **966,895 bytes**. | [read] [barcode-detector README](https://github.com/Sec-ant/barcode-detector), npm tarballs for both packages |
| Cost at $0 | Decoding: $0, in the browser. The `.wasm` file can be served from the Worker's static assets, which are "free and unlimited". Individual asset limit 25 MiB. | [read] [Static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Cost: product-name lookup | **Open Food Facts** API, free. "15 req/min/IP address for all read product queries". Requests need a custom User-Agent of the form `AppName/Version (ContactEmail)`. Data is under the ODbL, and "there are no assurances that the data is accurate, complete, or reliable". | [read] [Open Food Facts API introduction](https://openfoodfacts.github.io/openfoodfacts-server/api/) |
| Where the work runs | Image decoding in the **browser** (it would not fit 10 ms of Worker CPU). Lookup either from the Worker (a `fetch` costs no CPU while waiting) or from the browser. | [read] Workers limits, above. [inference] The OFF limit is per IP, and a Worker's outbound IP may be shared with other Cloudflare customers. "If your requests come from your users directly (ex: mobile app), the rate limits apply per user", so calling from the phone is the safer side. |
| Outbound hosts | `world.openfoodfacts.org` (lookup). By default the polyfill fetches its `.wasm` from **`fastly.jsdelivr.net`**. That has to be overridden to self-host, or it becomes a second new host. | [read] barcode-detector README: "By default, the `.wasm` serving path is initialized with a jsDelivr CDN URL." |
| What it rules out later | Nothing in the data. It does add two dependencies outside ADR 0003's table, so it "stops and asks", and about 1 MB of browser download to a server-rendered app. | [read] ADR 0003. [inference] |

**Against it, from prior art.** Grocy, the most established self-hosted pantry tracker, ships client-side ZXing camera scanning, and its author writes: "My personal recommendation: Use a USB barcode laser scanner. They are cheap and work 1000% better, faster, under any lighting condition and from any angle." [read] [Grocy README](https://github.com/grocy/grocy/blob/master/README.md). A reviewer who tried Grocy for their own fridge gave up after a week. Loose produce such as onions has no barcode and varies in count, and the reviewer found the system closer to warehouse logistics than to a kitchen. [excerpt] [Galaxus review](https://www.galaxus.de/en/page/how-i-want-to-digitise-the-contents-of-my-fridge-and-fail-to-do-so-39565). Fridge contents skew to exactly those items: produce, deli, store-packed meat.

**Open Food Facts coverage of US products: not found.** No source gave a share of US barcodes that are missing. Third-party listings say coverage is "excellent in France and much of Europe, thinner elsewhere" [excerpt] ([Apify listing](https://apify.com/glitchbound/foodfacts-scraper)). **[assumption]** A noticeable share of the owner's US groceries will not be found. That would make the lookup a nice-to-have. The scan still works without it, because the owner names a barcode once and Fridgie remembers it.

### Option E: receipt OCR inside the web app

**What the owner does:** tap **Receipt**, take one photo with the iOS camera (`capture`), wait, then review a list of recognised lines. Each line is matched to an item or skipped, and prices are confirmed. Save writes one purchase per kept line.

Two ways to do the reading:

| Question | E1: Tesseract.js in the browser | E2: Cloudflare Workers AI vision model |
| - | - | - |
| What it is | Tesseract compiled to WebAssembly, `tesseract.js` 7.0.0 (Apache-2.0). Plain text out, with no structure: the line items and prices still have to be parsed. | A vision LLM behind the Worker's `AI` binding, for example `@cf/meta/llama-3.2-11b-vision-instruct`. It can be asked for JSON lines directly. |
| Cost at $0 | Free. By default its core, worker and language files load from `cdn.jsdelivr.net`, which can be overridden to self-host. [read] [tesseract.js local installation](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md) | Workers Free includes **10,000 Neurons per day**, reset 00:00 UTC. Over that, "further operations will fail". This model costs 4,410 neurons per M input tokens and 61,493 per M output tokens. [read] [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/). **[inference + assumption]** A receipt of a few thousand image tokens and about 500 output tokens is roughly 40–60 neurons, so well over a hundred receipts a day fit. The image token count per photo is assumed, not measured. |
| iOS Safari today | `capture` and WebAssembly, as in D. **[assumption]** Speed and memory on an iPhone are unmeasured. | `capture` only. The image is uploaded. |
| Where the work runs | Browser. | Cloudflare's GPUs, called from the Worker. **[inference]** Waiting on the model is not CPU time. Re-encoding a multi-megabyte photo inside the Worker might be, so the browser should shrink it first. |
| Outbound hosts | None, if self-hosted. | None new: Workers AI is Cloudflare. It is a **new Cloudflare service** (a category change under the house rules), and the model is under Meta's Llama 3.2 licence ([model terms](https://github.com/meta-llama/llama-models/blob/main/models/llama3_2/LICENSE), [read] model metadata in the docs source). |
| Quality | Weak on receipts. Tesseract misread money values (dropped decimal points) while still reporting 93–96 confidence, and faded thermal paper and phone-photo skew degrade it badly. [excerpt] [Label Studio blog](https://labelstud.io/blog/Improve-OCR-quality-with-Tesseract-and-Label-Studio.html). No tesseract.js-specific receipt benchmark was found. | Not measured for receipts. No benchmark found. |
| What it rules out later | Nothing in the data. A new dependency (E1) or a new service (E2). | Same. |

[inference] E2 is the strongest in-app receipt route at $0, and it needs no new outbound host. It would still be a second, weaker version of option C, run on Fridgie's quota instead of the owner's Claude plan. It only earns its place if the owner wants receipts without opening Claude.

### Option F: forwarding e-receipts to Fridgie by email

**What the owner does:** forward a store's e-receipt email (or set an auto-forward) to an address such as `receipts@<their domain>`. An Email Worker parses it and records purchases.

| Question | Answer | Mark |
| - | - | - |
| Cost at $0 | Inbound Email Routing is listed as free on Workers Free. | [excerpt] [Cloudflare Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/) |
| The catch | It routes mail for **a domain whose DNS is on Cloudflare**. Fridgie runs on `workers.dev` (ADR 0004), and a domain costs money every year. | [excerpt] The setup is per domain, with DNS records. [inference] Not $0 unless the owner already has a domain. |
| iOS today | Mail's Forward. Nothing in Safari. | [inference] |
| Where the work runs | Worker (an `email` handler). Parsing a long HTML email may not fit 10 ms. | [inference] |
| Outbound hosts | None new. | [inference] |
| What it rules out later | Nothing. It only helps for shops that send e-receipts, and every store's format is different. | [inference] |

### Discarded, one line each

- **Smart-fridge cameras, scales, NFC tags, a USB or Bluetooth scanner:** hardware, so not $0. (Grocy's author recommends the scanner. It is the right answer for someone who has one.)
- **Pulling orders from a grocery account (Instacart, Amazon Fresh, a store loyalty card):** **[assumption]** There is no consumer API for a person's own order history. Scraping it would hold the owner's store credentials. Not searched further.
- **Paid barcode or receipt APIs with free trials (UPCitemdb, Veryfi, Mindee, Taggun, Google Cloud Vision):** each is a new host, a sign-up and, for Google, a billing account. They lose to option C, which is free, needs no host, and already understands the owner's item names. Their limits were not verified in this run.

### Entry: summary

| Option | Steps for a repeat buy | $0? | iOS | Runs where | New host | First build? |
| - | - | - | - | - | - | - |
| A. Manual + "bought again" | 2 taps | Yes | Safari, plain HTML | Worker | None | **Yes** |
| B. Assistant, typed or spoken | 1 sentence | Yes, under the owner's Claude plan | Claude iOS app | Anthropic + Worker | None | **Yes** (MCP is in scope by ADR 0001) |
| C. Receipt photo read by the assistant | Photo + 1 sentence + confirm | Yes, under the owner's Claude plan | Claude iOS app | Anthropic + Worker | None | **Yes**, needs a batch tool in #6 |
| D. Barcode in the web app | Scan + 1 tap (known barcode) | Yes | Safari via polyfill, not native | Browser (+ lookup) | `world.openfoodfacts.org` (lookup, optional) | Deferred |
| E1. Receipt OCR, Tesseract.js | Photo + review every line | Yes | Safari | Browser | None if self-hosted | Rejected on quality |
| E2. Receipt OCR, Workers AI | Photo + review | Yes, 10,000 neurons/day | Safari | Cloudflare AI | None (new Cloudflare service) | Deferred |
| F. Forwarded e-receipts | Forward an email | Only with a domain already owned | Mail | Worker | None | Deferred |

---

## 2. Low and out

### What the owner fixed

"Running low" **must not depend on perfect counts** (#1, #3). The rule has to stay useful when counts drift. **[inference]** Counts drift in a known direction. Purchases get recorded, because recording one is how an item enters Fridgie, and every entry method above produces a purchase. Uses are the events people skip. So the signal the rule can lean on is the **purchase history**, and the count is a second opinion.

### Prior art

- **Count against a per-item minimum (Grocy).** Grocy's products have a `min_stock_amount`. The stock overview has a "Below min. stock amount" filter, and a user setting auto-adds those products to the shopping list. [read] Grocy [`StockService.php`](https://github.com/grocy/grocy/blob/master/services/StockService.php) (`GetMissingProducts`, `shopping_list_auto_add_below_min_stock_amount`) and [`stockoverview.blade.php`](https://github.com/grocy/grocy/blob/master/views/stockoverview.blade.php). That rule is exactly as good as the count, and the Galaxus review above is what it is like when counts are not kept up.
- **Purchase cycle (inter-purchase time).** Retail "replenishment" models take the median gap between a customer's purchases of an item, project the next purchase from the last one, and act ahead of it:
  - A US patent builds a per-customer, per-item table of median purchase gaps and their standard deviations, and projects the next date from the last purchase. [excerpt] [US 11176588](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11176588).
  - A marketing vendor's documented method uses the median gap per customer and product, trusts it after about three observations, drops same-day repeat purchases so the interval does not collapse to zero, and opens the reorder window at 85% of the interval. [excerpt] [Smaily, replenishment](https://intelligence.smaily.com/docs/en/metrics/replenishment) (host refused, so not opened).
  - The academic base: Boizot et al. model household food purchases with inter-purchase times and quantities, and find timing and quantity are correlated. [excerpt] [HAL 00357760](https://hal.archives-ouvertes.fr/hal-00357760). That correlation is the bulk-buy weakness noted below.

**Searched and not found:** a published comparison of count-threshold against purchase-cycle rules for household (not retailer) data, and any home-inventory app documented as combining the two. The searches were "household grocery repurchase interval prediction", "Grocy minimum stock … how it works", and "gave up grocy … logging consumption".

### Options for the rule

1. **Count only, against a threshold (Grocy).** Simple and explainable. It fails the owner's constraint, because an item nobody logs uses for never goes low.
2. **Purchase cycle only.** Needs no use events at all, so it survives drift completely. Two failures: it says nothing until there are two purchases, and it cannot see that the owner just finished something early. It ignores an explicit "we're out".
3. **Consumption rate from logged uses (a forecast).** Estimate use per day from use events and project the run-out date. It needs exactly the events that drift. Discarded for that reason.
4. **Hybrid (recommended).** Out comes only from the count, so it is always something the owner or a use event said. Low fires if the count is at or below a threshold, **or** the item is overdue against its own purchase cycle. Each signal covers the other's blind spot: the cycle catches stale counts, and the count catches new items and early finishes.
5. **Survival or hazard model, ML.** Discarded. There is no data to fit it to for one household, and it cannot be recomputed by hand. The issue requires that a reviewer can recompute it.

The hybrid's exact definition, its constants, the rows it reads, and five worked examples are in [ADR 0006](../decisions/0006-low-and-out-rule-and-events.md). In short:

- **Out:** estimated on-hand ≤ 0.
- **Low:** on-hand ≤ L (the owner's threshold, or a quarter of the last purchase quantity, rounded down), **or** days since the last purchase ≥ 0.8 × the median gap between the last four purchases.
- **New item:** count only, until a second purchase gives it a cycle.
- **Rows read:** at most 5 event rows per item. That is the latest event, which carries the running count, plus the last 4 purchases.

The 0.8 sits below the vendor's 85% so that a weekly item turns low about a day and a half before its usual shop. It is a named constant, and choosing it is a guess [assumption].

### Where events live (the instrumentation skill's questions)

These are product events in D1, not analytics, but the questions apply as written. The answers are carried into ADR 0006:

- **Do they leave the device?** Yes. They are written server-side to D1, the only store (ADR 0003).
- **Can the store answer the queries?** Yes. SQLite with indexes. D1 bills rows *scanned*, and an index on the filtered columns is what bounds them [read] ([D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 indexes](https://developers.cloudflare.com/d1/best-practices/use-indexes/)).
- **Can a record change?** No. Events are append-only, and a correction is a new `count` event.
- **Is a repeat harmless?** Yes. A client-supplied reference is unique per user, so a retried form post or a retried MCP tool call writes once.
- **Late or out of order?** Each event has `occurred_at` (when it happened, which the owner may backdate for a receipt) and a record order (`id`). The cycle uses `occurred_at`, and the running count uses record order.
- **Added properties?** New columns are nullable. Absent means "not recorded", never zero.
- **Retention?** Forever, within D1's 500 MB per database on Free [read] ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)). **[inference]** At about 100 bytes a row, 500 MB holds millions of events, which is decades for one household.

---

## Recommendation

**Entry:** A and B now, with C riding on B once #6 gives the MCP server a batch purchase tool. Defer D, E2 and F, reject E1.

**Rule:** the hybrid count-or-cycle rule in ADR 0006, on append-only events in which correcting a count is itself an event.

**The strongest argument against, which this run went looking for:** the owner explicitly asked for barcode and receipt to be compared, and the recommendation ships neither *inside the web app*. If what the owner wants is to stand at the fridge with only Safari open and point the phone at a carton, A–C do not give them that. The evidence against in-app barcode (Grocy's author preferring a USB scanner, the Galaxus review, unknown US coverage, two unapproved dependencies and a new host) is mostly [excerpt] and [read] prior art from *other* people. No one has measured it on this owner's iPhone with their groceries.

**What would flip it:**

- **Barcode moves into the first build** if the owner says they would rather scan than tap, *and* accepts the two dependencies. The lookup host is optional: scanning still works without it, because a barcode is named once.
- **In-app receipts (E2) move up** if the owner will not use the Claude app for receipts. Workers AI then adds no new host, but it is a new Cloudflare service and a model licence.
- **The rule changes** if, after a month, "low" fires often on items the owner still has plenty of. That points at bulk buys (ADR 0006 example 5). The fix is to scale the cycle by purchase quantity, a change confined to the formula. The events already carry quantity.
