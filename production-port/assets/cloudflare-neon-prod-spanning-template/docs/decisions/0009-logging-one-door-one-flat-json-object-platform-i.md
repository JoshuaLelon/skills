# ADR-0009 — Logging: one door, one flat JSON object, platform-indexed

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 4 — mechanism
> **Constrained by:** 0001
> **Enforced by:** ast-grep:single-door-console, script:config:traps
> **Applies to:** cloudflare
> **Scope:** pre-decided for the Cloudflare+Neon stack (production-port skill seed). Diverge by superseding with a new ADR and a §2 row — never by editing this one.

## Decision
All server-side logging goes through `src/lib/log.ts`. The primary shape is the **canonical wide event**: one request-scoped event per invocation, created by `guarded()`, enriched by the handler via `add()`, emitted exactly once in every exit path with `outcome` ('ok' | 'expected' | 'error'), `duration_ms`, and everything accumulated — errors are recorded INTO the event, so the error line carries all context enriched before the failure, not just what the catch block knew. Level derives from outcome; only 'error' logs at error. Standalone point events (`log.info` etc.) are reserved for non-request-shaped work (crons, queues, outbound webhooks). High cardinality is blessed — user/request/session ids as fields are what make production queryable; unbounded payloads are not (256 KB/line truncates, and Workers Logs bills per event — wide-event consolidation is the cost model working for you). Cloudflare Workers Logs auto-extracts and indexes every field, so structure in code IS the log pipeline. `observability.enabled: true`, `head_sampling_rate: 1` — keep 100%; head sampling loses the one event that explains the outage. If volume ever forces sampling, the upgrade is TAIL sampling via an OTLP sink (keep all errors + p99+ slow, sample the rest 1–5%), never the head knob. `upload_source_maps: true`, traces enabled while free.

## Alternatives declined
pino/winston (workerd-awkward, and the platform indexes plain objects already); string interpolation (unqueryable); Tail Workers/Logpush/Analytics Engine (machinery a small app doesn't need — the docs themselves now point new integrations at OTLP export instead).

## Consequences
`console.*` outside `lib/log.ts` (and the host's dev invariants) is gated out — single-door is a rule with a lint, not a preference. Event names are `entity/verb`-style like actions. Traces are transport, not content — business context (owner, feature state) belongs in the event's fields, not delegated to the trace.
