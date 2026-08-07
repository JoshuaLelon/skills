# ADR-0017 — Cold start is budgeted: bundle size and startup CPU are gates, not trivia

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 4 — mechanism
> **Constrained by:** 0001
> **Enforced by:** script:check:startup, script:config:traps
> **Applies to:** cloudflare
> **Tracks:** ../reference/measurements.md@58ce1f5
> **Scope:** decides how module-scope cost is kept honest. Does not decide
> request-time latency, which is placement (ADR-0019).

## Decision

**`npm run check:startup` builds, then budgets the deployed bundle (gzip) and
startup CPU. Exceeding a budget fails the build.** Raising a budget is a
decision recorded in the commit message, not a chore performed to make a red
build green.

The invariant this protects: **a dependency entering the Worker's reachable
graph costs cold start on every request, and nothing else in the toolchain
notices.** Types pass, tests pass, lint passes, the app works — it is just
permanently slower to start, and in review it looks like one import line.

The measurements are in `../reference/measurements.md` — they describe this
tree at a moment, and this file cannot be corrected when they move.

**What they showed refutes the obvious reading.** The cost is *reachability*,
not laziness: a lazy and an eager import of the same dependency differ by a
fraction of a KiB, because the bundler inlines the dynamic import into the same
chunk. `await import()` defers **evaluation, not inclusion**.

Therefore the gate's honest scope: it catches a dependency joining the reachable
graph. It does **not** verify that a lazy import is still lazy — nothing
available here can, and the budget must not be described as though it does.

The CPU budget never moved across any variant; the local profile is too coarse
to see module init. It stays an unproven backstop. **gzip is the signal.**

## Context

ADR-0012 put the model provider behind a seam and loaded its SDK behind a
dynamic import so it would stay off the startup path. That was asserted, never
verified — and an assertion no gate defends is a comment. `wrangler check
startup` (wrangler ≥ 4.116.0) made it checkable, and checking it showed **the
assertion was false**: the dynamic import saves nothing in bundle terms. The
seam is still right (ADR-0012's reason was provider isolation, not size), but
the size rationale attached to it was folklore. Recording that here so it is not
re-derived.

**`check:startup` builds first**, and fails if `./build` is older than `src/`
or `workers/`. Under `@cloudflare/vite-plugin` the generated config carries
`no_bundle`, so `wrangler check startup` grades `./build` and never compiles
your source — the same stale-artifact trap `check-config-traps` already guards
for `wrangler deploy`, reappearing on a new command. The session that found it
is recorded in `../reference/measurements.md`.

A second trap from the same session, and the reason the first measurements
misled: **`src/lib/ai/client.server.ts` was not imported by anything.** The seam
shipped as dead code, so every mutation to it was tree-shaken and could not move
the bundle — which is what made "lazy vs eager" look like a large difference
when the real variable was reachability. It is now wired to a real capability
(ADR-0022), which is what makes the measured baseline meaningful.

The general lesson, worth more than the numbers: **a gate measured against dead
code reports whatever you hoped for.** Before trusting a budget, confirm the
thing you are budgeting is actually reachable.

## Alternatives declined

- **Reporting the numbers without budgeting them** — `wrangler check startup`
  always exits 0. A number nobody fails on is a number nobody reads.
- **Budgeting raw bytes instead of gzip** — gzip is what the platform limits
  and what cold start actually pays for.
- **Running it in pre-commit** — it builds; too slow for a hook. It belongs in
  `npm run check` and CI.
- **Gating on startup CPU alone** — CPU read 0.0 ms in every variant
  measured. It would have caught nothing.

## Consequences

`npm run check` and CI now build. That is a real cost (`deploy` builds twice)
accepted because a startup budget measured against a stale artifact is worse
than no budget — it reports success about a bundle that no longer exists.

`wrangler check startup` writes `worker-startup.cpuprofile` into the working
directory; the script deletes it and `.gitignore` covers `*.cpuprofile`. Load
it in Chrome DevTools or VS Code when the gate fires — it names what joined the
startup path.

Enforced: `scripts/check-startup.mjs`, wired as `check:startup`.
`check-config-traps` fails if the script is missing **or if it does not build
first**, because a `check:startup` that skips the build silently grades the
wrong thing.
