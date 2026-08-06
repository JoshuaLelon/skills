---
name: production-port
description: Checklist and deterministic tooling for taking a finished prototype to production — strip the harness, port to the real stack, stand up database/environments/tests/static analysis/docs, audit fidelity against the prototype, and deploy. Use when shipping a prototype to production, setting up local dev + staging + prod environments, adding databases or migrations to a ported app, standing up static analysis (biome, oxlint, ast-grep, dependency-cruiser, knip), or setting up a documentation system. Triggers on: ship to production, prototype to production, production port, staging, deploy checklist, set up database, migrations, Neon, wrangler, drizzle, static analysis, lefthook, docs system.
---

# Production port: prototype → shipped

Entry criteria — the prototyping skill's exit state: gate green, flows locked as
e2e tests, fixture loader-shaped, notes-as-data current. If those don't hold,
finish the prototype first; every phase below leans on them.

**The meta-rule, learned from a repo that violated it everywhere:** *no gate
ships without a demonstration that it fails.* Pantogen shipped two
dependency-cruiser rules dead on arrival, an ast-grep set that never scanned a
`.tsx` file, and a grep linter that was 100% false positives — all green, all
enforcing nothing, all discovered only by later audit. Here the rule is
executable: `npm run verify:gates` plants a violation for every gate and asserts
it fires. **A new rule and its mutation land in the same commit.** (It caught its
first dead gate during this skill's own smoke test — a depcruise `exclude` that
silently removed the module its rule targeted.)

The second lesson from the same audit: prose is not enforcement. The worst
footguns were documented three times and enforced zero times; the fix that
worked was an npm script. When you find yourself writing a warning, write a
script or a gate instead.

**The architecture is pre-decided.** The scaffold copies an accepted ADR seed
(0001–0012: CF+Neon+Hyperdrive, Drizzle, RR8, sessions, injectable clock,
test levels, effects-as-data, the error taxonomy, single-door logging, schema
conventions, cheap-half CI, pre-drawn seams) plus the code those ADRs promise (`lib/log.ts`,
`lib/errors.ts`, `<ScreenError>`). `references/architecture.md` is the
coordination map — every decision names what it exists for and what depends on
it. The architecture conversation is "where do you diverge?", answered as a
superseding ADR + a §2 row — never a blank page and never drift.

## Checkpoints — stop and ask

1. **Stack choice** (Phase 1) — the ADR seed assumes React Router + Cloudflare
   + Neon (the proven path); confirm, or prune the seed: **pruning = deleting
   the inapplicable ADR files AND their gates in the same commit** (verify-gates'
   coverage pre-pass keeps that honest); numbers are never reused.
2. **Anything the fidelity audit grades *reconceived*** — the app may be right
   and the prototype stale; only the owner settles it.
3. **Going live** — first prod deploy, first prod data, DNS. And separately,
   **going multi-tenant**: shipping to users beyond the author re-opens
   ADR-0001's storage fork (DO-per-user vs hardened owner-scoping) as a
   scheduled re-evaluation — the ADR carries the criteria.
4. **Any schema change touching existing rows** — and remember: **migrate code
   before data.** Deploy new code to every consumer before migrating shared
   data, or old code spawns malformed rows against the new shape.

## Phase 1 — Strip and port

**The port is an IN-PLACE transformation of the prototype's repo** — same git
history, same remote. This is load-bearing, not stylistic: the fidelity audit
drives the `prototype` tag via a worktree, scaffold-prod's guards preserve
prototype-era files, and the hook/scripts history carries. Never a fresh repo.

**Verify (don't redo) the prototyping skill's exit acts:** the `prototype` tag
exists and the strip commit landed — both are prototyping Phase 7's job. If
missing, do them now, once.

**Porting mode:** between here and the end of Phase 3 the tree is legitimately
mid-transformation — commit with `--no-verify` (or `LEFTHOOK=0`), saying so in
the message. **The transition's exit criterion is `npm run check` green**;
loosening a gate to get there is the one forbidden move.

### The port recipe (Vite → React Router 8), file by file

| fate | files |
| --- | --- |
| **dies** | `src/main.tsx`, `src/App.tsx`, `src/App.css`, `index.html`, `vite.config.ts` (RR8's `@react-router/dev` owns the build) |
| **born** | `react-router.config.ts` (`appDirectory: 'src'`, `ssr: true`); `src/routes.ts` (explicit routes — include `/__states` → `states.tsx`, which has a default export for exactly this); `src/root.tsx` (layout + root ErrorBoundary + store provider); `src/entry.client.tsx` — **must contain `<StrictMode>`**, the gate's strict-mode rule watches both entry names; the worker entry; `wrangler.jsonc` copied from `<skill-dir>/assets/configs/wrangler-template.jsonc` |
| **carries verbatim** | `docs/` (level docs continue, never restart); `e2e/` + `helpers.ts`; `src/fixtures/` — `now.ts`, `entities/`, `view/` (view stays: it is UI option data; "becomes nothing" means *no table*); `src/store/`; `src/components/`; `src/screens/`; `src/states.tsx`; `scripts/gate.mjs` + `strip-harness.mjs` |
| **carries edited** | `src/host.tsx` — **client-only**: the module-level store is a browser singleton; mount its provider from `root.tsx`'s client side, never import it in server-only code. `fixtures/accessors.ts` waits here — accessors become loader queries with the same signatures per-screen in Phase 3, not now |
| **rewired** | `package.json`: deps via `node <skill-dir>/assets/scripts/export-stack.mjs --from ~/workspace/pantogen --apply` (deliberately reaching one phase ahead — the port needs the dep set before Phase 2 ships the script into the repo); `dev`/`build` → `react-router dev`/`build` (Playwright's `webServer: npm run dev` then keeps working untouched); `gate` → `"react-router typegen && node scripts/gate.mjs && tsc -b"` so generated route types exist before every typecheck; **re-establish Tailwind** (`tailwindcss` + `@tailwindcss/vite` in the RR8 vite config — the prototype scaffold wired it and two carried gate rules presuppose it) |

**Definition of done for Phase 1:** the app boots under `npm run dev`, and
`npm run gate && npx playwright test` is green — the locked flows passing
against the RR8 app is the port's proof. The gate now **fails on an empty
scan**, so a moved tree screams instead of greening.

The port history's lesson: the real work of a port is *un-doing prototype
shortcuts* — but this prototype was denied the three expensive ones
(host-mutated effects, dispatch-based navigation, module-level globals), so the
port is the table above and little else. The store crosses unedited if replay
equality held.

## Phase 2 — Toolify (deterministic)

```sh
sh <skill-dir>/assets/scaffold-prod.sh
```

Stack-agnostic: layers the production tooling onto the ported repo. It copies
the configs and scripts below, installs biome + oxlint + ast-grep +
dependency-cruiser + knip + lefthook, runs a one-time `biome check --write .`
(also erasing strip-harness's blank lines), replaces the prototype's hand-rolled
hook with lefthook, generates `llms.txt`, and ends by running `verify:gates` —
it refuses to call itself done until every gate has proven it can fail.

| layer | tool | why it earned its place |
| --- | --- | --- |
| format + baseline lint | biome (stock preset) | best value-per-line measured; near-zero maintenance |
| bug-class lint | oxlint | catches what biome doesn't (floating promises, redeclares) — config uses directory ignores, never per-file overrides (those rotted within 3 days) |
| decision enforcement | ast-grep | encodes ADRs as patterns — **write a Tsx twin for any rule that must reach `.tsx`** (the grammars are exclusive), and **never match string literals with `pattern:`** (quote-style-exact; use `kind` + `regex` — verify-gates caught a single-quoted pattern missing every double-quoted import). Ships: domain purity, locator discipline, owner-from-params, React legacy (`forwardRef`/`useContext`), Remix imports |
| module boundaries | dependency-cruiser | the only real import-graph analysis; every rule mutation-tested |
| dead code | knip | proved value day one elsewhere; expect noise until screens are wired |
| orchestration | lefthook | staged-file scoping; the full hook list including the prototype gate and flow suite |

Deliberately dropped, with evidence: **jscpd** (days of running caught only
marginal CSS duplication), **per-file lint overrides** (silently pointed at
nonexistent files), **grep-based custom linters** (pantogen's was deleted at
100% false-positive rate — ast-grep is the structured replacement). The
prototype's `gate.mjs` keeps running until each of its rules is superseded by a
mutation-tested equivalent — redundancy is cheap, dead gates are not.

The scaffold also ships the knowledge layer — **distilled from the epic
playbooks, never vendored** (4,700 lines read once; only what changes an
agent's output ships):

- **`AGENTS.md` from a template** — the training-data landmines prefilled per
  stack area (React 19, RR8, data/auth, Zod 4, TS 7, Vitest 4, Cloudflare),
  app-specifics as `[FILL:]` markers, and an enforcement column that never
  credits a rule with more than it catches.
- **`references/react-patterns.md`** — the judgment layer (composition before
  context, forms/validation/uploads, auth hardening, Prisma 7 gotchas), loaded
  when building screens, not always.
- The playbook masters stay at `~/workspace/epic-*.md` as the source to
  re-distill from when they update.
- **The battle-tested dependency set, exported not hand-copied:**
  `node scripts/export-stack.mjs --from ~/workspace/pantogen --apply` installs
  the exact version set proven to work together (the point is the *set*, not
  freshness — upgrade in the source repo first), and `--stamp` generates the
  AGENTS.md §1 version table from `package.json` so it can never confabulate.

## Phase 3 — Database

The fixture was designed to become this: interfaces → drizzle schema (they are
already the DTOs), entity arrays → seed rows, accessors → queries with the same
signatures.

**Deterministic setup first** — templates ship with this skill:

```sh
cp <skill-dir>/assets/configs/docker-compose.yml .    # the image pin IS the point
cp <skill-dir>/assets/configs/drizzle.config.ts .
cp <skill-dir>/assets/template-prod/src/db/seed.ts src/db/seed.ts
npm i drizzle-orm pg && npm i -D drizzle-kit @types/pg
npm pkg set \
  scripts.db:up="docker compose up -d --wait" \
  scripts.db:down="docker compose down" \
  scripts.db:migrate="drizzle-kit migrate" \
  scripts.db:reset="docker compose down -v && npm run db:up && npm run db:migrate"
```

Then the judgment half — the schema from fixture interfaces per ADR-0010,
`seedFixture` filled from the entity arrays, and the per-screen
accessor→loader swap (same signatures; ADR-0012's seam table).

- **One seeder, shared.** Tests and production onboarding call the same
  `seedFixture(db, owner, now)` — `now` a required parameter, everything
  relative to it. Two seeders drift; this one can't.
- **`generate` + `migrate` from the first schema.** `push` is local-scratch
  only, enforced by `scripts/db-push-guard.mjs` (`npm run db:push`) — born from
  a real incident where push against a branch with rows produced an interactive
  truncate prompt that `--force` does not cover.
- **Pin the local Postgres image to exactly what Neon serves** (image tag with
  version and extension version) — a floating tag drifted majors once and
  nothing noticed.
- `db:reset` = compose down -v, up, **migrate** — reset through real
  migrations, never a parallel path.
- `owner` columns exist since fixture rule 6; every query scopes by owner from
  day one — this is also the test-isolation strategy (Phase 5).

## Tooling at hand — load it, don't recall it

- **Cloudflare work** (wrangler commands, Workers config, Hyperdrive, DOs):
  load the `wrangler` / `cloudflare` / `workers-best-practices` skills first —
  they bias to current docs over training data, which this stack churns past.
- **Neon operations**: the `mcp__Neon__*` tools do branches
  (`create_branch`, `reset_from_parent`), connection strings, slow queries
  (`list_slow_queries`), and SQL directly — use them instead of hand-running
  psql for branch/demo workflows.
- Provisioning commands (Hyperdrive create, secret puts, branch setup) are
  written out in `references/environments.md` — copy, don't reconstruct.

## Phase 4 — Environments

Three tiers: **local** (Docker), **demo** (Neon branch off prod, copy-on-write,
throwaway, separate Worker), **prod** (Neon main). Full matrix, deploy scripts,
and the Cloudflare footguns — `CLOUDFLARE_ENV` at *build* time, non-inheriting
`vars`, never a bare `wrangler deploy` — in `references/environments.md`.
`.dev.vars.example` (shipped) is the manifest: every var the app reads, listed,
each with its failure mode.

## Phase 5 — Tests

The locked flow tests port with their role/name locators. The production layers
and their determinism rules — the clock ladder, owner-scoped isolation instead
of DB resets, the two-trigger rule for new e2e, vitest project split — in
`references/testing.md`.

## Phase 6 — Fidelity audit

The prototype is the specification; audit the shipped app against it state by
state, once, now. Method is the prototyping skill's
`references/port-audit.md`; tooling and the notes-driven recipe generation that
makes it cheap here: `references/fidelity-audit.md`. Expect it to find real
bugs — reading the app against its spec for the first time always does.

## Phase 7 — Docs system (minimal)

`scaffold-prod.sh` already created it: the five-folder lifecycle taxonomy, the
level docs carried forward from the prototype (intent → laws → designs),
`llms.txt` generated in the llmstxt.org format (`docs:index` — H1, blockquote
summary, H2 sections of `[name](path): note`, prose above the first H2
preserved), and co-change + ADR-citation checking (`docs:check`, pre-commit).

Two more mechanisms, run at scaffold and on demand:

- **`docs:fillins`** — every `[FILL: …]` marker across docs/, AGENTS.md and
  llms.txt as a line-referenced checklist. Work through it with the user, top
  level first. A report, not a gate — a gate here would just get bypassed.
- **`check-llmstxt-spec.mjs`** — hashes llmstxt.org against the pin this
  generator was written against. On a change it prints the update procedure,
  which explicitly includes updating **the skill's copy** of `docs-index.mjs`
  and re-pinning — the skill is the source; fixes flow up. Offline is a note,
  never a failure.

What pantogen ran beyond this, what it cost, and the rule for when a docs
mechanism may graduate to gating: `references/docs-system.md`.

## Phase 8 — CI and deploy

- CI runs the cheap half honestly: docs, config traps, lint, arch, dead,
  typecheck, **unit (`vitest run`)**, `verify:gates` — no DB, no e2e, and it
  says so. Pretending coverage is worse than scoping it.
- Deploys are npm scripts (`deploy`, `deploy:demo`), each `check → build →
  deploy`, run deliberately from a machine. Automate promotion later, when a
  second maintainer exists.
- The full `npm run check` runs before every deploy by construction — it is the
  first thing in the deploy script, not a separate discipline.
