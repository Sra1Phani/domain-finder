# Domain Finder

Search and recommend good domain names to buy. Describe a product or idea; the
app brainstorms brandable names (AI + rule-based combos), checks real
availability via RDAP, and returns a **ranked** list of buy candidates.

## How it works

```
query ─▶ generate ─▶ check availability ─▶ rank ─▶ results
         (AI + rules)   (RDAP)              (0–100 score)
```

- **Generation** (`lib/generate.ts`) — merges three sources of candidates:
  - _Rule-based_ combos: keyword extraction (stopword-filtered) × prefixes/
    suffixes (`get`, `try`, `-ly`, `-hq`, `-app`, …), shorter-first.
  - _AI brainstorm_ (optional): Vercel AI SDK via AI Gateway (`generateObject`
    + zod). Degrades gracefully to rule-based when no API key is present.
  - _Domain hacks_ (`lib/hacks.ts`): read the word across the dot —
    `delicio.us`, `bit.ly`, `recip.es`. Built from IANA's full TLD list; needs
    no API. These ignore the TLD filter by design (the word picks the zone), so
    they have their own toggle.
  - Labels are deduped, capped, and expanded across the selected TLDs
    (round-robin so every label gets its `.com` before any gets a second TLD).
- **Availability** (`lib/availability.ts`) — RDAP behind a swappable
  `AvailabilityProvider` interface. Resolves each TLD to its authoritative
  registry RDAP server via the IANA bootstrap file (+ curated overrides), then
  queries the registry directly. Retries on `429`.
- **Status taxonomy** (`lib/rdap-status.ts`) — "taken" isn't one thing. Modelled
  on [Domainr's taxonomy](https://domainr.com/docs/api/v2/status), each domain
  gets a `status` and a coarse `bucket`:

  | bucket | statuses | meaning |
  | --- | --- | --- |
  | `registrable` | `available` | buy it now, at retail |
  | `dropping` | `deleting`, `expiring` | in pendingDelete/redemption — backorder territory |
  | `aftermarket` | `parked` | owned, but nameservers say "for sale" |
  | `unavailable` | `active`, `reserved` | registered and in use |
  | `unknown` | `unknown` | no RDAP server for the TLD, or an error |

  All derived free from RDAP's RFC 8056 status codes, `expiration` event, and
  nameservers. `deleting` domains also get an `estimatedDropAt` (pendingDelete
  is a fixed ~5-day window).
- **Ranking** (`lib/rank.ts`) — a 0–100 score from availability (45), TLD
  desirability (20), length (20), cleanliness/no-hyphens-or-digits (10), and a
  brandability nudge (5, hack > AI > combo). Sorted by **bucket first**, then
  score — so "buy it now" always outranks "might be gettable".

Swapping RDAP for a paid registrar API later (pricing + real buy flow) only
touches `lib/availability.ts` — nothing else in the pipeline knows the source.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

The app works with **no configuration** — availability (RDAP) and rule-based
generation need no keys. To enable AI brainstorming, copy `.env.example` to
`.env.local` and set an AI Gateway key:

```bash
cp .env.example .env.local
# then set AI_GATEWAY_API_KEY=...
```

## API

`POST /api/search`

```jsonc
// request
{ "query": "vegan meal delivery", "tlds": [".com", ".io"], "useAi": true }

// response
{ "query": "...", "results": [ { "domain": "...", "score": 92, "availability": {...}, ... } ],
  "meta": { "generated": 45, "checked": 45, "aiUsed": false, "availabilityProvider": "rdap", "tookMs": 1200 } }
```

## Notes / limitations

- **TLD coverage.** IANA's RDAP bootstrap covers ~1199 of 1438 zones and skews
  gTLD; the gap is ccTLDs, which is exactly what domain hacks use. Verified
  overrides are in `OVERRIDES` (`lib/availability.ts`): `.io`/`.me`/`.sh`/`.ac`,
  `.de`, `.us`. No reachable endpoint was found for `.co`/`.es`/`.at`/`.gg`, so
  those report `unknown` rather than guess. Add more if you find them.
- **Parking detection is high-precision, low-recall.** It reliably flags
  ordinary domains parked on Sedo/Bodis-style nameservers, but misses premium
  ones — most sit behind Cloudflare/AWS where the signal is invisible. Absence
  of `parked` proves nothing. Real aftermarket data needs a paid source.
- **RDAP tells you _registered vs not_ — not price.** Pricing/buy needs a
  registrar API (the interface is ready for it). "Buy" links currently point to
  a Namecheap search; `backorderUrl()` points at DropCatch for dropping domains.
  Swapping in affiliate links is a one-line change in `app/page.tsx`.
- **You can't win a drop by polling this app.** Professional drop-catchers hold
  hundreds of registrar connections. The useful build is a watchlist that alerts
  and hands off to a backorder service — see the wiki for the design.
