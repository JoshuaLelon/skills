# ADR-0004 — Sessions in HTTP-only cookies; auth checks server-side

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 3 — architecture
> **Constrained by:** 0001, 0010
> **Enforced by:** depcruise:no-bcrypt
> **Applies to:** any
> **Scope:** pre-decided for the Cloudflare+Neon stack (production-port skill seed). Diverge by superseding with a new ADR and a §2 row — never by editing this one.

## Decision
Auth state lives in HTTP-only cookie sessions backed by server-side records. Every protected loader/action re-checks authorization server-side — hiding UI is presentation, not enforcement. Passwords, if any, hash with Argon2id (m=19456, t=2, p=1).

## Alternatives declined
JWT in localStorage (the training-data default; XSS-readable, unrevocable); auth-as-a-service by default (auth is app-domain logic — delegating is a legitimate §2 divergence, not the default).

## Consequences
bcrypt is gated out. A session helper is the only door to "who is this"; the owner column (ADR-0010) references it.
