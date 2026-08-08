// A WORLD is a starting state, named. It is the same kind of input as `now`.
//
// `now` is a pure input: it lives in state, it arrives by action, and a flow
// test moves the clock so the SHIPPING code observes it. State is the same kind
// of thing with one difference, and the difference decides the design — `now`
// arrives AFTER the store starts, by action, repeatedly; state arrives ONCE, at
// construction. So a world is not an action. It is `freshState`'s argument.
//
// THIS IS NOT A TEST AFFORDANCE. Production's initial state comes from a loader
// for one owner, so `freshState` cannot read module arrays there. A no-argument
// signature is already wrong for the port. A test benefits from the parameter; a
// test did not cause it.
//
// SCAFFOLDING, and it says so. At the port a world is a seeded owner —
// `seedFixture(db, owner, now, world)` — reached through the dev-login door that
// already mints owners. The world NAMES and every test body cross unedited. This
// file does not cross; its selections move into the seeder.
//
// READ ONCE, AT MODULE LOAD. `freshState` runs three times in `host.tsx` — the
// initial state, the server snapshot, and every replay check. All three must see
// ONE world, or replay equality throws on the first dispatch. That check is
// therefore a free, continuous test that this plumbing is right.
//
// ONE WORLD IS ENOUGH FOR A LONG TIME. Keep the parameter, which is the port's
// signature; add a world when a test needs it and never before. A world with no
// reader is a fixture nobody checks, and it is wrong by the time something
// reads it.
// `store/state`, not `store/reducer`: this is the file directly above, and it
// is the one that seeds. Type-only, so it is erased — the runtime arrow still
// points one way, from `state.ts` down into the fixtures.
import type { State } from '../store/state'

/**
 * TWO RULES. `worlds.test.ts` checks the second one.
 *
 * 1. A world SELECTS and PATCHES rows that `fixtures/entities/` already holds.
 *    It never invents a `ref`. An invented ref throws 404 through the accessors
 *    here, and it has no seed row after the port — the two failure modes agree,
 *    which is what makes this a rule rather than a convention.
 * 2. A world must be a state the product could have ARRIVED at. A starting state
 *    that no sequence of actions can reach makes a passing test mean nothing.
 */
export const WORLDS = {
	/** Rename this for the narrative the slice walks: `tuesday`, `first-run`. */
	default: () => ({}),
} satisfies Record<string, () => Partial<State>>

export type World = keyof typeof WORLDS

/** What `freshState()` and `open(path)` both mean when nobody names a world. */
export const DEFAULT_WORLD: World = 'default'

/**
 * ONE WORLD PER PAGE LOAD, chosen before the store is built.
 *
 * The URL is the door because it is the one input that exists before any of our
 * code runs, and because it is what the port replaces: `open()` will mint an
 * owner and seed it server-side instead.
 *
 * A CLOSED UNION, never a free-form payload. That is the line between "state is
 * an input" and a state backdoor — a caller that can post an arbitrary blob can
 * express states no sequence of actions can reach, and then a test passes and
 * means nothing.
 */
const named = (): World => {
	if (typeof location === 'undefined') return DEFAULT_WORLD // prerender: no URL yet
	const asked = new URLSearchParams(location.search).get('world')
	return asked && asked in WORLDS ? (asked as World) : DEFAULT_WORLD
}

export const WORLD: World = named()
