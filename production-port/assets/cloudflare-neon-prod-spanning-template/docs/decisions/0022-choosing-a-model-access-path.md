# ADR-0022 — Choosing a model-access path: the seam is decided, the route to the model is not

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 3 — architecture
> **Scope:** decides how the app reaches a model. ADR-0012 decided the *seam*
> (`src/lib/ai/`, one door, provider DTOs stop there) and that is unchanged —
> everything here happens behind that door. Vector storage is ADR-0014.

## Decision

**Keep the capability seam; choose the route to the model by what you need from
it.** Because the seam exists, this choice is reversible and local — that is
the property it was built to buy.

| If you need… | Route |
|---|---|
| a specific frontier model, best quality, simplest path | **provider SDK direct** (today: `@anthropic-ai/sdk`) |
| caching, retries, fallback between providers, spend and latency visibility, one place to rate-limit | **AI Gateway** in front of that SDK |
| open models on Cloudflare's GPUs, no third-party key, per-request billing | **Workers AI** |
| embeddings generated next to your data | **Workers AI** (feeds `pgvector` or Vectorize — ADR-0014) |
| managed retrieval-augmented search over your corpus | **AI Search** |
| stateful, long-running, tool-using agents | **Agents SDK** (a Durable Object underneath) |

**The recommended default for this app is provider SDK behind AI Gateway.**
It is close to a base-URL change at the SDK's construction site — inside the
seam, invisible to callers — and it converts the model call from an unobserved
outbound `fetch` into something with caching, retry, fallback and a cost number
attached.

**Correction to ADR-0001.** That ADR lists "AI gateway" among the things
Cloudflare is used for. It is not used, and never was — the app calls Anthropic
directly. This ADR is where that becomes true or is dropped; the doctrine
should not keep claiming a component that does not exist.

## Context

The seed talks to Anthropic through the official SDK, dynamically imported, with
an echo generator when no key is present. Behind a clean seam, that is a good
default and a fine place to stay.

What it currently has no answer for: a provider outage (no fallback), a repeated
identical prompt (no cache), a spend question (no number), or a runaway loop (no
rate limit). Those are the four things a gateway is for, and none of them
require touching a caller.

Two facts constrain the choice. **Workers AI is not a substitute for frontier
models** — it runs open models, so "use Workers AI instead" is a capability
decision, not a hosting one. And **the seam is what makes all of this cheap**:
because `GeneratedText` crosses the door and the provider DTO does not, swapping
routes is a change in one file.

There is also a live correctness issue here worth naming: **the seam is
currently dead code.** `makeTextGenerator` is not imported anywhere, `knip`
flags `@anthropic-ai/sdk` as an unused dependency, and `npm run lint:dead`
therefore fails. Either wire the seam to a real capability or delete it — an
exemplar that fails the repo's own gate teaches the wrong lesson.

## Alternatives declined

- **Wrapping the provider SDK in our own abstraction layer** — ADR-0012 already
  declined this: the adapter models the product capability, not the SDK.
- **Workers AI as the default** — different model class. Choose it for
  embeddings, classification, and cost-sensitive bulk work; not as a drop-in for
  a frontier model.
- **Agents SDK for a request/response generation call** — a Durable Object per
  conversation is the right answer for stateful agents and heavy machinery for
  "summarize this note".
- **A second provider for redundancy, wired by hand** — that is what gateway
  fallback does; hand-rolling it puts retry logic in the seam.

## Consequences

Adopting AI Gateway adds one binding/base URL and a place where prompts and
completions are logged — decide the retention and PII posture explicitly before
turning logging on, because the seam carries user content.

Caching model responses changes behaviour, not just cost: identical prompts
return identical outputs. That is usually desirable and occasionally wrong
(anything meant to vary). Cache at the gateway only where the capability is
genuinely deterministic.

Whatever route is chosen, the call is an outbound subrequest inside a request
that is already making 4–5 database round trips (ADR-0019). If a model call
lands on a user-facing path, it dominates that path's latency — that is a
`waitUntil`-or-Queue question (ADR-0015), not a model question.

Enforced: `one-door-model` (ast-grep) already fails any provider import outside
`src/lib/ai/`. That rule is what keeps this decision reversible.
