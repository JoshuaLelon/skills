# Testing architecture

Four layers, distinguished by *what they navigate*, not what runner executes
them — a Playwright spec that only calls `fetch()` against the real server +
real Postgres is an integration test, browser or no browser:

| layer | lives | needs | covers |
| --- | --- | --- | --- |
| unit | `*.test.ts` beside source | nothing | the reducer above all — a combinatorial surface e2e can only walk a few paths through |
| component | `*.test.tsx`, real browser via vitest browser mode | Chromium | interactive components, motion |
| integration | `tests/integration/` | server + Postgres, no browser | writes, auth, isolation |
| e2e | `e2e/flows/` | everything | the locked flows, ported from the prototype |

Vitest 4 `projects` split by environment need (node / browser), not by folder
aesthetics.

## The clock ladder

For any time-dependent logic, take the FIRST rung that works — each step down
is more machinery and less purity:

1. **Pass a different `now` argument.** Domain functions take `now`; the
   composition root reads the clock. (The ast-grep rule enforces the
   precondition.)
2. `vi.setSystemTime()` — component tests.
3. **Seed the data relative to the anchor, leave the clock real** — preferred
   for e2e "overdue" cases.
4. `page.clock` — browser-level pinning (the flow-test helper already does this).
5. Call the scheduled job's `evaluate(state, now)` directly.
6. A guarded `x-test-now` header — last resort: refuses in production, and each
   use carries a written justification in the test.

One subtlety from the field: a **frozen** clock broke ordering tests whose
`ORDER BY at` needed distinct timestamps — the fixture anchor plus *real
elapsed time* (`ANCHOR + (Date.now() - suiteStart)`) keeps a total order while
staying anchored. And anchor the suite to a fixed *weekday* — routine fixtures
written for a Tuesday flake on Wednesdays if seeding anchors to the wall clock.

## Isolation: owner-scoped, not reset

**No DB reset between tests.** Every row is owner-scoped (fixture rule 6 paid
off), every test creates its own user via a factory and disposes it on scope
exit (`await using` + `Symbol.asyncDispose`). No collisions, nothing to clean,
`fullyParallel` is safe — and the parallel suite itself becomes the
tenant-isolation regression test: a dropped `WHERE owner` fails loudly. Keep
one deliberate isolation spec (N near-identical parallel tests writing the same
table) as the sharp version of that claim.

- Seeding goes through the production seeder (`seedFixture(db, owner, now)`),
  never a test-only fixture — two seeders drift.
- Test factories are typed against the drizzle schema — a renamed column fails
  at `tsc`, not as an opaque runtime Postgres error.
- Global setup warms the dev server (poll key routes) so cold compiles don't
  race parallel workers into false timeouts; it is not a data hook.
- `contextOptions: { reducedMotion: 'reduce' }` strips animation timing from e2e.

## Governance

- **Two triggers for a new e2e test: a flow the user confirmed, or a bug you
  hit.** Never speculative coverage of unbuilt flows — tests pin confirmed
  behaviour; during active UI work speculative tests are churn.
- Locator ladder: `getByRole` → `getByLabel` → `getByPlaceholder` → `getByText`
  → last resorts. `getByTestId` and `waitForTimeout` are gated out (ast-grep).
  A `data-*` readiness signal (`[data-ready]`) is legitimate as a wait
  condition, never as a selector.
- Complexity lives in setup/factories, not test bodies — but keep the
  load-bearing values visible in the test; hide only the incidental.

## Training-data API translations (Vitest 4 / MSW 2)

`test.projects` not `workspace`; the browser provider is a function from
`@vitest/browser-playwright` (`@vitest/browser` no longer exists); `page`
imports from `vitest/browser`; MSW is `http`/`HttpResponse` — any
`rest.get((req,res,ctx))` is stale. These fail loudly at install/run — listed
for orientation, not vigilance.

**The one silent one: fixture args must be destructured** — `({ worker })`,
never `(ctx) => ctx.worker`. Both Vitest and Playwright use a getter Proxy to
decide whether a fixture initializes at all; the non-destructured form runs the
test with the fixture silently absent (e.g. unmocked network).

## Assertion subtleties that produce silently-green tests

- **A retrying negated assertion proves nothing** — `.not.toBeVisible()` is
  true on attempt one and returns instantly. For "never appears", assert it
  *does* appear and assert that rejects; for time-gated negatives, freeze the
  clock.
- **Actionability checks verify the element, not the app.** SSR HTML makes
  inputs "actionable" before hydration wires handlers — gate on a fact only
  the client can produce (`html[data-hydrated]`), never `networkidle`, never
  an assertion the server HTML already satisfies.
- `expect.poll()` for eventual assertions; `vi.waitFor()` only for prerequisite
  side effects. Under fake timers on Vitest ≤ 4.1.2, neither advances the
  clock — advance deliberately with `advanceTimersByTime`.
- Global setup resets the DB **before** the run, never after — post-run state
  stays inspectable for debugging. Idempotency check: the suite passes twice
  in a row.
- Auth has two modes: log in through the UI only in tests *of* login (once per
  method); everywhere else authenticate in setup via a persona/session helper,
  so setup failures report as setup errors, not assertion failures.
- If MSW is adopted (a §2 divergence either way): worker fixture with
  `{ auto: true }` (lazy fixtures mean un-destructured tests silently run
  unmocked), `onUnhandledRequest: 'error'`, reset handlers in teardown, and
  export the server from `mocks/node.ts` — never from the setup file, whose
  per-file import cache breaks under parallel runs.
