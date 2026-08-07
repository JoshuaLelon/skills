# ADR-0002 — Drizzle, not Prisma

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 4 — mechanism
> **Constrained by:** 0001
> **Enforced by:** script:db-push-guard
> **Applies to:** neon
> **Scope:** pre-decided for the Cloudflare+Neon stack (production-port skill seed). Diverge by superseding with a new ADR and a §2 row — never by editing this one.

## Decision
Drizzle ORM + `drizzle-kit generate`/`migrate`. Schema is TypeScript; migrations are reviewed SQL.

## Alternatives declined
Prisma: no first-class `vector` type, heavier runtime in workerd, and the v7 config shape churns hard against training data.

## Consequences
`push` is local-scratch only (guarded). Extension DDL lives in migration 0000 by hand. Test factories type against the schema, so renames fail at tsc.
