# ADR-0011 — CI runs the cheap half, honestly; deploys are scripted and manual

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 4 — mechanism
> **Scope:** pre-decided for the Cloudflare+Neon stack (production-port skill seed). Diverge by superseding with a new ADR and a §2 row — never by editing this one.

## Decision
CI: docs checks, config traps, lint, architecture, dead code, typecheck, unit tests, gate verification — no DB, no e2e, and the workflow says so. Deploys: `npm run deploy` / `deploy:demo` (check → build → wrangler deploy, env chosen at build time), run deliberately from a machine.

## Alternatives declined
Pretend-coverage CI (a service container can come when it earns its keep); auto-deploy on merge (a solo project gains nothing and loses the pre-deploy full `check`).

## Consequences
The full `npm run check` (with DB + e2e) runs locally before every deploy by construction — it is the deploy script's first command.
