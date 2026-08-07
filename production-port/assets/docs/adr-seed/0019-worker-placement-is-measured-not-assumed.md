# ADR-0019 — Worker placement is measured, and this app's hot routes justify a Hint

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 4 — mechanism
> **Scope:** decides where the Worker executes relative to the database. Does not
> decide connection pooling (Hyperdrive, ADR-0001) or cold start (ADR-0017).

## Decision

**Count the sequential database round trips on your hot routes before setting
`placement`. Set a Hint if the count is greater than one; leave it unset if it
is not.**

The rule exists because the payoff is not "the database is far away" — it is
"the request crosses the distance *repeatedly*". If a request makes exactly one
query, placement moves the round trip; it does not remove it, and end-to-end
latency is unchanged.

When you do set it, **use a Placement Hint, not Smart Placement**, for a single
known single-homed database:

```jsonc
"placement": { "region": "aws:us-east-1" }   // or { "host": "db.example.com:5432" }
```

`mode: "smart"` is for the other shape — several backends, unknown locations, or
replicated/anycast infrastructure. Hints are documented as *not working
correctly* for broadcast, anycast, multicast or replicated resources; Neon is a
single primary, so a Hint fits and Smart Placement's traffic analysis buys
nothing.

## Context

The measurement, taken by counting statements in the seed app's query paths
(`src/db/queries.server.ts`, `src/db/seed.ts`, and each screen's loader/action).
A drizzle `db.transaction()` over `node-postgres` issues `BEGIN` and `COMMIT` as
their own statements, and every statement is awaited in sequence:

| Route | Statements | Sequential round trips |
|---|---|---|
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
Each of the four statements above still crosses from the Worker to the pool.
Placement is what shortens that leg.

## Alternatives declined

- **Smart Placement (`mode: "smart"`)** — designed for multiple or unknown
  backends; here the backend is one known Neon primary, so the Hint is the
  documented fit.
- **Setting placement without measuring** — would have been right for this app
  and wrong as a habit. The single-query case is genuinely no-gain, and a rule
  that produces the right config for the wrong reason does not survive the next
  app.
- **Reducing round trips instead** (batching `seedFixture` into one statement,
  or `CTE`-ing the transaction) — strictly better and not mutually exclusive;
  it is simply a larger change than a config key. Worth doing; do not let it
  block the Hint.
- **Reaching for Hyperdrive query caching** — none of these paths are cacheable
  reads: `seedFixture` writes, the actions write, and `listNotes` must be fresh
  after a write.

## Consequences

`placement` is committed **commented out with a `[FILL:]` for the region**,
because the correct value is the Neon project's region and copying the
template's would be worse than leaving it unset. It is one of the values
`rename-app.mjs`-shaped setup should resolve.

Placement only affects `fetch` handlers — not RPC methods or named entrypoints.
If this app ever splits into service-bound Workers (ADR-0001's note on RPC),
re-derive placement for each rather than inheriting it.

Re-measure when the query shape changes. The number that matters is *sequential
awaited round trips per request*, and it changes silently — adding one lookup to
a loader moves a route up this table without touching any config.

Enforced: nothing mechanical; the count is a review question. Traces (ADR-0016)
are what show it in production — each database round trip is its own span.
