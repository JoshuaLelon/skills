# ADR-0005 — Time is an argument; test time comes from data first

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 3 — architecture
> **Constrained by:** —
> **Enforced by:** ast-grep:no-date-now-in-domain
> **Applies to:** any
> **Scope:** pre-decided for the Cloudflare+Neon stack (production-port skill seed). Diverge by superseding with a new ADR and a §2 row — never by editing this one.

## Decision
Domain logic takes `now` as an explicit argument; only the composition root reads the clock. Controlling time in tests follows the ladder: seed data relative to the anchor → pass `now` → `vi.setSystemTime` → `page.clock` → a prod-gated header, last, with per-test justification.

## Alternatives declined
A test header as the default lever (superseded in the source repo: data-shaped time is cheaper and less magical); frozen clocks everywhere (broke total ordering of timestamps — anchor + real elapsed time keeps `ORDER BY at` stable).

## Consequences
`Date.now()` in domain code is gated out. The fixture's `NOW` is the single anchor across fixtures, seeder, flow tests, and the fidelity audit.
