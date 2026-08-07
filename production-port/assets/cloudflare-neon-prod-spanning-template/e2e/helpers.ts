// test/expect for flow specs. The clock is DELIBERATELY LEFT REAL — and the
// prototype's copy of this file deliberately pins it. That divergence is the
// design, not drift (check-parity.mjs asserts both halves).
//
// Why they differ: the clock follows the DATA. A prototype's fixture holds
// absolute instants anchored on NOW, so pinning the browser to NOW makes clock
// and data agree. Here the seeder rebases those instants onto a live `now`
// (src/db/seed.ts), so the data is relative to the real clock and pinning the
// browser to NOW makes them DISAGREE — seeded rows land in the browser's future,
// which is what this file used to do on every single test.
//
// It is also the clock ladder's own order (references/testing.md, and the epic
// testing playbook §7.9b): "seed the data relative to the anchor, leave the
// clock real" is the PREFERRED lever for e2e; `page.clock` is the rung below it,
// for flows that must CROSS a boundary in the browser. Most "time tests" are
// state tests in disguise — an overdue row sorts to the top because it was
// seeded overdue, and the real clock gives the right answer.
//
// When you do need the clock (a weekday-dependent routine, a scheduled event,
// a rendered absolute date), take it per-test rather than globally:
//
//   await page.clock.install({ time: NOW })   // BEFORE goto(); then pauseAt/fastForward
//   await page.goto('/notes')
//
// and seed at the anchor too, so the server agrees: `rebase(x, NOW)` is the
// IDENTITY, so handing the seeder `NOW` snaps the whole system back to
// absolute-anchored mode through the same code path — no second seeder. Use
// `page.clock.setFixedTime(NOW)` instead when you only need the DISPLAYED time
// controlled and no timer has to fire.
export { expect, test } from '@playwright/test'
/** @public — re-exported so specs anchor on one clock import, not two. */
export { NOW } from '../src/fixtures/now'
