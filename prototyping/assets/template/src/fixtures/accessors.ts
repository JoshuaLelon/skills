// The seam. Screens read entities ONLY through accessors — the gate enforces
// it. At port time each accessor becomes a loader query with the SAME
// signature, including what it throws (AppError 404 -> the route boundary).
import { notFound } from '../lib/errors'

export function accessor<T extends { id: string }>(name: string, rows: T[]): (id: string) => T {
  const byId = new Map(rows.map((r) => [r.id, r]))
  return (id: string): T => {
    const row = byId.get(id)
    if (!row) throw notFound(`${name}Of: no row ${id}`)
    return row
  }
}
