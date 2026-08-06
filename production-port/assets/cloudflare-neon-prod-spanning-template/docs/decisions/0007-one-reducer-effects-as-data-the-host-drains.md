# ADR-0007 — One reducer, effects as data, the host drains

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 3 — architecture
> **Scope:** pre-decided for the Cloudflare+Neon stack (production-port skill seed). Diverge by superseding with a new ADR and a §2 row — never by editing this one.

## Decision
Client state lives in one pure reducer; actions carry data, never closures; effects are described in state (`_fx`) and executed by the single host module, which is the only file touching both store and framework. Replay equality is asserted continuously in dev.

## Alternatives declined
Effect execution inside the reducer or components (unportable, unreplayable); module-level mutable state (invisible to replay; burns ids under StrictMode); external state libraries (the reducer + loaders already cover it — ADR-0003).

## Consequences
The store ports unedited, as proven in the source repo. Purity is gated (ast-grep + depcruise); the invariants ship in the host template.
