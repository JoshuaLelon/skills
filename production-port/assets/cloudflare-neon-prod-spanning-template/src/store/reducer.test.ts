import { expect, test } from 'vitest'
import { freshState, reducer } from './reducer'

test('toggles hideDone and mints from seq in state', () => {
	const s1 = reducer(freshState(), { type: 'ui/toggle-done' })
	expect(s1.hideDone).toBe(true)
	expect(s1.seq).toBe(1)
	const s2 = reducer(s1, { type: 'ui/toggle-done' })
	expect(s2.hideDone).toBe(false)
})

test('replays to the same state (purity smoke)', () => {
	const log = [{ type: 'ui/toggle-done' as const }, { type: 'ui/toggle-done' as const }]
	const a = log.reduce(reducer, freshState())
	const b = log.reduce(reducer, freshState())
	expect(a).toEqual(b)
})
