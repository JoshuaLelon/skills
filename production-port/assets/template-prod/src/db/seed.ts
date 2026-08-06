// THE seeder — singular on purpose (ADR-0006/0010): production onboarding and
// every test call this same function, so they cannot drift. `now` is a
// required parameter; every timestamp derives from it (tests pass the anchor,
// onboarding passes the request clock). Fill the body from the fixture's
// entity arrays — they were shaped to become seed rows 1:1.
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

export async function seedFixture(
  db: NodePgDatabase<Record<string, unknown>>,
  owner: string,
  now: Date,
): Promise<void> {
  // [FILL: for each fixtures/entities array — insert rows with { ...row, owner },
  // timestamps derived from `now` + the fixture's offsets from NOW. Include the
  // ACTIONS fixture rows. Idempotent: safe to call twice for the same owner
  // (onConflictDoNothing on the (owner, ref) keys).]
  void db
  void owner
  void now
  throw new Error('seedFixture: not yet filled from the fixture arrays')
}
