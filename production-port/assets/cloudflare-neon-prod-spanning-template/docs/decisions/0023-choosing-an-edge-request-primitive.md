# ADR-0023 — Choosing an edge-request primitive: what the platform does before your code runs

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 3 — architecture
> **Scope:** decides what runs at the request edge rather than in a loader. Does
> not decide authentication (ADR-0004) or where the Worker executes (ADR-0019).

## Decision

**Push a concern to the edge when it must be settled before your code, your
database, or your model provider pays for it.** Everything below shares that
shape: it is cheaper to reject, cache, or resize at the boundary than inside a
loader.

| If you need… | Use |
|---|---|
| a per-key request ceiling (abuse, runaway loops, cost control) | **Rate Limiting binding** |
| to cache a whole HTML/JSON response by URL | **Cache API** (per-colo; see ADR-0014) |
| country, colo, TLS details, bot score for the current request | **`request.cf`** |
| resized/reformatted images without an image pipeline | **Images** |
| "is this a human" on a public form | **Turnstile** |
| broad protection: bots, DDoS, managed rules | **WAF / Bot Management** (zone config, not code) |

**Two of these have a concrete home in this app today:**

- **The `/capture` webhook has a shared-secret check and no rate limit.** A
  leaked `CAPTURE_KEY`, or simply a caller with a retry loop, becomes unbounded
  writes to Neon. A rate limit binding is the cheap bound, and it belongs
  *before* `makeDb`.
- **`request.cf` is unread**, so wide events (ADR-0009) carry no country, colo,
  or bot signal. Those are three high-value fields on the one event per request
  that the log doctrine already emits, for the cost of reading a property.

**Do not reach for the Cache API for authenticated pages.** Every route here is
owner-scoped; a response cached by URL and served to the wrong owner is the
worst bug this codebase could ship, and the owner-scoping discipline (ADR-0001)
is exactly what it would defeat. Cache the unauthenticated surface or nothing.

## Context

The seed reads none of these. That is appropriate for an app whose only public
route is a shared-secret webhook, and it stops being appropriate the moment
there is a signup form, a public page, or user-uploaded images.

The reason these deserve an ADR rather than a code comment: each of them is a
decision about **where a concern lives**, and the wrong answer is invisible.
Rate limiting inside a loader still costs a database connection. Bot filtering
in application code still costs a Worker invocation. Image resizing in a Worker
burns CPU on work the platform does for free. In each case the code works, and
the cost is structural.

`request.cf` deserves a specific note: it is the cheapest observability upgrade
available, because ADR-0009 already emits exactly one wide event per request and
`flatten()` already indexes every field on it. The fields are sitting there,
unread.

## Alternatives declined

- **Rate limiting in application code against Postgres or a Durable Object** — a
  DO rate limiter is a real and correct pattern when you need custom logic or
  shared quota across an account; the binding is the answer when you need a
  simple per-key ceiling, and it does not cost a round trip.
- **Cache API for authenticated responses** — declined outright, see above.
- **A third-party image service** — Images is already adjacent to the assets
  this app serves, and R2 (ADR-0014) is where the originals would live.
- **WAF rules as the answer to application abuse** — they protect the zone, not
  a specific endpoint's semantics; a webhook needs a per-key ceiling, which is
  the binding's job.
- **Turnstile now** — nothing in the seed takes public form input. It becomes
  the first thing to add alongside a signup route.

## Consequences

Anything moved to the edge stops being visible to the wide event unless you log
it deliberately — a rate-limited request that never reaches `guarded()` produces
no application log line. Log rejections at the boundary or accept a blind spot,
and prefer the former: the interesting question is always *who* got limited.

`request.cf` is absent in some contexts (notably parts of local development), so
read it defensively rather than asserting its shape.

Cache API is per-data-centre, not global — a warm cache in one colo is a cold
miss in another, which makes hit rates poor on low-traffic apps. If the goal is
a globally-shared value, that is KV (ADR-0014), not the Cache API.

Enforced: nothing mechanical. Limits and current pricing live in
`references/cloudflare-primitives.md`.
