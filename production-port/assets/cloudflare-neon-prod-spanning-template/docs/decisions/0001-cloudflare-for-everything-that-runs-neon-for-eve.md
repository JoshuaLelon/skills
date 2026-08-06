# ADR-0001 — Cloudflare for everything that runs; Neon for everything that persists

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 4 — mechanism
> **Scope:** pre-decided for the Cloudflare+Neon stack (production-port skill seed). Diverge by superseding with a new ADR and a §2 row — never by editing this one.

## Decision
Compute, static assets, queues, AI gateway: Cloudflare Workers. Data: Neon Postgres.

**Why Neon over Cloudflare's own storage (D1 / DO SQLite), honestly:** the
choice originated in pantogen's need for the breadth of full Postgres —
pgvector for in-database vector search, real extensions, mature SQL across
entities. That need generalized well (the actions log, cross-entity queries,
branching/PITR), so Neon is the seed DEFAULT — but it is an inherited default,
not a law: an app with no vector requirement and strictly user-local data has
a genuinely open choice here (see the multi-tenancy fork below). The Worker reaches Neon through a **Hyperdrive binding carrying the DIRECT connection string** (Hyperdrive does the pooling); the `-pooler` string is for processes outside Workers; the bare direct string is for migrations only.

## Alternatives declined
- D1 + Vectorize: no relational+vector in one store; Postgres does both.
- @neondatabase/serverless driver: fallback only — no interactive transactions over HTTP; Hyperdrive is Neon's current primary recommendation for Workers and is free on all plans.
- **Durable Object per user (SQLite)**: physical isolation with routing-by-name instead of owner-scoping discipline — declined FOR NOW because while apps are solo-user the isolation buys ~nothing and the costs stay fully priced: no pgvector (DO SQLite loads no native extensions), lazy per-object migrations where a bad one bricks DOs at cold start, DIY backup against Neon's built-in branching/PITR, and no cross-entity SQL for the actions log.

## The multi-tenancy fork — a scheduled checkpoint, not a contingency

Shipping to users beyond the author IS the plan for some of these apps. When an
app approaches that moment, this ADR gets re-evaluated as a checkpoint, not
rediscovered: **multi-tenant with untrusted users + per-user data < 10 GB + no
in-database vector requirement + strictly user-local queries → weigh
DO-per-user before adding owner-scoping to shared Neon**, because there it
deletes the owner-scoping attack surface as a class. Apps that inherited the
vector or cross-entity requirements (pantogen-shaped ones) stay on Neon and
harden the relational isolation instead — the owner-scoping discipline plus
its gates and the parallel-suite isolation test (ADR-0006) are exactly the
machinery that moment leans on.

## Consequences
Neon settings adopted by default: `main` protected, per-preview branches with 1-day TTL, demo = branch reset-from-parent, autoscale 0.25→2 CU, scale-to-zero on, 7-day restore window, `pg_stat_statements` on, per-role `statement_timeout` (Neon sets none). Local Postgres image pinned to Neon's exact version. Enforced: db-push-guard, config-traps.
