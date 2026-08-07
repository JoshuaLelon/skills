# ADR-0023 — The edge: settle a concern before your code pays for it

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 3 — architecture
> **Constrained by:** 0001
> **Enforced by:** none — judgement
> **Applies to:** cloudflare
> **Scope:** decides what runs at the request edge rather than in a loader. Does
> not decide authentication (ADR-0004) or placement (ADR-0019).

## Decision

**Push a concern to the edge when it must be settled before your code, your
database, or your model provider pays for it.** It is cheaper to reject, cache
or resize at the boundary than inside a loader. Which primitive does what —
rate limiting, Cache API, `request.cf`, Images, Turnstile, WAF — is
`../reference/cloudflare-primitives.md`.

**Two have a concrete home in this app today:**

- **The `/capture` webhook has a shared-secret check and no rate limit.** A
  leaked `CAPTURE_KEY`, or a caller with a retry loop, becomes unbounded writes
  to Neon. A rate limit binding is the cheap bound, and it belongs *before*
  `makeDb`.
- **`request.cf` is unread**, so wide events (ADR-0009) carry no country, colo
  or bot signal — three high-value fields on the one event per request the log
  doctrine already emits, for the cost of reading a property.

**Do not reach for the Cache API for authenticated pages.** Every route here is
owner-scoped; a response cached by URL and served to the wrong owner is the
worst bug this codebase could ship. Cache the unauthenticated surface or nothing.

## Context

The seed reads none of these. That is appropriate for an app whose only public
route is a shared-secret webhook, and it stops being appropriate the moment
there is a signup form, a public page, or user-uploaded images.

Each is a decision about **where a concern lives**, and the wrong answer is
invisible: rate limiting inside a loader still costs a database connection, bot
filtering in application code still costs a Worker invocation. The code works;
the cost is structural.

## Alternatives declined

- **Rate limiting in application code** — a DO rate limiter is correct when you
  need custom logic or shared quota; the binding is the answer for a simple
  per-key ceiling, and it costs no round trip.
- **Cache API for authenticated responses** — declined outright, see above.
- **A third-party image service** — Images is already adjacent to the assets
  this app serves, and R2 (ADR-0014) is where originals would live.
- **WAF rules as the answer to application abuse** — they protect the zone, not
  an endpoint's semantics; a webhook needs a per-key ceiling.
- **Turnstile now** — nothing in the seed takes public form input. It becomes
  the first thing to add alongside a signup route.

## Consequences

Anything moved to the edge stops being visible to the wide event unless you log
it deliberately — a rate-limited request that never reaches `guarded()` produces
no application log line. Prefer logging rejections at the boundary: the
interesting question is always *who* got limited.

`request.cf` is absent in some contexts (notably parts of local development), so
read it defensively rather than asserting its shape.
