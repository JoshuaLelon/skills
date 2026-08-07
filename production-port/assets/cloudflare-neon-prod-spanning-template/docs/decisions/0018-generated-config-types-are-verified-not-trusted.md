# ADR-0018 — Generated config types are verified, not trusted

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 4 — mechanism
> **Constrained by:** 0001
> **Enforced by:** script:types:check, script:config:traps
> **Applies to:** cloudflare
> **Scope:** decides how `worker-configuration.d.ts` stays true. Does not decide
> route types (`react-router typegen`, already covered by `npm run gate`).

## Decision

**`wrangler types --check` runs in `npm run check` and CI. A drifted
`worker-configuration.d.ts` fails the build.** Regenerate with `npm run types`
and commit the result alongside whatever changed the config.

## Context

`worker-configuration.d.ts` is **generated from `wrangler.jsonc` but committed
to the repo**, which is the exact shape of every silent-drift bug: two artifacts
that must agree, with nothing checking that they do. Add a binding and forget to
regenerate, and the `Env` interface describes yesterday's configuration.

The consequence is worse than a stale file. `Env` is how bindings reach the app
with types attached, so **TypeScript then validates the whole app against a
lie** — `env.SOME_BINDING` type-checks against a binding that no longer exists,
or a binding you just added is invisible and gets hand-typed as `any` to make
the error go away. Every downstream check inherits the wrong premise, and none
of them can see it.

This is precisely the failure class `check-config-traps` was built for — two
places that must agree, mechanized so they cannot drift — applied to the one
generated file in the tree that had no guard. The seed shipped with no script
invoking `wrangler types` at all.

The check is a supported wrangler flag, not a hand-rolled diff:
`wrangler types --check` "checks if the generated types at the specified path
are up-to-date."

## Alternatives declined

- **A hand-rolled regenerate-and-diff script** — written first, then deleted
  when `--check` turned out to exist. Less code that we do not maintain beats a
  script that reimplements a supported flag.
- **Generating on every build instead of committing** — the file would stop
  being reviewable, and a binding appearing or vanishing is exactly the kind of
  change that should show up in a diff.
- **Not committing it at all (`.gitignore`)** — a fresh checkout would not
  typecheck until someone ran wrangler, and CI would need Cloudflare context to
  do a pure type check.
- **Pre-commit** — it shells out to wrangler; too slow for a hook.

## Consequences

**A wrangler upgrade legitimately fails this gate.** The generated header
records the workerd build it was made with, so bumping wrangler changes the
file. That is the gate working, not a false positive: regenerate and commit the
new types *with* the upgrade, so the two land together.

`npm run types` exists as the paired fix — a gate that fails without naming its
remedy is a puzzle.

Enforced: `wrangler types --check` as `types:check`, in `npm run check` and CI.
`check-config-traps` fails if the `types:check` script is missing, so the gate
cannot be quietly dropped.
