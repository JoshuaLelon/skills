# ADR-0015 — Choosing how deferred work runs: the ladder is waitUntil → Queues → Workflows

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 3 — architecture
> **Scope:** decides what runs work that is not part of the response. Does not
> decide where that work stores state (ADR-0014) or how it is observed
> (ADR-0016).

## Decision

**Climb the ladder only when the rung you are on breaks.** Each step up buys a
guarantee and costs concepts; buying a guarantee you don't need is the common
error, and so is discovering you needed one at 3am.

**The question that picks the rung: _does anyone notice if this silently didn't
happen?_**

| Rung | Use when | Guarantee | The failure that forces the next rung |
|---|---|---|---|
| **`ctx.waitUntil`** | analytics pings, cache warms, `last_seen_at` touches | none — no retry, no persistence | it failed and nothing anywhere recorded that |
| **Cron Trigger** | time-based work over a set: nightly rollups, expiring sessions | at-least-once, best-effort timing | you need per-entity precision, or >15 min |
| **DO alarm** | entity-based timers: "expire *this* cart in 30 min" | at-least-once, 6 retries then dropped | you need more than one timer per object |
| **Queues** | the work must survive; third-party calls; batching writes | at-least-once + retries + DLQ | steps have *different* failure modes |
| **Workflows** | multi-step processes, human/webhook waits, day-scale sleeps | durable execution, per-step retry + persisted results | — top of the ladder |

Three boundaries worth stating outright, because they are where the choice is
actually made:

- **`waitUntil` → Queues.** `waitUntil` has a **30s budget shared across all
  calls in the request** and no retry. Move up the moment the work touches your
  database, calls a paid third-party API, or a user would file a bug if it were
  dropped. **The tell you have already outgrown it: you are writing retry logic
  inside a `waitUntil`.**
- **Queues → Workflows.** A Queue retries the *whole* handler — if step 3
  fails, steps 1–2 run again, so the entire consumer must be idempotent.
  Workflows retry a *step*, so a failed email doesn't re-charge the card. Pick
  Queues for volume and uniformity; Workflows for a process with heterogeneous
  failure modes.
- **Cron vs DO alarm.** If you would implement it as
  `SELECT … WHERE due_at < now()`, use Cron. If you would implement it as a
  per-row timer, use a DO alarm — but standing up a Durable Object *purely* to
  get a timer is over-engineering; a cron sweep does the same job with fewer
  concepts.

**Queues consumers must be idempotent.** Delivery is at-least-once, duplicates
happen, and the documented pattern is a unique message ID as a primary key. This
is not optional advice; it is the cost of the rung.

## Context

The seed app plumbs `ctx` into `AppContext` and never calls `waitUntil` — the
capability is wired and unused. That is the right starting point (no background
work exists yet) and a bad resting point, because the first person to need
deferred work has no guidance and will reach for whatever they last read about.

The reason a ladder beats a rule: these primitives are not substitutes at
different price points, they are different *durability* guarantees. Choosing by
convenience produces the two classic failures — a critical write in a
`waitUntil` that vanishes under load, and a Workflow with a control plane and
per-step billing doing what one idempotent Queue message would have done.

## Alternatives declined

- **"Always use Queues" for anything async** — buys durability for analytics
  pings that nobody would miss, and adds a consumer Worker, a DLQ, and
  idempotency requirements to a fire-and-forget ping.
- **`waitUntil` as the general answer** — it is the cheapest and the default
  temptation; its 30s shared budget and total absence of retry make it wrong for
  anything that matters. Silent data loss is the worst failure mode to buy for
  free.
- **A cron sweep for everything time-based** — correct surprisingly often, but
  it degrades badly once "due" precision matters or the sweep outgrows 15 min.

## Consequences

Adopting Queues or Workflows adds a consumer that needs its own wide event
(ADR-0009) — background work with no log is invisible work. Adopting Cron adds a
`scheduled` handler, which the seed does not export today.

**Time-sensitive:** Workflows steps and storage began billing **2026-08-10**;
cost models built before that date assumed free steps and are wrong. Current
figures and every limit quoted above live in
`references/cloudflare-primitives.md`.

Enforced: nothing mechanical. The gate that matters is review asking "what
happens if this silently doesn't run?"
