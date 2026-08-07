# ADR-0010 — Ownership, keys and history: the shape every entity takes

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 3 — architecture
> **Constrained by:** —
> **Enforced by:** ast-grep:no-owner-from-params
> **Applies to:** any
> **Scope:** decides what every entity carries and how history is kept — the
> part that survives a change of store. Column syntax (types, enums, jsonb,
> naming) is Drizzle-and-Postgres-shaped and lives in ADR-0024.

## Decision

- **Ownership**: every root entity carries `owner: uuid` FK → users,
  `onDelete: cascade`. Global machinery tables are the only carve-outs, named in
  the schema header.
- **Keys**: content entities use composite PK `(owner, ref)`, with `ref` a
  `type:kebab-slug` text key carried from the fixture; a bare generated uuid only
  where no natural key exists; join tables use composite PKs of their columns.
- **History**: one `actions` table (`subject, subjectRef, verb, source,
  before/after, at`, plus attribution), not per-entity history — the fixture's
  ACTIONS array grown up.
- **Indexes**: none without a comment naming the exact query it serves.
- **No soft delete**: deletion is real and cascades. Add it per-entity only when
  a product law demands undo beyond the actions log.

## Context

These four are the decisions a new entity has to get right before anything else
works, and each one is expensive to change later: ownership because it is what
authorization and test isolation both rest on, keys because they propagate into
every foreign key, history because retrofitting an audit trail means
reconstructing the past, and soft delete because it silently changes the meaning
of every query.

None of them is a property of the ORM. Splitting them out of the original
combined ADR was prompted by the level-inversion report: this file sat at
architecture while resting on a mechanism decision, because half of it was
mechanism. Swapping the ORM should not invalidate the ownership rule.

## Alternatives declined

- **A surrogate `id` on every table** — hides the natural key and lets two rows
  that mean the same thing coexist; `(owner, ref)` makes that a constraint
  violation.
- **Per-entity history tables** — N schemas to keep in step, and no way to ask
  "what happened to this account" across entities.
- **Soft delete by default** — every query grows a predicate that someone will
  eventually forget, and the actions log already answers "what was there".

## Consequences

Owner scoping is what makes test isolation and `fullyParallel` free (ADR-0006);
it is a load-bearing property of the test strategy, not only of the schema.
`(owner, ref)` preserves the prototype's id discipline into the database, which
is what lets a fixture row and a database row be compared directly.
