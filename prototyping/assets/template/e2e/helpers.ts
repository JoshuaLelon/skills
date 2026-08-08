// Import { test, expect } from '../helpers' in every flow spec — the browser
// clock is then pinned to the fixture's NOW before the page loads. Determinism
// by construction, not by remembering. (Pins Date, timers, and performance.)
//
// Pinning is right HERE and wrong in production, and the rule behind both is
// that the clock follows the DATA. A prototype's fixture holds absolute instants
// anchored on NOW and there is no server, so clock and data agree only when the
// clock is NOW. After the port the seeder rebases those same instants onto a
// live `now`, so the data is relative to the real clock and production's copy of
// this file leaves the clock alone. check-parity.mjs asserts both halves, so the
// divergence stays deliberate instead of becoming drift.
import { test as base, expect } from '@playwright/test'
import { NOW } from '../src/fixtures/now'
import { DEFAULT_WORLD, type World } from '../src/fixtures/worlds'

// The fixture also FAILS THE TEST ON ANY UNCAUGHT PAGE ERROR. This is what
// makes the host's dev invariants visible to the suite: replay equality, the
// frozen-state write, and an effect with no registered handler all throw inside
// an event handler, where React does not catch them and Playwright, by default,
// does not either — so the page threw, the test walked on, and the run was
// green. The invariants existed and nothing was watching them. One listener
// turns all three into a red test with the message attached.
//
// TWO LISTENERS, BECAUSE THERE ARE TWO WAYS TO THROW. `pageerror` is an uncaught
// EXCEPTION. A rejected promise is not one — it raises `unhandledrejection`, and
// nothing above sees it. That is not an edge case here: every model call is
// `void call().then(dispatch)` with no `.catch`, so an fx handler that rejects,
// a canned answer that throws, and an invariant thrown inside a `.then` all land
// in the half this file used to be deaf to. The class it missed is precisely the
// class the invariants exist to surface, so the connection was only ever half
// made. The second listener is installed through an init script, because
// Playwright reports rejections only when the page announces them.
export const test = base.extend<{ open: (path: string, world?: World) => Promise<void> }>({
  page: async ({ page }, use) => {
    await page.clock.install({ time: NOW })
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    // Runs before any page script, on every document and every navigation, so a
    // rejection during the first render is caught like any other.
    await page.exposeFunction('__rejected', (m: string) => {
      errors.push(`unhandled rejection: ${m}`)
    })
    await page.addInitScript(() => {
      addEventListener('unhandledrejection', (e) => {
        const r = e.reason
        ;(window as unknown as { __rejected: (m: string) => void }).__rejected(
          r instanceof Error ? (r.stack ?? r.message) : String(r),
        )
      })
    })
    await use(page)
    expect(errors, `uncaught page error(s): ${errors.join(' | ')}`).toEqual([])
  },

  // TWO INPUTS, ONE SHAPE. The clock above is pinned before the page loads;
  // `open` names the world before the page loads. Neither is a harness control
  // and neither is a test-only route — the app takes its starting state exactly
  // as it takes its clock: from outside itself, before it starts. So both
  // survive the strip.
  //
  // AT THE PORT ONLY THIS BODY MOVES. The world gets seeded server-side for a
  // FRESH OWNER through the dev-login door that already mints owners, so
  // isolation is by owner and not by resetting a database. The world NAMES and
  // every test body cross unedited.
  //
  // Destructure `{ page }`: both runners decide whether a fixture initialises at
  // all by watching which properties the test touches.
  open: async ({ page }, use) => {
    await use(async (path, world) => {
      await page.goto(world && world !== DEFAULT_WORLD ? `${path}?world=${world}` : path)
    })
  },
})

export { expect }
