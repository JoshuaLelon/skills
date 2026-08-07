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
| stability levels + dependency direction (`check-levels`) | 292 | **superseded** — it INFERRED edges from churn and filesystem shape, which is where the 79 false positives and zero real inversions came from. `adr-graph` reads DECLARED `Constrained by:` edges instead, so there is nothing to guess; its first run found 10 inversions, all real. A report, not a gate |
| seam register two-way vs depcruise (`check-seams`) | 159 | **wait** — date-arithmetic state machine guarding a 65-line table with no demonstrated drift |
| freshness `Tracks: path@hash` + `--bless` | 128 | **ADOPTED** — the condition ("scoped to `reference/` docs extracted from design docs, when those exist") was met when the ADR selection-menus were extracted into `docs/reference/cloudflare-primitives.md`. Ships as `docs:tracks` / `docs:bless`, a REPORT: the pin proves a human looked, never that the prose is right |
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
  fine place for one. **That check shipped broken and this file asserted it
  anyway**: it matched `/ADR-(\d{4})/` against filenames that are `NNNN-slug.md`,
  so the known-ADR set was always empty and every citation resolved to "does not
  exist" — a 100% false positive, masked because the template sits in a
  subdirectory of the skills repo and every path lookup silently missed. Fixed,
  with a negative control (`expectClean`) in verify-gates, because a planted
  violation alone cannot tell a working rule from one that flags everything.
- **The index is generated, not the README.** `llms.txt` (docs-index) lists
  every doc; `docs/reference/adr-graph.md` (adr-graph) is the decision tree,
  derived from the status-block edges. The decisions README is four lines of
  process rules and lists nothing — an earlier version of this bullet claimed
  otherwise, which is the confabulation class this system exists to catch,
  appearing in the file that describes the system.
- Status blocks carry machine-readable edges: `Constrained by:` (continuing the
  L0→L1→L2 chain down into L3/L4, which the ADRs previously broke),
  `Enforced by:` (checked both ways — a named rule must exist, and a rule no ADR
  claims is reported), `Applies to:` (prune sets on stack divergence, computed),
  `Supersedes: NNNN#topic` (partial supersession rendered against the older
  entry in llms.txt, so an immutable file that reads wrong on its own is marked
  without being edited).
- An ADR's **body** is immutable; its **status block** is not. The block was
  always mutable — the superseded-by pointer lives there — and edges must stay
  current or the generated graph lies.
- No prices or dated deadlines inside `decisions/`. They belong in `reference/`,
  which can be corrected when they move; an immutable file cannot be.

## Testing the system on strangers

`assets/lab.sh <dir> <name>...` builds N isolated copies of a REAL app — built
the way the README says to build one (rename-app, git init, lefthook install),
because two of the bugs this found lived in that path and were invisible from
inside the template, which never runs rename-app on itself. It refuses to clone
unless the baseline is green first, so a polluted result is impossible.

Then give each copy to an agent with NO context: a realistic task, "stay inside
this directory", and a demand for the two things that matter — how it discovered
the conventions, and every time something blocked it, correct or not.

Two rounds of five found: a brand-new app that was lint-red, e2e silently
grading a different project on port 5173, three deleted mutations nobody
noticed, `db-push-guard` pointed at the wrong port under a comment claiming
otherwise, `docs-check` blind to untracked files, and a probe shipping a mutated
doc into every scaffolded app. None of it came from reading the code again.

The signal to watch is FALSE alarms, not catches. Both rounds returned zero,
which is what says the gates are not merely loud.
