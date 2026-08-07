# ADR-0014 — Storage: Postgres is the floor, not the ceiling

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 3 — architecture
> **Constrained by:** 0001
> **Enforced by:** none — judgement
> **Scope:** decides HOW to pick a store for a new kind of data. ADR-0001 chose
> the primary store and stays the default. Deferred execution is ADR-0015.

## Decision

**Default to Postgres. Reach past it only when a specific property Postgres
lacks is the reason.** A second store splits your schema, your migrations and —
the expensive one — your transaction boundary. That cost is real and permanent.

**The constraint that decides most of these is consistency, not performance.**
Before adopting any store, write down the failure sentence: "a user saves a
setting and still sees the old value" disqualifies an eventually-consistent
store no matter how much faster it is.

Which primitive answers which need, with the limits and prices that decide, is
`../reference/cloudflare-primitives.md`. It is a lookup table because those
numbers move; this ADR is the judgement, which does not.

## Context

The seed uses exactly one Cloudflare storage primitive (Hyperdrive) and none of
the others. That is a defensible default and a bad law: the reason no KV appears
is that this app never needed a globally-replicated hot-path read, not that KV
is wrong. Without this ADR the absence reads as prohibition.

## Alternatives declined

- **A single-store law ("Postgres for everything")** — right ~85% of the time,
  which is what makes it dangerous as a rule: it produces blob-columns and
  hand-rolled locks in the other 15%.
- **A "use the platform-native option" law** — inverts the same error and splits
  a small app across four stores it cannot reason about.
- **Deciding per-app at port time** — this is the decision that gets made under
  deadline with no notes.

## Consequences

Adopting a store commits you to its consistency model in the failure case, not
the happy path. With no cross-store transaction, two rules follow: a row
pointing at an R2 key must tolerate the object being absent, and the write order
is always **blob first, row second** — an orphaned object is garbage, an
orphaned row is a 500.
