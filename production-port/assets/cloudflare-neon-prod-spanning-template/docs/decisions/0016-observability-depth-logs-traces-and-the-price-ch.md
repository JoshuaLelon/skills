# ADR-0016 — Observability depth: logs answer "what happened", traces "what was slow"

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 3 — architecture
> **Constrained by:** 0009
> **Enforced by:** script:config:traps
> **Applies to:** cloudflare
> **Supersedes:** 0009#traces
> **Tracks:** ../reference/cloudflare-primitives.md@77076ff
> **Scope:** decides how much observability to buy and when to add the next
> layer. ADR-0009 decided the log SHAPE (one wide event, one flat JSON object)
> and still holds; this decides the layers around it.

## Decision

**Wide events in Workers Logs are the floor and stay the primary artifact.
Traces are the second layer, on by default while they are free. Every layer
above that is bought only against a named question you could not otherwise
answer.** The layers, what each answers, and the current prices and dates are
`../reference/cloudflare-primitives.md` — deliberately not repeated here,
because a price in an immutable file is a lie with a timer on it.

**When volume forces sampling, drop the TRACE rate first, not the log rate.**
The wide event is the artifact you reason from; traces are supporting detail.
Per ADR-0009, head sampling loses the one event that explains the outage — if
sampling becomes structural, the upgrade is **tail** sampling via an OTLP sink
(keep all errors and p99+, sample the rest), never a lower head rate.

**`observability.enabled: true` turns on logs only — traces need
`traces.enabled` explicitly.** Cloudflare has said a future `compatibility_date`
will make `enabled: true` *imply* tracing. That is a trap with a delay on it: a
routine compat-date bump would start emitting billable spans on a Worker that
only ever asked for logs. Declaring the `traces` key explicitly — either value —
makes that bump a no-op, which is why the gate demands **presence, not truth**.

## Context

ADR-0009 chose platform-native observability as the entire logging backend and
declined Sentry, Tail Workers, Logpush and Analytics Engine as "machinery a
small app doesn't need". That judgement holds. Two things changed underneath it.

First, **the escape hatch stopped being machinery.** ADR-0009 said "if paging is
ever needed, one OTLP destination, not machinery" — that is now literally one
config key pointing at a destination configured in the dashboard. Those
alternatives were declined partly on a build cost that no longer exists.

Second, **traces got a price.** "Enabled while free" was defensible when there
was no date; there is now one, and a config left at full fidelity through it
becomes a bill nobody decided to pay.

## Alternatives declined

- **Traces off by default** — cheaper, and blinds you to the one question logs
  structurally cannot answer (which of the four DB round trips was slow). Wrong
  default before the price date; a legitimate choice after it — which is why the
  gate demands the key be present either way rather than demanding it be `true`.
- **Sentry or an external APM as the primary** — a second ingestion path, a
  second bill and a second place to look, to duplicate what the platform
  already indexes.
- **Logpush from day one** — retention nobody has asked for, plus a bucket and a
  job to maintain.

## Consequences

`check-config-traps` fails if `observability` is missing, if
`upload_source_maps` is not `true`, or if the `traces` key is **absent** — the
last demands an explicit decision, because silence resolves either to a blind
incident or to a surprise bill depending on which side of the price date you are
on.

Two limitations before trusting a trace. **Non-I/O spans report 0 ms** —
Spectre mitigations stop the runtime advancing the clock without I/O, so traces
measure waiting, not computing (ADR-0017's startup budget is the tool for CPU).
And **trace IDs are not propagated to external services**, so a Worker span
arrives at your provider as an orphan. Span and attribute names are explicitly
unstable; do not build dashboards that assume them.

Unlike `vars` and bindings, **`observability` DOES inherit into environments** —
verified by building both and diffing the generated config.

Revisit at the price date recorded in the reference: either accept the cost at
full fidelity, or move to tail sampling behind an OTLP destination. Do not
quietly lower the head rate — that is the choice ADR-0009 already declined.
