---
name: production-port
description: Checklist and deterministic tooling for taking a finished prototype to production — strip the harness, port to the real stack, stand up database/environments/tests/static analysis/docs, and deploy. Use when shipping a prototype to production, setting up local dev + staging + prod environments, adding databases or migrations to a ported app, standing up static analysis (biome, oxlint, ast-grep, dependency-cruiser, knip), or setting up a documentation system. Triggers on: ship to production, prototype to production, production port, staging, deploy checklist, set up database, migrations, Neon, wrangler, drizzle, static analysis, lefthook, docs system.
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
(0001–0013: CF+Neon+Hyperdrive, Drizzle, RR8, sessions, injectable clock,
test levels, effects-as-data, the error taxonomy, single-door logging, schema
conventions, cheap-half CI, pre-drawn seams, the walking skeleton) plus the code those ADRs promise (`lib/log.ts`,
`lib/errors.ts`, `<ScreenError>`). `references/architecture.md` is the
coordination map — every decision names what it exists for and what depends on
it. The architecture conversation is "where do you diverge?", answered as a
superseding ADR + a §2 row — never a blank page and never drift.

## Checkpoints — stop and ask

1. **Stack choice** (Phase 1) — the ADR seed assumes React Router + Cloudflare
   + Neon (the proven path); confirm, or prune the seed: **pruning = deleting
   the inapplicable ADR files AND their gates in the same commit** (verify-gates'
   coverage pre-pass keeps that honest); numbers are never reused.
2. **Anything you would *reconceive* rather than map during the port** — the
   app may be right and the prototype stale; only the owner settles it.
3. **Going live** — first prod deploy, first prod data, DNS. And separately,
   **going multi-tenant**: shipping to users beyond the author re-opens
   ADR-0001's storage fork (DO-per-user vs hardened owner-scoping) as a
   scheduled re-evaluation — the ADR carries the criteria.
4. **Any schema change touching existing rows** — and remember: **migrate code
   before data.** Deploy new code to every consumer before migrating shared
   data, or old code spawns malformed rows against the new shape.

## Phase 1 — Start from the skeleton; port into it

**The app begins as a copy of the spanning template** (ADR-0013) — a complete,
execution-verified application, not a scaffold: `npm run check` exits 0 in it,
and it has deployed live (worker → Hyperdrive → Neon, wide events in Workers
Logs). Every convention has a running exemplar (`note`) one file away. The
prototype repo is NOT transformed — it survives untouched as the fidelity
audit's reference side (its `prototype` tag).

**Verify the prototype's exit acts** (prototyping Phase 7's job, not yours):
the `prototype` tag exists, the strip commit landed. The port script refuses
without them.

```sh
cp -R <skill-dir>/assets/cloudflare-neon-prod-spanning-template <app>
cd <app> && node scripts/rename-app.mjs <app>   # kills every template identity;
                                               # config-traps' sentinel check fails until run
npm install && git init && npx lefthook install
cp .dev.vars.example .dev.vars
npm run db:up && npm run db:migrate
npm run check          # GREEN BEFORE ANY PORT WORK — red here is template rot:
                       # fix it in the skill's copy, every future app inherits it
node scripts/port-from-prototype.mjs --from <prototype-repo>
```

The script carries the portable set deterministically: level docs and
`src/fixtures/` land in place (they continue, never restart); store, screens,
components, and flows land in **`_port/` staging** (files byte-identical to
the template's shared set — primitives, host, ScreenError — are skipped
outright), which is excluded from
tsc, the gate, knip, biome, and playwright — so **check stays green throughout
the port**; there is no red-hooks transition to survive.

**The mapping loop**, one prototype feature at a time, each onto the
exemplar's worked pattern: fixture interfaces → schema (the notes table shows
the shape) → seeder → reducer cases merged into the template's store (the
template host stays — it is the SSR-adapted one) → each screen MOVED from
staging (`clientLoader` → `loader` inside `guarded()`, accessor import → the
query module — same signatures; the prototype runs the same framework in SPA
mode, so nothing else changes) and routed → each flow test moved from staging
and re-pointed. Delete from
`_port/` as you map; delete the note exemplar once its pattern has a real
follower.

**Definition of done — mechanically checked by `npm run port:status`:**
staging empty, exemplar deleted, and the prototype's locked flows green
against this app. That last one is the port's proof.

The port history's lesson still holds: the real work of a port is un-doing
prototype shortcuts, and this prototype was denied the expensive ones — so the
port is the mapping loop and nothing else. The store crosses as cases, not as
plumbing, because the plumbing is already here, proven.

## Phase 2 — Toolify

**On the template path this phase is already done** — the skeleton ships every
config, script, gate, doc, and hook below, pre-verified. What remains here:
re-run `npm run verify:gates` after any rule you add, stamp the stack table
(`node scripts/export-stack.mjs --stamp`), and work `npm run docs:fillins`
with the user.

For a stack that diverged from the template (checkpoint 1),
`sh <skill-dir>/assets/scaffold-prod.sh` remains the à-la-carte layering: it
copies the configs and scripts below, installs the toolchain, formats once,
installs lefthook, generates `llms.txt`, and ends by running `verify:gates` —
refusing to finish until every gate has proven it can fail.

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

The template ships the whole apparatus (compose with the pinned image,
drizzle config, the `db:*` scripts, a working `seedFixture`, migration 0000
with the exemplar tables). The judgment half: extend `src/db/schema.ts` from
the fixture interfaces per ADR-0010 (the notes table is the worked example),
extend `seedFixture` from the entity arrays, `drizzle-kit generate` per change,
and the per-screen accessor→loader swap (same signatures; ADR-0012).

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
- **Choosing a Cloudflare primitive** — the seed uses Hyperdrive and nothing
  else, which is a default, not a prohibition. The selection rules are ADRs:
  storage (0014), deferred work (0015), observability depth (0016), model
  access (0022), edge request handling (0023) — each answering "if you need X,
  reach for Y" rather than naming one blessed choice.
  `references/cloudflare-primitives.md` is the lookup table behind them: what
  each primitive is, the condition that should stop you, and the limits that
  actually decide. Its numbers are dated — re-verify before committing.
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
`vars` **and bindings**, never a bare `wrangler deploy` — in
`references/environments.md`. Release mechanics around the deploy itself
(preview URLs, gradual rollout, rollback) are ADR-0020.
`.dev.vars.example` (shipped) is the manifest: every var the app reads, listed,
each with its failure mode.

## Phase 5 — Tests

The locked flow tests port with their role/name locators. The production layers
and their determinism rules — the clock ladder, owner-scoped isolation instead
of DB resets, the two-trigger rule for new e2e, vitest project split — in
`references/testing.md`.

## Phase 6 — Post-port review (the audit, dissolved)

The screenshot-diff audit pantogen needed existed to measure prototype↔app
divergence that this system prevents from opening: *absent* is caught by
`port:status`, *broken* by the carried flows, *dressed-differently* is
impossible (same files), *reconceived* is checkpoint 2. Two manual residues:
**diff `routes.ts` against the prototype's** — a route only in the app is
built-but-never-designed, which is governance to decide, not drift to measure —
and **walk the motion by hand**, the one thing the tests under-sample. The
prototype repo then retires (keep it archived; its tag stays citable).

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

## Maintaining this skill

The spanning template shares a byte-identical runtime set with the prototyping
skill's template (`assets/check-parity.mjs` lists the pairs and verifies them —
self-locating, run from anywhere). Any edit to a shared file lands in both
copies in the same commit, and template fixes discovered in real apps flow up
here so every future app inherits them.
