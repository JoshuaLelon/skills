# Decisions (ADRs)

`ADR-NNNN-slug.md`, copied from `adr-template.md`. Numbers are never reused.

**The body is immutable; the status block is not.** Supersede a decision with a
new ADR — but keep the block's edges current (`Constrained by:`, `Enforced by:`,
`Applies to:`, `Supersedes:`), because the tree is derived from them.

**This file is not the index.** `../reference/adr-graph.md` is the decision tree
— roots, prune sets, partial supersessions, enforcement — generated from the
status blocks by `npm run docs:adr-graph`. `../../llms.txt` lists every doc.
Both are generated; neither can go stale.

Cite from code as `ADR-NNNN`; `docs-check` verifies citations resolve, refuses
an ADR body edit, and refuses a price or dated deadline inside an ADR — those
belong in `reference/`, which can be corrected when the numbers move.
