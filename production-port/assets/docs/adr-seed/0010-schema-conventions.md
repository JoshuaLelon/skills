# ADR-0010 — Schema conventions

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 3 — architecture
> **Scope:** pre-decided for the Cloudflare+Neon stack (production-port skill seed). Diverge by superseding with a new ADR and a §2 row — never by editing this one.

## Decision
- **Ownership**: every root entity carries `owner: uuid` FK → users, `onDelete: cascade` (global machinery tables are the only carve-outs, named in the schema header).
- **Keys**: content entities use composite PK `(owner, ref)` with `ref` a `type:kebab-slug` text key carried from the fixture; bare `uuid defaultRandom` only where no natural key exists; join tables use composite PKs of their columns.
- **Timestamps**: always `timestamp(..., { withTimezone: true })`; `createdAt` notNull defaultNow; event-marking columns nullable with no default.
- **Enums**: TS string-literal unions on `text()` via `.$type<T>()` — never pgEnum (mirrors the TS-level enum ban; no migration to extend a union).
- **jsonb**: a column exists only if it is queried; row-scoped payloads are `jsonb().$type<...>()` bodies.
- **History**: one `actions` table (`subject, subjectRef, verb, source, before/after jsonb, at`, attribution fields), not per-entity history — the fixture's ACTIONS array grown up.
- **Indexes**: none without a comment naming the exact query it serves.
- **No soft delete**: deletion is real and cascades. Add per-entity only when a product law demands undo beyond the actions log.

## Consequences
Owner scoping is what makes test isolation and `fullyParallel` free (ADR-0006). `(owner, ref)` preserves the prototype's id discipline into the DB. Names: TS camelCase, DB snake_case explicit.
