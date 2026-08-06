# Docs system: what ships, what waits, and the graduation rule

## Shipped by scaffold-prod (the mandatory minimum)

- **Five folders by lifecycle** — `decisions/` (immutable ADRs, supersede never
  edit), `design/` (how it should behave), `reference/` (statements of fact),
  `plans/` (time-bounded, delete when done), `conventions/` (how we work).
  Free, and "where does this go" is answered by the path — same trick as the
  fixture's lifetime directories.
- **`docs:index`** — `llms.txt` generated from the tree. A generated index
  cannot go stale; the hand-maintained one it replaces listed six uninstalled
  packages and the wrong TypeScript major. Generate any fact that lives in
  exactly one other file; never hand-copy it.
- **`docs:check`** (pre-commit) — two triggers only: doc files
  added/deleted/renamed → index must move in the same commit; code citing
  `ADR-NNNN` → the ADR must exist. Narrow on purpose: *a hard rule with false
  positives gets disabled, and a disabled check is worse than none.*

## What the source repo ran beyond this — and the evidence

Measured against a system built in 3 days with 15 exemption-list patches in
that window:

| mechanism | lines | verdict |
| --- | --- | --- |
| stability levels + dependency direction (`check-levels`) | 292 | **wait** — misfired on scratch dirs, self-admits it can't distinguish churn signal from authoring noise yet; an earlier stricter version flagged 79 false positives and zero real inversions |
| seam register two-way vs depcruise (`check-seams`) | 159 | **wait** — date-arithmetic state machine guarding a 65-line table with no demonstrated drift |
| freshness `Tracks: path@hash` + `--bless` | 128 | **maybe** — genuinely clever (blob-hash pin + explicit "I looked" trail), but opt-in coverage; adopt scoped to `reference/` docs extracted from design docs, when those exist |
| rules-index deriving enforcement tables | 245 | the *derivation* found a real hole (zero `.tsx` reach); the mechanism is replaced here by `verify:gates`, which proves reach directly instead of documenting it |

The docs system's real, proven win was catching **confabulated documentation**
— sections titled "Enforced" over machinery that never existed, phantom
dependencies, wrong versions. Generated indexes and mutation-tested gates close
that hole at the source; prose audits only find it later.

## The graduation rule

A docs mechanism starts as a **report**. It may graduate to a **gate** only
after it catches real drift that a human confirms mattered — the same
standard as `verify:gates` applies to lint rules: a gate that has never fired
on a true positive is ceremony with an exit code. When a warning is being
written for the third time, that's the signal to build the report.

## ADR hygiene

- `ADR-NNNN-slug.md`, immutable once accepted; supersede with a new one and a
  status line both ways.
- Cite from code as `ADR-NNNN` where the decision constrains the code —
  `docs:check` keeps citations resolving, and an ast-grep rule's `message` is a
  fine place for one.
- The decisions README is the index; a new ADR updates it in the same commit
  (co-change check catches the miss).
