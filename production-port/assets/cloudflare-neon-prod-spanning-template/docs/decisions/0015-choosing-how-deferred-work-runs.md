# ADR-0015 — Deferred work: climb the ladder only when the rung breaks

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 3 — architecture
> **Constrained by:** 0001
> **Enforced by:** none — judgement
> **Applies to:** cloudflare
> **Scope:** decides what runs work that is not part of the response. Where that
> work stores state is ADR-0014; how it is observed is ADR-0016.

## Decision

**Each step up the ladder buys a guarantee and costs concepts. Buy the
guarantee you need and no more.** The question that picks the rung: **does
anyone notice if this silently didn't happen?**

`ctx.waitUntil` → Cron Trigger → DO alarm → Queues → Workflows, in increasing
order of durability. The rungs, their guarantees and their limits are
`../reference/cloudflare-primitives.md`.

Three boundaries decide most cases:

- **`waitUntil` → Queues.** No retry, and a budget shared across the request.
  Move up the moment the work touches your database, calls a paid third party,
  or a user would file a bug if it were dropped. **The tell that you have
  already outgrown it: you are writing retry logic inside a `waitUntil`.**
- **Queues → Workflows.** A Queue retries the *whole* handler, so the entire
  consumer must be idempotent; a Workflow retries a *step*, so a failed email
  doesn't re-charge the card. Queues for volume and uniformity, Workflows for
  heterogeneous failure modes.
- **Cron vs DO alarm.** If you would write `SELECT … WHERE due_at < now()`, use
  Cron. If you would write a per-row timer, use an alarm — but standing up a
  Durable Object *purely* to get a timer is over-engineering.

**Queues consumers must be idempotent.** Delivery is at-least-once; the
documented pattern is a unique message ID as a primary key. That is the cost of
the rung, not optional advice.

## Context

The seed plumbs `ctx` into `AppContext` and never calls `waitUntil` — the
capability is wired and unused. That is the right starting point and a bad
resting point: the first person to need deferred work otherwise reaches for
whatever they last read about.

These primitives are not substitutes at different price points; they are
different *durability* guarantees.

## Alternatives declined

- **"Always use Queues" for anything async** — buys durability for analytics
  pings nobody would miss, and adds a consumer, a DLQ and idempotency
  requirements to a fire-and-forget ping.
- **`waitUntil` as the general answer** — the cheapest and the default
  temptation; silent data loss is the worst failure mode to buy for free.
- **A cron sweep for everything time-based** — correct surprisingly often, and
  it degrades badly once "due" precision matters.

## Consequences

Queues or Workflows add a consumer that needs its own wide event (ADR-0009) —
background work with no log is invisible work. Cron adds a `scheduled` handler,
which the seed does not export today.

The gate that matters is review asking "what happens if this silently doesn't
run?"
