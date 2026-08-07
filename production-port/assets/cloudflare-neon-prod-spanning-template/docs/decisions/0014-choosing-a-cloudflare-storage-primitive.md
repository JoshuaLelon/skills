# ADR-0014 — Choosing a storage primitive: Postgres is the floor, not the ceiling

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 3 — architecture
> **Scope:** decides HOW to pick a store for a new kind of data. ADR-0001 decided
> the primary store (Neon Postgres via Hyperdrive) and stays the default; this
> one decides when something else earns a place beside it. It does not decide
> deferred execution (ADR-0015) or caching of whole HTTP responses at the edge,
> which is the one Cache API row below.

## Decision

**Default to Postgres. Reach past it only when a specific property Postgres
lacks is the reason.** Adding a second store splits your schema, your
migrations, and — the expensive one — your transaction boundary. That cost is
real and permanent; pay it deliberately.

Selection rule, in the order you should ask:

| If you need… | Use | Because Postgres can't |
|---|---|---|
| relational data, transactions, joins, vectors (`pgvector`) | **Neon Postgres** (ADR-0001) | — this is the default |
| the same DB reached from a Worker without per-request handshakes | **Hyperdrive** in front of it | Workers pay TCP+TLS+auth per connection |
| a value read on nearly every request, written rarely (flags, routing maps, tenant config) | **Workers KV** | a Neon round trip on the hot path |
| bytes: uploads, exports, generated PDFs, video | **R2** | blobs in rows are a cost and backup disaster |
| serialized access to one contended entity (seat booking, inventory, idempotency lock, rate limiter) | **Durable Object** | row locks over Hyperdrive serialize slowly and at distance |
| realtime coordination: WebSockets, presence, collaborative editing | **Durable Object** | Postgres has no push, no connection affinity |
| a per-entity timer ("expire *this* cart in 30 min") | **DO alarm** (ADR-0015) | a cron sweep is the alternative — often fine |
| to cache a whole SSR HTML/JSON *response* by URL | **Cache API** | Postgres is not an HTTP cache |
| high-cardinality analytics you will never need exactly | **Analytics Engine** | an analytics table bloats the primary DB |
| ANN vector search you don't want in the DB | **Vectorize** | nothing — `pgvector` already does this; see below |
| SQL in a *different* app with no Neon project | **D1** | nothing — it is a second SQL store; justify it |

**Two rows deserve their negative stated plainly.** With `pgvector` already
available, **Vectorize earns its place only if** you want ANN served without a
Neon round trip, or you have outgrown what Neon's compute will do — and it costs
you the join: Vectorize returns IDs plus ≤10 KiB metadata, so a second call to
Postgres follows every search. If that second hop dominates, `pgvector` is
strictly simpler. And **D1 alongside Neon is almost always wrong** — two SQL
stores, two migration systems, no cross-store transaction, for a store capped
at 10 GB.

## Context

The seed stack uses exactly one Cloudflare storage primitive (Hyperdrive) and
none of the others. That is a defensible default and a bad law: the reason no
KV appears is that this app never needed a globally-replicated hot-path read,
not that KV is wrong. Without this ADR the absence reads as prohibition, and
the next app inherits a restriction nobody chose.

The constraint that actually decides most of these is **consistency**, not
performance. KV is eventually consistent — up to 60s, with negative lookups
cached too. The failure that teaches this is a user saving a setting and still
seeing the old value; if that sentence describes your data, KV is disqualified
regardless of how much faster it is.

## Alternatives declined

- **A single-store law ("Postgres for everything")** — it is right ~85% of the
  time, which is exactly what makes it dangerous as a rule: it produces
  blob-columns and hand-rolled locks in the 15%.
- **A "use the platform-native option" law** — inverts the same error and
  splits a small app across four stores it cannot reason about.
- **Deciding per-app at port time** — this is the decision that gets made under
  deadline with no notes; it belongs written down before it is needed.

## Consequences

Adding any store here commits you to its consistency model in the failure case,
not the happy path — write the failure sentence down before adopting. Two rules
follow from having no cross-store transaction: a row that points at an R2 key
must tolerate the object being absent, and the write order is always
**blob first, row second** (an orphaned object is garbage; an orphaned row is a
500). Where a limit decides the choice, it is quoted in
`references/cloudflare-primitives.md` with its source, because these move.

Enforced: nothing mechanical — this is a judgement ADR. `check-config-traps`
notices new bindings only via the generated `Env` type staying in sync
(ADR-0018).
