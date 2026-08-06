# The pre-decided architecture — and what coordinates with what

The stack is fixed, so the decisions downstream of it are made once and shipped
as the ADR seed (`docs/decisions/0001–0012`, copied in `accepted`). This file is
the map of *why they fit together* — every decision names its dependents, so
changing one surfaces what it orphans. Diverge by superseding an ADR + a §2
row; never by drifting.

## The coordination graph

| decision | exists because of | and is what makes … work |
| --- | --- | --- |
| owner on every row (0010) | per-user product model (0004-style) | test isolation without resets; `fullyParallel` as the isolation regression test (0006) |
| `(owner, ref)` composite keys, `ref` = `type:kebab-slug` (0010) | the prototype's id discipline (fixture rule 4) | fixture rows → seed rows 1:1; the fidelity audit's node pairing |
| `now` as an argument (0005) | replay equality in the store (0007) | flow-test clock pinning; the audit's determinism; `ORDER BY at` stability |
| effects as data + one host (0007) | the port must be a copy | replay equality; the dev invariants; strip-harness knowing where everything lives |
| loaders as the seam (0003) | accessors in the prototype | mock→Postgres swap with no screen changes; per-route error boundaries (0008) |
| sessions in cookies (0004) | Workers request model; no localStorage | the owner column having a trustworthy source; `requireOwner` as one door |
| one flat-JSON log door (0009) | Workers Logs indexes object fields | queryable production behaviour with zero pipeline; the single-door gate |
| error taxonomy (0008) | boundaries need to know expected vs bug | expected states render; bugs log with context AND reach platform capture |
| string-union enums in text columns (0010) | `erasableSyntaxOnly` bans TS enums | one enum convention across TS and DB; no migration to extend a union |
| actions table (0010) | fixture rule 7 (`ACTIONS` from day one) | history, attribution of model actions, undo material — a third of any schema |

## Database connections — one matrix, three strings

| context | string | via |
| --- | --- | --- |
| Worker runtime | **direct** | Hyperdrive binding (it does the pooling) — `pg` + `drizzle-orm/node-postgres` |
| external processes, CLIs | `-pooler` | plain `pg` |
| migrations (`drizzle-kit`) | direct | never through a pooler |

Neon defaults adopted (0001): protected `main`; preview/demo branches with
1-day TTL; demo refresh = `reset_from_parent` (the Neon MCP tool does this);
autoscale 0.25→2 CU; scale-to-zero on; 7-day restore window;
`pg_stat_statements` enabled day one; per-role `statement_timeout` set
explicitly (Neon sets none).

## Errors and logging — the division of labor

- **Platform** (config, zero code): uncaught exception capture, field-indexed
  structured logs, source-mapped traces, auto-instrumented traces, the Query
  Builder. `config-traps` asserts the config stays on.
- **App** (two small template files): the expected/unexpected split and the
  **wide-event boundary** (`lib/errors.ts` — `guarded()` accumulates one
  canonical event per invocation, handlers enrich via `add()`, one emit with
  outcome + duration; `lib/log.ts` is the door). Boundaries are RR8's own,
  shaped by `<ScreenError>` — inline in the outlet, retry via revalidator,
  DEV-gated stacks. External payloads (webhooks, third-party POSTs) go through
  `parseOr400()` — the one wire route types can't cover; derive schemas with
  drizzle-zod rather than duplicating them.
- **Deliberately absent**: Sentry, tail workers, log pipelines, alerting.
  The upgrade path when paging is ever needed is ONE OTLP destination in the
  dashboard — config, not code.

## Seams (ADR-0012) — drawn in advance, enforcement stated per seam

**Where two parts change independently, draw a seam; where they change
together, don't.** The pre-drawn set, each with its teeth:

| seam | mechanism | enforced by |
| --- | --- | --- |
| browser ↔ server | infra modules named `.server.ts` | Vite plugin refuses client bundling; `no-db-in-view` |
| route ↔ use case | loader/action translates HTTP → plain call, inside `guarded()` | convention (route files stay thin — review) |
| external input ↔ trusted values | `parseOr400()` at non-typed wires | template + convention |
| provider ↔ capability | `src/lib/ai/` adapter owns the SDK, maps DTOs both ways; prompt-building pure | `one-door-model` gate + verify:gates |
| transaction ↔ use case | one `db.transaction` around the operation, queries take the handle | convention |
| config ↔ code | composition root (`env.server.ts` + worker entry) reads once, passes in | convention; `.dev.vars.example` manifest check |
| raw-SQL escape hatch | allowed, localized beside its query module | review |

**Deliberately not drawn** (each has a stated reason in ADR-0012): repository
interfaces + in-memory fakes (tests run on real Postgres, owner-scoped — the
fake tests a fiction), DTOs between internal functions, a generic ApiClient
(loaders are the transport seam), an SDK-mirroring wrapper (model the
capability, not the provider).

One forward convention, written now so nobody re-derives it later: **if the app
ever splits into multiple Workers, they talk over service-binding RPC**
(transpile-time typed), never `fetch()` between our own Workers.

## What stays open per app

The seed decides mechanism and architecture (L3/L4). Each app still decides:
its object model and laws (L0–L2 — the prototyping skill's dialogue), its §2
divergences, which global tables escape the owner rule (name them in the
schema header), and when a decision here stops fitting — in which case
supersede it properly and the next project inherits the correction.
