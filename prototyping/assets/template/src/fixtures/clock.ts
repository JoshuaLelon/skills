// Deriving instants from NOW, in one place.
//
// The gate's `fixture-holds-view` rule bans `new Date(` inside `entities/`
// outright, and that is the correct rule — a wall-clock date in a fixture is
// what stops a frozen snapshot being frozen. But `new Date(NOW.getTime() - n)`
// IS deriving from NOW, so without a helper the correct pattern has no cheap
// path and every entity file needs a `gate:allow` comment. This module is the
// cheap path: entities call these and never construct a date.
//
// It lives beside `now.ts` rather than inside it because `now.ts` is
// byte-identical with production's copy (check-parity.mjs) — production resolves
// its own offsets in the seeder, so it has no use for these.
import { NOW } from './now'

const HOUR = 3600 * 1000
const DAY = 24 * HOUR

export const at = (): string => NOW.toISOString()
export const hoursBefore = (n: number): string => new Date(NOW.getTime() - n * HOUR).toISOString()
export const hoursAfter = (n: number): string => new Date(NOW.getTime() + n * HOUR).toISOString()
export const daysBefore = (n: number): string => new Date(NOW.getTime() - n * DAY).toISOString()
export const daysAfter = (n: number): string => new Date(NOW.getTime() + n * DAY).toISOString()
