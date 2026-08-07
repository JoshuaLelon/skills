# Documentation

> **Kind:** convention · **Status:** accepted · **Updated:** [FILL: date]
> **Level:** 4 — mechanism
> **Constrained by:** —
> **Scope:** the two axes every doc carries and the invariants that hold them
> true. What each folder is FOR is below; individual decisions are `decisions/`.

Two axes, both required on every doc.

**Lifecycle — the folder.** "Where does this go" is answered by the path:

- `decisions/` — immutable ADRs (supersede, never edit)
- `design/`    — living specs: how it should behave
- `reference/` — living statements of fact
- `plans/`     — time-bounded work; delete when done
- `conventions/` — how we work

**Level — the stability tree**, in each doc's status block. Intent at the top,
implementation at the bottom; **a document may rest on things ABOVE it, never
below** — fast layers may couple to slow ones; the reverse is what rots.

| L | what | changes when |
| --- | --- | --- |
| 0 | intent — what this is for, the spiky points of view | you change your mind about the product |
| 1 | law — invariants a feature would be a bug to violate | a law turns out to be wrong |
| 2 | behaviour — how the objects behave | a feature is redesigned |
| 3 | architecture — the shape behaviour requires | a boundary moves |
| 4 | mechanism — stack, runtime, practice | a dependency or tool changes |
| 5 | in flight | constantly |

These docs began life in the prototyping phase (intent → invariants → designs)
and continue here — never restart them. Every file opens with a status block:
`Kind / Status / Updated / Level / Built (design docs; falsifiable) / Scope
(including what it does NOT cover) / Constrained by`.

**Does a change need a doc?** Mostly no. A feature that follows the existing
conventions needs none — its reasoning belongs in the code and the commit
message, which is how the exemplar carries its own. Write a doc when the change
does one of three things: **supersedes a decision** (a new ADR), **establishes a
convention** others must follow (`conventions/`), or **states a fact that will
be looked up and can move** (`reference/`). `design/` holds a screen or object
model's intended behaviour, carried in from the prototype; `plans/` holds
time-bounded work and is deleted when the work lands. Both are empty in a fresh
template, which is correct, not an omission — nothing has been designed or
planned yet.

**`Constrained by:` is the edge the whole tree is drawn from**, and it runs the
full depth: `intent.md` (L0) → `product-invariants.md` (L1) →
`object-model.md` (L2) → the ADRs (L3–L4). It was the ADRs that lacked it, which
is how `decisions/` became a detached subtree whose dependencies lived only in
`Scope:` prose — a hand-maintained adjacency list nothing could read. ADRs carry
three more machine-readable fields for the same reason: `Enforced by:` (checked
in both directions — a named rule must exist, and a rule no ADR claims is
flagged), `Applies to:` (which stack axes it dies with, so divergence prunes by
computation instead of judgement — **inherited from `Constrained by:` and only
ever NARROWED; an ADR cannot outlive what constrains it, and introducing a new
axis therefore requires a root ADR**), and `Supersedes:` (`NNNN#topic` for a partial
supersession — the older ADR is never edited; `docs:adr-graph` renders the
correction against it).

An ADR's **body is immutable; its status block is not.** The block is metadata —
the supersession pointer always lived there — and edges must stay current or the
generated graph lies. `docs-check` enforces exactly that split.

**Generation has an order, and it is a DAG.** `adr-graph` WRITES into `docs/`
and `docs-index` WALKS `docs/`, so the graph must be generated before the index
— run `npm run docs:generate`, which sequences all three (stack → graph → index).
Backwards leaves `llms.txt` stale; `docs:check` catches it loudly rather than
letting it rot, but knowing the order beats discovering it from a red build.

`docs:bless` writes back into `docs/decisions/`, which is the graph's own input.
That is a cycle on paper and benign in fact, because no generator reads
`Tracks:` — and `docs-tracks` now refuses a pin pointing at a generated file, so
it stays benign by construction rather than by luck.

Every invariant of this system, with its enforcement stated — a rule credited
with more than it catches is worse than no rule:

| invariant | enforced by |
| --- | --- |
| llms.txt generated, never edited | docs-index --check (pre-commit + CI) |
| doc add/delete/rename updates llms.txt same-commit | docs-check |
| ADR citations in code resolve | docs-check |
| ADR BODIES immutable (the status block is not) | docs-check |
| status block present; Kind matches folder; Level present | docs-check |
| design docs carry a falsifiable Built line | docs-check |
| [FILL:] markers worked down over time | docs:fillins — a REPORT, by design |
| generated docs (llms.txt, adr-graph.md) match their sources | docs-index --check, adr-graph --check |
| ADR edges and enforcement ids resolve | adr-graph (numbering, cycles, missing rules) |
| no price or dated deadline inside an immutable ADR | docs-check — it belongs in `reference/`, which can be corrected |
| prose that RESTS on another doc is re-read when that doc moves | docs:tracks — a GATE in `npm run check` (`--check`), a report in pre-commit. `Tracks: path@blob`; `docs:bless -- <adr>` records "I looked", scoped. It proves a human looked, never that the prose is right — but an unread dependency no longer ships green |
| level direction (rest on things above, never below) | JUDGMENT — deliberately ungated; graduates to a gate only after confirmed drift (see the production-port skill's docs-system reference) |
| doc content matches reality | the fidelity audit + the ledger — no mechanical check pretends to cover this |

**What "docs-check" scans**: staged changes PLUS the working tree. As a
pre-commit hook it runs `--staged` and grades only the commit being made; run any
other way — `npm run check`, CI, by hand — it also sees uncommitted work, because
a verification command that ignores your unstaged edits reports a green it has
not earned. It prints how many files it examined, so "nothing was validated" is
never disguised as "everything passed".
