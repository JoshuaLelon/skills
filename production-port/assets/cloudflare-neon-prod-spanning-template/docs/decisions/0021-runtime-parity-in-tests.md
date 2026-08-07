# ADR-0021 — Runtime parity: the integration tier runs in workerd, against the production build

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 4 — mechanism
> **Scope:** decides which runtime each test tier executes in. ADR-0006 decided
> the four tiers and what each navigates; that taxonomy is unchanged.

## Decision

**Each tier declares its runtime, and the integration tier uses
`createTestHarness()` from wrangler — workerd, running the production build
output.**

| Tier | Runtime today | Runtime decided |
|---|---|---|
| unit | Node | Node — unchanged; these test pure logic |
| component | real Chromium (Vitest browser mode) | unchanged |
| **integration** | **Node (`environment: 'node'`)** | **workerd, production build, via `createTestHarness()`** |
| e2e | workerd, **dev** bundle (Playwright → `npm run dev`) | unchanged; optionally pointed at the harness |

`createTestHarness()` starts one or more Workers from any Node test runner and
exposes `listen()`, `fetch()`, `reset()` and `close()`, with outbound `fetch()`
mockable through MSW. Cloudflare now recommends it over `unstable_dev()` and
`unstable_startWorker()`.

## Context

**A correction worth recording, because the first version of this analysis got
it wrong:** it is not true that nothing in the suite exercised the Workers
runtime. `@cloudflare/vite-plugin` runs the Worker inside workerd during
`vite dev` — "Your Worker code runs inside workerd, matching the production
behavior as closely as possible" — so Playwright, which drives `npm run dev`, has
been hitting workerd all along.

The real gap is narrower and still worth closing:

1. **The integration tier runs in Node.** `vitest.integration.config.ts` sets
   `environment: 'node'`, so the code path under test — loaders, the query
   module, `guarded()` — executes against Node's globals, not workerd's. The
   tier that tests "server + real Postgres" tests it in a runtime the server
   never runs in.
2. **Nothing tests the production build.** Dev-mode workerd and the built
   artifact are not the same bundle; `vite preview` exists precisely because
   they differ.

The seed's own doctrine argues for closing this: `references/testing.md` defines
tiers by *what a test navigates*, and a tier claiming to navigate "the server"
while running it in the wrong runtime is claiming coverage it does not have.
Node-vs-workerd differences are exactly the silent kind — a global that exists
in one and not the other, `nodejs_compat` surface, subtly different streams.

## Alternatives declined

- **`@cloudflare/vitest-pool-workers`** — the other supported answer, and a
  deliberate non-adoption: it replaces the Vitest runner for that project, and
  Cloudflare's own guidance splits the two (pool for unit tests *inside* the
  runtime, harness for integration tests *against* a Worker). The integration
  tier here wants to make requests to a running Worker and talk to real
  Postgres, which is the harness's shape. Also: the pool is still open beta and
  cannot use native V8 coverage.
- **`unstable_dev()` / `unstable_startWorker()`** — superseded by
  `createTestHarness()` per Cloudflare's own recommendation.
- **Leaving integration in Node** — fastest, and it is the option that lets a
  workerd-only failure reach production with a green suite.
- **Pointing Playwright at the harness too** — plausible, and deferred: e2e's
  job includes the client bundle and dev ergonomics (HMR, fast iteration).
  Revisit if a dev-vs-built difference ever burns us.

## Consequences

The integration tier gains a build dependency — it now needs `./build`, the
same freshness requirement ADR-0017 imposed on the startup budget, and the same
stale-artifact trap applies.

Outbound HTTP in integration tests is mocked with MSW rather than by swapping an
adapter, which fits the seam doctrine (ADR-0012): the seam stays real and the
*network* is what gets faked.

`reset()` between tests is available but deliberately unused for data — ADR-0006
isolates by owner-scoped factories with `await using`, not by resetting storage,
and that is what keeps `fullyParallel` safe.

Enforced: nothing mechanical. `check-config-traps` already fails a jsdom
`environment`; extending it to assert the integration config's runtime is a
reasonable follow-up once the harness lands.
