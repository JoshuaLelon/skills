# ADR-0006 — Tests pin confirmed flows; four levels by environment need

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 4 — mechanism
> **Constrained by:** —
> **Enforced by:** ast-grep:no-testid-locator, depcruise:no-test-in-prod
> **Applies to:** any
> **Scope:** pre-decided for the Cloudflare+Neon stack (production-port skill seed). Diverge by superseding with a new ADR and a §2 row — never by editing this one.

## Decision
A test pins a flow after it has been walked and confirmed (or a bug after it bit) — never speculatively. Four levels distinguished by what they navigate: unit (node), component (real Chromium), integration (server+db, no browser), e2e (everything). Role/name locators; owner-scoped isolation instead of DB resets; one seeder shared with production onboarding.

## Alternatives declined
Spec-first e2e (superseded in the source repo — speculative tests churn during active UI work); jsdom (silently lacks real APIs); per-test DB resets (owner scoping makes parallelism itself the isolation regression test).

## Consequences
Locator and naming rules are gated. Coverage thresholds are gated OUT.
