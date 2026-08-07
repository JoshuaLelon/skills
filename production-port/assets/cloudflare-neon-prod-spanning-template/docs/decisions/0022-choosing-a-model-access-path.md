# ADR-0022 — Model access: the seam is decided, the route to the model is not

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 3 — architecture
> **Constrained by:** 0012
> **Enforced by:** ast-grep:one-door-model
> **Supersedes:** 0001#ai-gateway
> **Scope:** decides how the app reaches a model. ADR-0012 decided the *seam*
> (`src/lib/ai/`, one door, provider DTOs stop there) and that is unchanged —
> everything here happens behind that door. Vector storage is ADR-0014.

## Decision

**Keep the capability seam; choose the route to the model by what you need from
it.** Because the seam exists, this choice is reversible and local — that is the
property it was built to buy. The routes (provider SDK, AI Gateway, Workers AI,
AI Search, Agents SDK) and what each is for are
`../reference/cloudflare-primitives.md`.

**The recommended default is provider SDK behind AI Gateway.** It is close to a
base-URL change at the SDK's construction site — inside the seam, invisible to
callers — and it converts the model call from an unobserved outbound `fetch`
into something with caching, retry, fallback and a cost number attached.

**Correction to ADR-0001.** That ADR lists "AI gateway" among the things
Cloudflare is used for. It is not used, and never was — the app calls Anthropic
directly. This ADR is where that becomes true or is dropped; the doctrine should
not keep claiming a component that does not exist.

## Context

The seed talks to Anthropic through the official SDK, dynamically imported, with
an echo generator when no key is present. Behind a clean seam that is a good
default and a fine place to stay.

What it has no answer for: a provider outage (no fallback), a repeated identical
prompt (no cache), a spend question (no number), a runaway loop (no rate limit).
Those are the four things a gateway is for, and none require touching a caller.

**Workers AI is not a substitute for frontier models** — it runs open models, so
"use Workers AI instead" is a capability decision, not a hosting one.

## Alternatives declined

- **Wrapping the provider SDK in our own abstraction layer** — ADR-0012 already
  declined this: the adapter models the product capability, not the SDK.
- **Workers AI as the default** — different model class. Choose it for
  embeddings, classification and cost-sensitive bulk work.
- **Agents SDK for a request/response generation call** — a Durable Object per
  conversation is heavy machinery for "summarize this note".
- **A second provider for redundancy, wired by hand** — that is what gateway
  fallback does; hand-rolling it puts retry logic in the seam.

## Consequences

Adopting AI Gateway adds a place where prompts and completions are logged —
decide the retention and PII posture explicitly before turning logging on,
because the seam carries user content.

Caching model responses changes behaviour, not just cost: identical prompts
return identical outputs. Cache only where the capability is genuinely
deterministic.

A model call is an outbound subrequest inside a request already making several
database round trips (ADR-0019). On a user-facing path it dominates latency —
that is a `waitUntil`-or-Queue question (ADR-0015), not a model question.
