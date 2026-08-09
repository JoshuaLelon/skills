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
//
// ── WHOSE MIDNIGHT (read this before you name an hour in any spec) ──────────
//
// YOUR SERVER'S LOCAL TIME IS UTC. It is workerd, and workerd has no local zone
// — `getTimezoneOffset()` there is 0. So every hour the server derives with
// `setHours` / `getHours` is a UTC hour: a day floored to "midnight" on the
// server is UTC midnight, and any "minutes since the start of the day" the app
// hands the client is minutes since UTC midnight.
//
// YOUR SPEC'S LOCAL TIME IS THE DEVELOPER'S. A spec runs in NODE, not in the
// browser, so `new Date()` + `setHours` uses the machine's zone. The two are the
// same only on a UTC machine, which is why this is a bug that CI can never see
// and every laptop west of Greenwich has.
//
// The gap is silent and it does not read as a timezone bug. Measured on the app
// this template was extracted from: a helper that named 20:02 with `setHours`
// handed the app 01:02 on a UTC-5 machine. Three locked evening flows could not
// reach the evening at any hour of any day, and a fourth was a day out for five
// hours in every twenty-four — the window where the machine's calendar date and
// the origin's are not the same date. It read as flakiness for a long time and
// it was arithmetic.
//
// SO: ONE PLACE KNOWS THE ORIGIN, and every instant a spec names goes through
// it. That place is `moment()` below. Never call `setHours` in a spec.
//
// PROVE IT, DO NOT ASSUME IT. The bug is deterministic once you move the SPEC
// process, which `TZ` does and Playwright's `timezoneId` does not (`timezoneId`
// moves the browser; `moment()` runs in Node):
//
//   TZ=America/Chicago npx playwright test    # must pass
//   TZ=Asia/Tokyo      npx playwright test    # must pass
//
// A suite that passes on UTC and fails on either of those is naming local hours
// somewhere. Verified: with TZ=America/Chicago, `setHours(20, 2)` resolves to
// 01:02Z and `setUTCHours(20, 2)` resolves to 20:02Z in every zone.
//
// IF YOU ADD A CLOCK DOOR (a `?at=19:45` query param the server resolves), ENCODE
// THE VALUE. React Router re-serialises search params when it renders a `<Form>`
// action, so a raw `?at=20:02` arrives as `?at=20%3A02` from the server and
// `?at=20:02` in the browser. That is a hydration mismatch on every form on the
// page, and React answers it by throwing the server's markup away and rendering
// again. `new URLSearchParams({ at })` on both sides makes them agree.
//
// THE PRODUCT QUESTION IS SEPARATE, AND IT IS PROBABLY NOT SETTLED IN YOUR APP
// EITHER. A UTC origin means a Chicago viewer sees a 19:45 event at 14:45 and a
// day that rolls over at 19:00. Fixing that needs a timezone the app does not
// have yet, and it is ONE decision across every surface that derives an hour —
// the root loader and any server-rendered screen must share an origin, or they
// disagree with each other instead of merely with the viewer. Until it lands,
// this file is right and the product is wrong; when it lands, `moment()` changes
// and no spec does.
export { expect, test } from '@playwright/test'
/** @public — re-exported so specs anchor on one clock import, not two. */
export { NOW } from '../src/fixtures/now'

/**
 * THE INSTANT AT WHICH THE APP'S CLOCK READS `hhmm`, `dayOffset` days from
 * today — the single place that knows the origin is UTC (see WHOSE MIDNIGHT
 * above). `moment('19:45')` is a quarter to eight AS THE SERVER COUNTS IT.
 *
 * Anchored on TODAY rather than on the fixture's `NOW`, because the seeder
 * rebases the fixture's instants onto a live clock: anchoring on `NOW` would put
 * every seeded row in the future. Anchored on today's UTC DATE specifically,
 * because that is the date the server floored the origin from — on a machine
 * behind UTC the two are different dates for part of every evening.
 *
 * @public — the template ships no spec that names an hour, so nothing calls this
 * yet. It is here so the first spec that needs one has a correct helper to reach
 * for instead of reaching for `setHours`, which is the mistake this file exists
 * to stop.
 */
export function moment(hhmm: string, dayOffset = 0): Date {
	const when = new Date()
	when.setUTCDate(when.getUTCDate() + dayOffset)
	when.setUTCHours(Number(hhmm.slice(0, 2)), Number(hhmm.slice(3)), 0, 0)
	return when
}
