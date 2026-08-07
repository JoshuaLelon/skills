# ADR-0008 — Errors: two-tier RR8 boundaries, a typed taxonomy, platform capture

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 3 — architecture
> **Constrained by:** 0003, 0009
> **Enforced by:** none — judgement
> **Applies to:** react-router
> **Scope:** pre-decided for the Cloudflare+Neon stack (production-port skill seed). Diverge by superseding with a new ADR and a §2 row — never by editing this one.

## Decision
Three coordinated pieces:
1. **Boundaries**: a root `ErrorBoundary` (whole-document replacement, last resort) and a per-route `ErrorBoundary` on every screen delegating to one shared `<ScreenError>` that renders INLINE in the failed outlet — nav and store stay mounted — with a revalidator "Try again" and stack traces gated to DEV. RR8's own route boundaries, not `react-error-boundary`: they also catch loader rejections, which render-phase boundaries cannot.
2. **Taxonomy** (`src/lib/errors.ts`): `AppError(status, publicMessage)` for expected failures — thrown in loaders/actions, rendered by boundaries with their message; everything else is a bug: logged with full context, rendered generic.
3. **Capture**: uncaught Worker exceptions are recorded by Workers Logs with zero code (`observability.enabled` + `upload_source_maps`). No Sentry, no tail worker, no custom pipeline — if paging is ever needed, one OTLP destination, not machinery.

## Alternatives declined
react-error-boundary (render-phase only); hand-rolled class boundaries; swallowing loader errors into nulls (the boundary IS the null-path).

## Consequences
`ScreenError` ships as a template. An expected failure that reaches the generic boundary is a taxonomy bug: type it.
