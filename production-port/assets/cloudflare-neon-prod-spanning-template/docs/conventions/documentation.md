# Documentation

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

Every invariant of this system, with its enforcement stated — a rule credited
with more than it catches is worse than no rule:

| invariant | enforced by |
| --- | --- |
| llms.txt generated, never edited | docs-index --check (pre-commit + CI) |
| doc add/delete/rename updates llms.txt same-commit | docs-check (staged) |
| ADR citations in code resolve | docs-check (staged) |
| ADRs immutable; only legal edit is the superseded-by pointer | docs-check (staged) |
| status block present; Kind matches folder; Level present | docs-check (staged docs) |
| design docs carry a falsifiable Built line | docs-check (staged docs) |
| [FILL:] markers worked down over time | docs:fillins — a REPORT, by design |
| level direction (rest on things above, never below) | JUDGMENT — deliberately ungated; graduates to a gate only after confirmed drift (see the production-port skill's docs-system reference) |
| doc content matches reality | the fidelity audit + the ledger — no mechanical check pretends to cover this |
