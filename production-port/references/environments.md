# Environments: local / demo / prod

| | compute | database | config | lifetime |
| --- | --- | --- | --- | --- |
| **local** | `npm run dev` | Docker Postgres (image pinned to Neon's exact version + extension version) | `.dev.vars` (gitignored, never deploys) | permanent |
| **demo** | separate named Worker | **Neon branch off prod main** — copy-on-write, throwaway, cannot merge back | `env.demo` block + `wrangler secret put --env demo` | per-experiment; delete the branch on abandon |
| **prod** | main Worker | Neon main | top-level `vars` + `wrangler secret put` | — |

Demo is a rehearsal environment, not a pre-prod gate: if a feature graduates,
the code merges and the branch's data is discarded. Say that out loud when
creating one so nobody builds real state there.

## Provisioning — the exact commands, in order

```sh
# Neon (or use the Neon MCP tools: create_branch / reset_from_parent / get_connection_string)
npx neon@latest init                       # or: neonctl projects create
# → note three strings: direct (Hyperdrive + migrations), -pooler (external)

# Cloudflare
env -u CF_API_TOKEN npx wrangler hyperdrive create app-db --connection-string="<DIRECT string>"
# → paste the returned id into wrangler.jsonc hyperdrive[0].id
env -u CF_API_TOKEN npx wrangler secret put SESSION_SECRET
env -u CF_API_TOKEN npx wrangler secret put DATABASE_URL          # -pooler, for anything non-Hyperdrive
# per env:                    … secret put <NAME> --env demo
# (~20s propagation; a probe right after can flap — expected)

# Neon hardening (once, on main)
#   protect main (Console), set restore window 7d, then:
#   CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
#   ALTER ROLE app SET statement_timeout = '30s';
```

Demo branch lifecycle: `create_branch` from main (TTL 1 day for previews;
none for the standing demo), refresh via `reset_from_parent` — both are Neon
MCP calls.

## The Cloudflare footguns — enforce, don't document

Each of these was documented in prose three times in the source repo and still
depended on humans remembering. Encode them as the *only* paths that exist:

- **Environment is selected at BUILD time, not deploy time.** Under
  `@cloudflare/vite-plugin`, `wrangler deploy` reads the flattened config the
  build *generated* — no `env` blocks survive — so `wrangler deploy --env demo`
  matches nothing, falls back to top-level, and **silently deploys to
  production with exit 0.** The only deploy commands that may exist:

  ```json
  "deploy":      "npm run check && npm run build && wrangler deploy",
  "deploy:demo": "npm run check && CLOUDFLARE_ENV=demo npm run build && wrangler deploy"
  ```

  Never run bare `wrangler deploy` — it ships whatever is in `build/`, which is
  the last thing built, not the current source.
- **`vars` does NOT inherit into environments.** An env block's `vars`
  *replaces* the top level. Every var must be repeated per env or it silently
  vanishes there (the observed symptom was a 404ing route on demo only).
  `compatibility_date` DOES inherit and must stay top-level-only — a demo on a
  different compat date is a demo of different behaviour.
- **Secrets vs vars vs test-only:** secret → `wrangler secret put` (per env);
  non-secret deployable → `vars`; test-only (`TEST_CONTEXT`, dev-user bypass) →
  `.dev.vars` only, gated to fail closed when `ENVIRONMENT=production`.
- **Secret propagation is ~20s.** A probe right after `secret put` can flap
  between old and new values across instances — expected, not a bug.
- If a stray `CF_API_TOKEN` lives in the shell env, wrangler prefers it over
  the OAuth session — prefix `env -u CF_API_TOKEN` or delete the variable.

## Database connections (ADR-0001 — Neon's current recommendation)

**Hyperdrive is the Workers path**: a `hyperdrive` binding carrying the
**direct (non-pooler)** Neon string — Hyperdrive does the pooling, so giving it
the `-pooler` string double-pools. `pg` + `drizzle-orm/node-postgres` on top.
The `-pooler` string serves processes outside Workers; the bare direct string
is for `drizzle-kit` migrations only. Neon settings: protected `main`,
preview/demo branches created with a 1-day TTL, demo refresh via
`reset_from_parent`, autoscale 0.25→2 CU, scale-to-zero on, restore window
7 days, `pg_stat_statements` on, and an explicit per-role
`ALTER ROLE app SET statement_timeout = '30s'` — Neon sets none by default.

## Database lifecycle

- Everyday local: `npm run db:push` (guarded — refuses non-local hosts without
  `ALLOW_REMOTE_DB_PUSH=1`).
- Real path, always, for anything remote: `npx drizzle-kit generate` →
  review the SQL → commit → `npm run db:migrate`.
- `db:reset` = `docker compose down -v && db:up && db:migrate` — through the
  migrations, never a parallel schema path.
- Extension DDL (`CREATE EXTENSION`) drizzle can't emit goes in migration 0000
  by hand.
- **Migrate code before data**: with multiple consumers of a shared store,
  deploy the new code everywhere first, then migrate — old code writing the old
  shape into a migrated store creates duplicates and orphans.

## Third-party per-environment resources

Anything with exactly one callback/webhook URL (a Slack app, an OAuth app)
needs one instance per environment — a prod app and a demo app — because the
URL cannot point two places. Budget for it at setup, not when the collision
surfaces.
