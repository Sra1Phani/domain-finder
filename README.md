# Domain Finder

Search and recommend good domain names to buy. Describe a product or idea; the
app brainstorms brandable names (AI + rule-based combos), checks real
availability via RDAP, and returns a **ranked** list of buy candidates.

Source-available under the **Elastic License 2.0** (`SPDX-License-Identifier: Elastic-2.0`) — see [License](#license).

## Connect to the MCP server

Domain Finder is also a **remote MCP server** — check a brand name across domains
and the GitHub / npm / PyPI namespaces from any MCP-capable agent.

- **Endpoint:** `https://domain-finder-theta.vercel.app/api/mcp` (Streamable HTTP)
- **Tools:**
  - `check_name` — check whether one or more candidate names are free across
    domains and the GitHub / npm / PyPI namespaces, in a single call.
  - `generate_names` — generate candidate names from a description, each
    pre-checked for domain availability; feed the favorites into `check_name`.
- **Read-only, and no credentials required** — nothing to sign up for, no keys
  to paste. Safe to connect.

**Cursor** (`~/.cursor/mcp.json`) and any client with native Streamable-HTTP
support:

```jsonc
{
  "mcpServers": {
    "domain-finder": {
      "type": "streamable-http",
      "url": "https://domain-finder-theta.vercel.app/api/mcp"
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`) — bridge a remote server with
`mcp-remote`:

```jsonc
{
  "mcpServers": {
    "domain-finder": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://domain-finder-theta.vercel.app/api/mcp"]
    }
  }
}
```

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

## Watchlist

Track a domain, get emailed when it enters the drop path, hand off to a
backorder service. **This is a scheduler around `availabilityProvider.check()`,
not new availability logic.**

```
cron ─▶ due-queue ─▶ check ─▶ transition? ─▶ alert (deleting | available)
        (next_check_at)       (watch_events)   deduped via `alerts`
```

- **Adaptive due-queue** (`lib/cadence.ts`) — every domain carries a
  `next_check_at`; the poller only touches what's due. Cadence follows status:
  far-off `active` weekly → expiry <30d or redemption daily → `pendingDelete`
  every 6h → hourly inside 24h of the estimated drop. RDAP load stays
  proportional to how *interesting* a domain is, not how many watches exist.
- **State is keyed by domain, not by watch** (`lib/db/schema.ts`). A hundred
  people watching the same short `.com` is one row, one RDAP call, one
  transition, fanned out to a hundred inboxes. Load scales with *unique domains
  observed*, not users × domains — which matters because registries don't sell
  capacity.
- **Transition log** (`watch_events`) is the source of truth. Alerts fire only
  on a change, and `alerts` has `unique(watch_id, event_id)` so a cron retry
  can't double-send.
- **Only two statuses alert**: `deleting` (pendingDelete — the fixed ~5-day
  window, i.e. the last moment a backorder can be placed) and `available`.
  Everything else is logged and shown in the UI but stays silent.
- **An `unknown` is not a transition.** A 429 or timeout means "we couldn't
  tell", not "the domain changed" — the last known status stands, and the check
  backs off exponentially (1h, 2h, 4h … capped at a day).
- **TLDs we can't observe are refused at watch time.** `.co`/`.es`/`.at`/`.gg`
  have no public RDAP server, so a watch on them could never fire. Better to say
  so than to accept it and silently never alert.
- Free watches are capped at 3 per email (`FREE_WATCH_LIMIT` in `lib/watch.ts`).

Identity is an email plus an unguessable manage token — no accounts, no
sessions, no users table. The token rides in alert links and authenticates
`/watch/<token>`.

### Running the watchlist locally

```bash
# any Postgres will do
docker run -d --name df-pg -e POSTGRES_PASSWORD=domainfinder \
  -e POSTGRES_USER=domainfinder -e POSTGRES_DB=domainfinder \
  -p 5433:5432 postgres:16-alpine

cp .env.example .env.local   # set DATABASE_URL + CRON_SECRET
npm run db:push              # create the tables
npm run dev
```

Without `RESEND_API_KEY` alerts are **printed to the console** rather than sent,
so the whole flow is drivable with no third-party signup. Trigger a poll by hand:

```bash
curl -H "authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/poll
```

### Scheduling in production

`.github/workflows/poll.yml` hits `/api/cron/poll` hourly. Vercel's Hobby cron
only fires **once per day**, which can burn most of a ~5-day pendingDelete
warning, so the schedule lives in GitHub Actions instead. Set the `POLL_URL` and
`CRON_SECRET` repository secrets. GHA cron is best-effort and can lag a few
minutes — fine for a multi-day warning, and nothing here depends on being
punctual.

## Tests

```bash
npm test
```

`lib/rdap-status.test.ts` and `lib/cadence.test.ts` are pure. `lib/poll.test.ts`
drives the real database with a **fake availability provider** — `pendingDelete`
and `redemptionPeriod` are too rare in the wild to find on demand, and they're
exactly what this feature exists to catch. It skips when `DATABASE_URL` is unset.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

**Search** works with **no configuration** — availability (RDAP) and rule-based
generation need no keys. To enable AI brainstorming, copy `.env.example` to
`.env.local` and set an AI Gateway key:

```bash
cp .env.example .env.local
# then set AI_GATEWAY_API_KEY=...
```

The **watchlist** is the only part that needs a database; search keeps working
without one (`getDb()` is lazy and only throws when a watch route calls it).
See [Watchlist](#watchlist) above.

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

## License

Source-available under the **Elastic License 2.0** (`SPDX-License-Identifier:
Elastic-2.0`). You may inspect, self-host, and modify the code freely. What
you may **not** do is provide it to third parties as a hosted or managed
service that exposes a substantial set of its features — i.e. running it as a
competing hosted service is not permitted. Full terms in [LICENSE](LICENSE).
