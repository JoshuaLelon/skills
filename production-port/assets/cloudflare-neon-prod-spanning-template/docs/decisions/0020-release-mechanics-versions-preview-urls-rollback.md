# ADR-0020 — Release mechanics: a deploy you can preview, split, and undo

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 4 — mechanism
> **Constrained by:** 0011
> **Enforced by:** none — judgement
> **Applies to:** cloudflare
> **Supersedes:** 0011#release
> **Scope:** decides what happens around `wrangler deploy`. ADR-0011 decided
> deploys are scripted and manual, not CI-triggered, and that still holds —
> everything here runs from the same machine, by hand.

## Decision

**Upload a version, look at it, then promote it. Keep the ability to undo.**

| Need | Mechanism |
|---|---|
| see the new code running, in production conditions, without serving users | `wrangler versions upload` → **versioned preview URL** |
| a stable URL for a branch/feature others can review | **aliased preview URL** |
| ship to a fraction of traffic and watch | **gradual deployment** (percentage split, with version affinity) |
| smoke-test one specific version | **version override** |
| undo | **`wrangler rollback`** — to any of the last 100 versions |
| keep previews non-public | **Cloudflare Access** on preview URLs (one-click, reusable policies) |

**The default release for a routine change stays `npm run deploy`** — check,
build, deploy. Reach for the split-and-watch path when the change is risky: a
migration-adjacent deploy, a dependency major, anything touching auth or money.

**Take the rollback capability unconditionally.** It costs nothing, requires no
CI, and is the difference between a bad deploy being a five-minute event and an
incident.

## Context

The seed had none of this. `npm run deploy` was a single atomic swap to 100% of
traffic with **no defined way back** — recovery meant `git revert` and a full
`check → build → deploy` cycle, minutes long, under pressure, with the gates
running while production is broken.

This is not a CI question, which is why it does not disturb ADR-0011. Versions,
preview URLs, gradual rollouts and rollback are all `wrangler` subcommands run
by a human from a machine. ADR-0011 declined *auto-deploy on merge* because a
solo project gains nothing and loses the pre-deploy full `check`; none of that
reasoning applies to being able to undo.

The demo environment is a separate matter and currently a **publicly reachable
Worker** (`env.demo`) holding Neon-branch data. Cloudflare Access now protects
preview URLs and Workers in one click with reusable policies, which is the
cheapest fix for that exposure.

## Alternatives declined

- **Status quo — deploy and hope** — the recovery path is a full rebuild, and
  the failure mode is discovering that during an outage.
- **Auto-deploy on merge (Workers Builds, or GitHub Actions with a Cloudflare
  token)** — re-litigates ADR-0011 and would put Cloudflare credentials in CI,
  which today holds none. Explicitly still declined.
- **Gradual deployment for every release** — real ceremony per deploy for a
  low-traffic app where a percentage split of a small number is statistically
  meaningless. Reserve it for risky changes.
- **A staging Worker as a pre-prod gate** — `references/environments.md` is
  explicit that demo is a rehearsal environment, not a gate. Preview URLs give
  the "look at it first" property without pretending to be an environment.

## Consequences

Rollback is bounded: **the last 100 versions**, and a rollback creates a *new*
deployment of an old version rather than rewinding history.

A gradual deployment means **two versions are live at once**. Anything they
share must tolerate that — most importantly the database schema, which makes
this ADR bind to the existing rule that schema changes migrate code before data.
A rollback across a migration is not safe by default; the migration has to have
been written to be backward-compatible, or rollback is not available for that
deploy. Say which, at deploy time.

Version affinity keeps a given client on one version during a split; without it,
a user can bounce between versions mid-session.

Enforced: nothing mechanical yet. The build-time environment-selection trap
(`CLOUDFLARE_ENV=… npm run build`, never `wrangler deploy --env`) applies to
`wrangler versions upload` exactly as it does to `wrangler deploy` — the config
is flattened at build time either way.
