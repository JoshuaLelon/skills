# ADR-0003 — React Router 8, framework mode

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 4 — mechanism
> **Scope:** pre-decided for the Cloudflare+Neon stack (production-port skill seed). Diverge by superseding with a new ADR and a §2 row — never by editing this one.

## Decision
RR8 framework mode: typed routes, loaders instead of client fetching, actions as the mutation door, per-route error boundaries. `appDirectory: 'src'` so the ported layout and every gate glob survive.

## Alternatives declined
Next.js (different platform center of gravity); SPA-only vite (loses loaders/boundaries, the two things the architecture leans on).

## Consequences
Loaders are the seam the prototype's accessors become. Route types come from generated `./+types/*`. The Remix import surface is gated out.
