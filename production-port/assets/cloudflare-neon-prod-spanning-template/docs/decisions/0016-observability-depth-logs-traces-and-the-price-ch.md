# ADR-0016 — Observability depth: logs answer "what happened", traces answer "what was slow"

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 3 — architecture
> **Constrained by:** 0009
> **Enforced by:** script:config:traps
> **Applies to:** cloudflare
> **Supersedes:** 0009#traces
> **Scope:** decides how much observability to buy and when to add the next
> layer. ADR-0009 decided the log SHAPE (one wide event, one flat JSON object)
> and still holds; this decides the layers around it. Superseded from ADR-0009:
> its "traces enabled while free" now has a date.

## Decision

**Wide events in Workers Logs are the floor and stay the primary artifact.
Traces are the second layer and are on by default while they are free. Every
layer above that is bought only against a named question you could not
otherwise answer.**

| Layer | Answers | Adopt when | Cost shape |
|---|---|---|---|
| **Workers Logs** + wide events (ADR-0009) | what happened, to whom, with what outcome | always — this is the floor | per event; a wide event consolidates many lines into one |
| **`upload_source_maps`** | *where* in TypeScript it threw | always — free | none |
| **Traces** (automatic) | which binding call / subrequest ate the time | by default while free | per span, same per-event price as a log |
| **Custom spans** (`enterSpan()`, or `startActiveSpan()` + `span.end()`) | timing inside one long operation | a specific operation is slow and automatic spans stop too coarse | per span |
| **OTLP export** (`traces.destinations` / `logs.destinations`) | correlation with non-Cloudflare systems; alerting/paging | you need to page someone, or correlate with a system off Cloudflare | per exported event, **Paid only** |
| **Tail Worker** | programmatic reaction to every invocation | you need to *transform* or route logs, not read them | a second Worker's invocations |
| **Logpush** | long retention, compliance, your own lake | retention beyond the platform window is a requirement | per job |
| **Analytics Engine** | high-cardinality product metrics, sampled | you want per-tenant usage without writing rows to Postgres | see ADR-0014 |

**The date that forces a decision: traces are free until 2026-10-01.** After
that each span is one observability event at the same per-event price as a log
line. The seed runs `head_sampling_rate: 1` on both logs *and* traces, which is
correct for a low-traffic app and a real bill for a busy one.

**When volume forces sampling, drop the TRACE rate first, not the log rate.**
The wide event is the artifact you reason from; traces are the supporting
detail. And per ADR-0009, head sampling loses the one event that explains the
outage — if sampling becomes structural rather than a knob, the upgrade is
**tail** sampling via an OTLP sink (keep all errors and p99+, sample the rest
1–5%), never a lower head rate.

Config shape. `logs` and `traces` are independent sub-blocks, each with its own
`enabled`, `head_sampling_rate`, `persist` and `destinations`:

```jsonc
"observability": {
  "enabled": true,
  "head_sampling_rate": 1,
  "traces": { "enabled": true, "head_sampling_rate": 1 }
}
```

**Two ingest meters, one date.** From 2026-10-01: storing an event in the
dashboard bills at **$0.60/M** against the quota logs already use; *exporting*
one over OTLP bills at **$0.05/M** on its own allowance, Paid plans only. So
`"persist": false` alongside `destinations` is the lever when a third party is
already your system of record — you pay the cheap meter and skip the expensive
one. The docs currently disagree with themselves about whether the included
paid allowance is 10M or 20M events/month; plan against the smaller.

**`observability.enabled: true` turns on logs only — traces need
`traces.enabled` explicitly.** Cloudflare has said a future `compatibility_date`
will make `enabled: true` *imply* tracing. That is a trap with a delay on it: a
routine compat-date bump would start emitting billable spans on a Worker that
only ever asked for logs. Declaring the `traces` key explicitly — either value —
is what makes that bump a no-op, which is why the gate demands presence rather
than truth.

## Context

ADR-0009 chose platform-native observability as the entire logging backend and
declined Sentry, Tail Workers, Logpush and Analytics Engine as "machinery a
small app doesn't need". That judgement holds. Two things changed underneath it.

First, **the escape hatch stopped being machinery.** ADR-0009 said "if paging is
ever needed, one OTLP destination, not machinery" — that is now literally one
config key pointing at a destination configured in the dashboard, not a pipeline
to build. The declined alternatives were declined partly on build cost that no
longer exists.

Second, **traces got a price.** "Enabled while free" was a defensible thing to
write when there was no date; there is now one, and a config left at
`head_sampling_rate: 1` through it becomes a bill nobody decided to pay.

## Alternatives declined

- **Traces off by default** — cheaper, and blinds you to the single question
  logs structurally cannot answer (which of the four DB round trips was slow).
  Wrong default before the price date; a legitimate choice after it, which is
  why the gate demands the key be present either way rather than demanding it
  be `true`.
- **Sentry or an external APM as the primary** — a second ingestion path, a
  second bill, and a second place to look, to duplicate what the platform
  already indexes.
- **Logpush from day one** — retention nobody has asked for, plus an R2 bucket
  and a job to maintain.

## Consequences

`check-config-traps` fails if `observability` is missing, if
`upload_source_maps` is not `true`, or if the `traces` key is **absent** — the
last one demands an explicit decision (`true` or `false`), because silence
resolves either to a blind incident or to a surprise bill depending on which
side of 2026-10-01 you are on.

Revisit at the price date: either accept the cost at full fidelity, or move to
tail sampling behind an OTLP destination. Do not quietly lower the head rate —
that is the choice ADR-0009 already declined.

Two limitations to know before trusting a trace. **Non-I/O spans report 0 ms** —
Spectre mitigations stop the runtime advancing the clock without I/O, so traces
measure waiting, not computing (ADR-0017's startup budget is the tool for CPU).
And **trace IDs are not propagated to external services yet** — a Worker span
arrives at your provider as an orphan, not joined to callers upstream. Span and
attribute names are still explicitly unstable; do not build dashboards that
assume them.

Unlike `vars` and bindings, **`observability` DOES inherit into environments** —
verified by building both and diffing the generated config. No per-env repeat is
needed.

Current prices, retention windows and the exact export config live in
`references/cloudflare-primitives.md`; they move, and this ADR deliberately
records only the date that forces the decision.
