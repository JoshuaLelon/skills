// The fixture↔database time seam, tested (ADR-0005). The gate proves nobody can
// bypass rebase(); this proves rebase() is worth not bypassing.
import { describe, expect, it } from 'vitest'
import { NOTES_SEED } from '../fixtures/entities/notes'
import { NOW } from '../fixtures/now'
import { rebase } from './seed'

const DAY = 24 * 3600 * 1000

/** Position of each element in sorted order — a permutation, not a sort. */
const rank = (xs: number[]): number[] => xs.map((x) => xs.filter((y) => y < x).length)

describe('rebase — fixture time onto seed time', () => {
	it('preserves age against the anchor, not the calendar date', () => {
		const seededIn2029 = new Date('2029-03-01T12:00:00Z')
		const twoDaysOld = new Date(NOW.getTime() - 2 * DAY).toISOString()
		// The whole point: a fixture authored against a 2026 anchor still seeds a
		// two-day-old row in 2029. Copying the instant through would have pinned it.
		expect(rebase(twoDaysOld, seededIn2029).getTime()).toBe(seededIn2029.getTime() - 2 * DAY)
	})

	it('maps the anchor itself to the seeder now, exactly', () => {
		const now = new Date('2027-11-05T08:30:00Z')
		expect(rebase(NOW.toISOString(), now).getTime()).toBe(now.getTime())
	})

	it('preserves total ordering, which is what ORDER BY created_at rests on', () => {
		const now = new Date('2030-01-01T00:00:00Z')
		const anchored = [3, 1, 2].map((d) => new Date(NOW.getTime() - d * DAY).toISOString())
		// Rank rather than sort: rebase is a uniform shift, so the permutation has to
		// come out identical. ADR-0005 declined frozen-clocks-everywhere precisely
		// because it broke this property.
		expect(rank(anchored.map((a) => rebase(a, now).getTime()))).toEqual(
			rank(anchored.map((a) => Date.parse(a))),
		)
	})

	it('rebases every timestamp the exemplar fixture ships', () => {
		const now = new Date('2031-06-15T09:00:00Z')
		for (const n of NOTES_SEED) {
			// Anchored in the past relative to NOW, and therefore in the past relative
			// to whenever the seeder runs. The offsets this replaced were POSITIVE:
			// the exemplar's "history" was created one second after page load.
			expect(Date.parse(n.createdAt)).toBeLessThan(NOW.getTime())
			expect(rebase(n.createdAt, now).getTime()).toBeLessThan(now.getTime())
		}
	})
})
