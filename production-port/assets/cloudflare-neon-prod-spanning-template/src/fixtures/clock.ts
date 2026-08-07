// Deriving instants from NOW, in one place — the fixture's time vocabulary.
//
// The gate's `fixture-holds-view` rule bans `new Date(` inside `entities/`
// outright, and that is the correct rule — a wall-clock date in a fixture is
// what stops a frozen snapshot being frozen. But `new Date(NOW.getTime() - n)`
// IS deriving from NOW, so without a helper the correct pattern has no cheap
// path and every entity file needs a `gate:allow` comment. This module is the
// cheap path: entities call these and never construct a date.
//
// It PORTS. Fixture entities keep holding absolute instants after the port —
// a prototype has to render a believable date, and it has one read site per
// screen — and the production seeder rebases them onto its own `now` in the
// single place fixture data crosses into a live clock (src/db/seed.ts). So
// this file is byte-identical with production's copy, like `now.ts`
// (check-parity.mjs); fix it here and the fix flows to both.
//
// A palette, deliberately: an entity file picks the two or three it needs.
// That is what the `@public` tags say to knip in the production template —
// unused here means not-yet-needed, not dead.
import { NOW } from './now'

const HOUR = 3600 * 1000
const DAY = 24 * HOUR

/** @public */
export const at = (): string => NOW.toISOString()
/** @public */
export const hoursBefore = (n: number): string => new Date(NOW.getTime() - n * HOUR).toISOString()
/** @public */
export const hoursAfter = (n: number): string => new Date(NOW.getTime() + n * HOUR).toISOString()
/** @public */
export const daysBefore = (n: number): string => new Date(NOW.getTime() - n * DAY).toISOString()
/** @public */
export const daysAfter = (n: number): string => new Date(NOW.getTime() + n * DAY).toISOString()
