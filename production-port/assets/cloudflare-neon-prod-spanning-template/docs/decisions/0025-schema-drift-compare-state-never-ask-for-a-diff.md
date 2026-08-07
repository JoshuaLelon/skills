# ADR-0025 — Schema drift: compare state, never ask for a diff

> **Kind:** decision · **Status:** accepted · **Updated:** 2026-08-07
> **Level:** 4 — mechanism
> **Constrained by:** 0002
> **Enforced by:** script:check:schema-drift
> **Applies to:** neon
> **Scope:** decides how we detect that `src/db/schema.ts` and the committed
> migrations have diverged, and what that detection is and is not credited with.
> Which migrations are safe to apply, and how they reach an environment, is
> ADR-0011; what a column may be spelled as is ADR-0024.

## Decision

`check:schema-drift` generates a migration for the current schema into an
**empty** scratch directory, and compares the snapshot that falls out against
the newest snapshot in `drizzle/meta/`. Equal means the schema and the
migrations describe the same database. Anything else fails the check.

The scratch directory is empty on purpose. Given a previous state, drizzle-kit
must *resolve* the diff, and resolution is where it asks questions. Given no
previous state it has nothing to resolve, so it cannot ask, and it simply
reports what the schema says. State comparison is done by us, on the two
snapshots, where it is total and deterministic.

## Context

The hole was that nothing checked this at all. Editing `src/db/schema.ts`,
never running `drizzle-kit generate`, and committing left `npm run check` fully
green — while the migrations, which are what production actually runs, no longer
built the database the app compiles against.

`drizzle-kit check` is not that check, and its name invites the assumption that
it is. It validates the migration folder's *internal* consistency — journal
against snapshots — and never reads the schema. With a planted column in
`schema.ts` it prints `Everything's fine` and succeeds.

## Alternatives declined

- **`drizzle-kit check`** — answers a different question, as above. Wiring it in
  and calling it drift coverage would have been the worst outcome available: a
  named gate, green, enforcing nothing.
- **Copy `drizzle/` to a scratch dir and re-run `generate`; a new `.sql` file
  means drift.** The obvious approach, and it fails silently on the case that
  costs the most. drizzle-kit cannot distinguish a renamed table from a dropped
  one plus a created one, so it prompts. With no terminal the prompt throws, the
  throw is swallowed, the process succeeds, and nothing is written — so the gate
  reads "no new file" and reports clean. Verified directly, on a table rename,
  before this was written.
- **Match the interactive-prompt error on stderr.** It would have closed the
  rename gap on top of the previous option, by pattern-matching a stack trace
  inside a dependency — text with no stability contract, which a patch release
  may reword into silence. A gate whose correctness rests on a vendor's error
  prose is a gate that will fail open without telling anyone.
- **Hash `schema.ts` and store the hash beside the migrations.** Fires on every
  comment and every TypeScript-level rename, none of which reach the database.
  A check that cries drift on formatting gets suppressed within a week.

## Consequences

The gate catches additions, drops, renames, type changes, and index and
constraint changes, at table and column granularity, in `npm run check` and in
CI. It reports table renames as one added table plus one removed table, because
that distinction is precisely the human answer drizzle-kit was asking for — the
failure message says so and sends you to a real terminal rather than guessing.

Two controls in `verify-gates` hold it: a planted column and a planted table
rename must both fire, and renaming an exported binding in `schema.ts` — a large
textual edit that changes no SQL — must stay silent. The last of these is what
keeps the gate honest about reading database state rather than file text.

The comparison ignores the snapshot's `id`, `prevId` and `_meta`, which describe
the generation event and differ on every run; on a clean tree the two snapshots
are otherwise byte-identical. A drizzle-kit upgrade that bumps the snapshot
format is reported as format skew rather than as drift, since every field would
differ at once and the schema would not have moved.

Supersede this if drizzle-kit grows a non-interactive rename resolution — a
flag that makes the diff total without a human — at which point the added/removed
pair could become a named rename and the scratch generate could go away.
