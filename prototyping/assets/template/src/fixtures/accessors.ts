// The seam. Screens read entities ONLY through accessors — the gate enforces
// it. At port time each accessor becomes a loader query with the SAME
// signature, including what it throws (AppError 404 -> the route boundary).
//
// EVERY ACCESSOR TAKES ITS ROWS. A production query takes the owner whose rows
// to read, and a function closing over a module array has no owner and nowhere
// to put one — so passing the rows in is that shape, one argument early. It is
// also what makes a row changeable at all: a user editing a project, or a world
// naming a different starting corpus. Entity rows therefore live in state,
// seeded once by `freshState`, and the reader is handed them.
import { notFound } from '../lib/errors'

/**
 * One row, by ref. Throws on a miss — returning `undefined` is the display-name
 * merge bug wearing a seatbelt, and a miss is what a 404 is for.
 *
 * A linear scan, deliberately: these collections are small, and an index built
 * per call is a cache with no invalidation the moment rows can change.
 */
export function one<T extends { ref: string }>(name: string, rows: readonly T[], ref: string): T {
  const row = rows.find((r) => r.ref === ref)
  if (!row) throw notFound(`${name}Of: no row ${ref}`)
  return row
}

// One named accessor per entity, so no screen ever calls `one` itself:
//
//   export const sourceOf = (rows: readonly Source[], ref: string): Source =>
//     one('source', rows, ref)
//
// Legibility goes here too — `nameOf(rows, ref)` — so nothing else in the app
// joins on a rendered string (fixture rule 4).
