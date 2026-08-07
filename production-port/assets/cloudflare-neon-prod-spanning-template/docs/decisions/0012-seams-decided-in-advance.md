# ADR-0012 — Seams decided in advance

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 3 — architecture
> **Constrained by:** 0003
> **Enforced by:** ast-grep:one-door-model, ast-grep:no-stale-zod, depcruise:no-db-in-view, depcruise:no-fixture-in-view, depcruise:no-circular
> **Applies to:** any
> **Scope:** which boundaries every app on this stack draws before writing
> features, which it deliberately does not, and how each is enforced. The
> governing principle and per-seam map live in the production-port skill's
> `references/architecture.md`.

## Decision

The governing rule: **where two parts of the system change independently,
draw a seam; where they change together, don't.** Pre-drawn, because future
agents follow an existing pattern far more reliably than they invent one:

1. **Browser ↔ server**: infra modules are `.server.ts` (the Vite plugin
   refuses to bundle them client-side); screens/components import no db/SDK
   (gated: `no-db-in-view`).
2. **Route ↔ use case**: loaders/actions translate HTTP (Request, FormData,
   status) into a plain function call and back, inside `guarded()`. Rules live
   in the function, not the route file.
3. **External input ↔ trusted values**: `parseOr400()` at every boundary the
   type system doesn't already carry (webhooks, third-party POSTs). Parse,
   don't validate — past the parse, code assumes valid data.
4. **Model provider ↔ capability**: `@anthropic-ai/sdk` is imported only by
   the adapter in `src/lib/ai/` (gated: `one-door-model`), which exposes OUR
   capability (`generate(request) → GeneratedText`) and maps provider DTOs,
   stop-reasons, and usage into our own types at the door. Prompt construction
   is pure and testable without an API call; the adapter receives an
   already-built semantic request.
5. **Transaction ↔ use case**: the transaction wraps the whole application
   operation, not each query — one `db.transaction(async (tx) => …)` at the
   use-case level; repositories/queries take the handle.
6. **Composition root**: bindings, secrets, and config are read once
   (`env.server.ts` / the worker entry) and passed in — never reached for
   from feature code. The client-side twin is the host (ADR-0007).
7. **Escape hatches are localized**: raw SQL is allowed but lives next to the
   query module that owns it, never inline in routes.

## Alternatives declined — the seams we deliberately do NOT draw

- **A repository interface + in-memory fake per aggregate**: our tests run
  against real Postgres with owner-scoped isolation (ADR-0006) — the fake
  would test a fiction. Query modules are concrete; substitution has no
  consumer.
- **A DTO between internal functions / an interface per class**: cohesive
  typed code passes ordinary values; DTOs earn their place only at boundaries
  (seam 3).
- **A generic ApiClient**: loaders/actions ARE the transport seam (ADR-0003).
- **A wrapper mirroring the provider SDK**: indirection without protection —
  the adapter models the product capability instead (seam 4).

## Consequences

New feature code has a place for everything before it exists: screens compose,
routes translate, use cases coordinate, adapters map, the root composes.
A gate or convention with no consumer is deleted, per the meta-rule.
