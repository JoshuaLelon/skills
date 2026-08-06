// The seam. Screens and components read entities ONLY through accessors — the
// gate enforces it. At port time each accessor becomes a loader query with the
// same signature, which is what makes the port a copy.
//
//   export const sourceOf = accessor('source', SOURCES)
export function accessor<T extends { id: string }>(name: string, rows: T[]): (id: string) => T {
  const byId = new Map(rows.map((r) => [r.id, r]))
  return (id: string): T => {
    const row = byId.get(id)
    // Throwing beats returning undefined: a silent miss is the display-name
    // merge bug wearing a seatbelt.
    if (!row) throw new Error(`${name}Of: no row with id ${id}`)
    return row
  }
}
