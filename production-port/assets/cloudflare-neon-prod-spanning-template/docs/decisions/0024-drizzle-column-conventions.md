# ADR-0024 — Column conventions: types, enums, jsonb, naming

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 4 — mechanism
> **Constrained by:** 0002
> **Enforced by:** none — judgement
> **Scope:** decides how columns are spelled in Drizzle against Postgres. What
> every entity CARRIES — ownership, keys, history — is ADR-0010 and survives a
> change of store; this does not.

## Decision

- **Timestamps**: always `timestamp(..., { withTimezone: true })`; `createdAt`
  notNull defaultNow; event-marking columns nullable with no default, so "has
  not happened yet" is representable.
- **Enums**: TS string-literal unions on `text()` via `.$type<T>()` — never
  `pgEnum`. This mirrors the TS-level enum ban, and extending a union costs no
  migration where extending a `pgEnum` does.
- **jsonb**: a column exists only if it is queried; row-scoped payloads are
  `jsonb().$type<...>()` bodies.
- **Names**: TS camelCase, DB snake_case, written explicitly rather than left to
  a casing convention that differs between tools.

## Context

Split out of ADR-0010, which combined these with the ownership and key doctrine
and was therefore an architecture decision resting on a mechanism one — the
inversion the level report flagged. The rules here are genuinely
Drizzle-and-Postgres-shaped: `pgEnum`, `jsonb` and `$type<T>()` do not survive a
change of ORM or store, and pretending otherwise made ADR-0010 look more
portable than it was.

## Alternatives declined

- **`pgEnum`** — a migration to add a value, for a constraint TypeScript already
  enforces at the only boundary that writes it.
- **`timestamp` without time zone** — the class of bug that only appears in
  production, in another region, months later.
- **A jsonb column "for flexibility"** — an unqueried column is a place for
  state to rot unobserved; add it when a query needs it.

## Consequences

Test factories type against the schema, so a rename fails at `tsc` rather than
at runtime (ADR-0002). Extending a status union is a code change with no
migration, which is the property `pgEnum` would have cost.
