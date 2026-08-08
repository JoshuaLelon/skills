// EVERY WORLD MUST BE A STATE THE PRODUCT COULD HAVE ARRIVED AT.
//
// That is the line between "state is an input" and a state backdoor. A starting
// state that no sequence of actions can reach makes a passing test mean nothing:
// the test would be checking a world the product cannot produce. This file turns
// that from a promise into a check, which is what lets the world set grow
// without a review each time.
//
// It is also the unit tier's first test, so `npm run unit` is never a runner
// with nothing in it.
import { describe, expect, it } from 'vitest'
import { freshState } from '../store/state'
import { DEFAULT_WORLD, WORLDS, type World } from './worlds'

const NAMES = Object.keys(WORLDS) as World[]

describe.each(NAMES)('world %s', (world) => {
	const s = freshState(world)

	// ADD YOUR PRODUCT'S INVARIANTS HERE, one `it` each, as the fixture grows:
	// every parent ref resolves, every join names a row the world holds, nothing
	// is recorded as done that the world does not contain, no clock-dependent
	// record exists that `now` says has not happened yet. Each is a few lines,
	// and each names a state the product cannot produce.
	it('queues no effect before anything has been dispatched', () => {
		// The host drains `_fx` after every dispatch. An effect present at
		// construction would be performed before anything asked for it.
		expect(s._fx).toEqual([])
	})
})

it('defaults to the world every call site gets', () => {
	// `freshState()` with no argument is what `host.tsx` calls three times — the
	// initial state, the server snapshot, and every replay check. If the default
	// drifted from the world a test names, replay equality would throw on the
	// first dispatch.
	expect(freshState()).toEqual(freshState(DEFAULT_WORLD))
})
