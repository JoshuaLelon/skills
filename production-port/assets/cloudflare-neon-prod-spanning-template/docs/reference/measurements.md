# Measurements — what was measured, on what, when

> **Kind:** reference · **Status:** accepted · **Updated:** [FILL: date]
> **Level:** 4 — mechanism
> **Constrained by:** `../decisions/0013-the-walking-skeleton.md`
> **Scope:** the numbers behind ADR-0017 (cold start) and ADR-0019 (placement).
> The DECISIONS those numbers support live in the ADRs; the numbers live here
> because they describe THIS app and change when it does.

Every figure below is a measurement of a specific tree at a specific moment.
They are here rather than in the ADRs because an ADR is immutable and these are
not: the exemplar entity is deleted at port completion (ADR-0013), so an ADR
quoting `/notes` would go on describing a route the app no longer has.

**Re-measure when the shape changes** and update this file. The ADRs that cite
it carry a `Tracks:` pin, so `npm run docs:tracks` will ask whoever owns the
decision to re-read it.

---

## Cold start — bundle size and startup CPU (ADR-0017)

Measured on the seed app with `wrangler check startup`:

| | gzip | startup CPU |
| --- | --- | --- |
| `lib/ai` unreachable (dead code) | **223 KiB** | 0.0 ms |
| reachable, `await import('@anthropic-ai/sdk')` | **318 KiB** | 0.0 ms |
| reachable, `import Anthropic from …` | **318 KiB** | 0.0 ms |

**This table refutes the obvious reading.** The 95 KiB is *reachability*, not
laziness — the first row is dead-code elimination. Lazy and eager differ by
0.13 KiB, because the bundler inlines the dynamic import into the same chunk:
`await import()` defers **evaluation, not inclusion**.

The CPU column never moved. The local profile takes roughly one sample and is
too coarse to see module init, so the CPU budget stays an unproven backstop.
**gzip is the signal.**

Two traps from the session that produced these numbers:

- **`wrangler check startup` grades `./build`, not your source.** Under
  `@cloudflare/vite-plugin` the generated config carries `no_bundle`. Three
  consecutive source mutations produced byte-identical output before this was
  noticed. Hence `check:startup` builds first.
- **`src/lib/ai/client.server.ts` was not imported by anything.** The seam
  shipped as dead code, so every mutation to it was tree-shaken and could not
  move the bundle — which is what made "lazy vs eager" look like a 95 KiB
  difference when the real variable was reachability. **A gate measured against
  dead code reports whatever you hoped for.**

## Placement — sequential database round trips per route (ADR-0019)

Counted by reading the seed app's query paths (`src/db/queries.server.ts`,
`src/db/seed.ts`, and each screen's loader/action). A drizzle `db.transaction()`
over `node-postgres` issues `BEGIN` and `COMMIT` as their own statements, and
every statement is awaited in sequence:

| Route | Statements | Sequential round trips |
| --- | --- | --- |
| `/notes` loader | `seedFixture` (3) + `listNotes` (1) | **4** |
| `/notes` action — create | `BEGIN` + 2 inserts + `COMMIT` | **4** |
| `/notes` action — complete | `BEGIN` + update…returning + insert + `COMMIT` | **4** |
| `/capture` webhook | `ensureUser` (1) + create transaction (4) | **5** |
| `/note/:ref` loader | `noteOf` | 1 |
| `/health` | `select 1` | 1 |

**Four of the six routes — including every route a user actually exercises —
make four or five sequential round trips.** Cloudflare documents per-query
latency dropping from 20–30 ms to 1–3 ms when the Worker sits next to the pool,
so on `/notes` that is roughly 80–120 ms of serial database wait against
4–12 ms. The two single-query routes gain nothing, and that is fine: they are
`/health` and a detail view.

Hyperdrive does **not** already solve this. It removes *connection setup* round
trips by pooling near the database; it does not remove *per-query* round trips.

**The number that matters is sequential awaited round trips per request, and it
changes silently** — adding one lookup to a loader moves a route up this table
without touching any config.
