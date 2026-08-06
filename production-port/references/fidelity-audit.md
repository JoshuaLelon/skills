# Fidelity audit tooling

The method — determinism, copy-not-pixels, the absent/reconceived/broken/
dressed/extra grading, fix order — is the prototyping skill's
`references/port-audit.md`. This file is about running it cheaply.

## The kit

A proven implementation lives at
`~/workspace/pantogen/mockup-fidelity-check/` (it produced real findings: a
sort-order bug, missing load-bearing states, a component rebuilt as a different
product, 4 unreachable routes). Its generic half is cleanly separated and worth
adapting at first use (~350 lines, no project knowledge):

- `capture.mjs` — given a recipe graph (node = *state*, not page; `today` and
  `today+toast-after-tick` are distinct nodes), replays each node's **full
  ancestry from a fresh page load** — deliberately non-incremental, for
  reproducibility — and screenshots it.
- `diff.mjs` — token-set similarity per paired state, **discounting tokens
  present on every screen of a side** so shell/nav/harness never registers as
  content difference.
- `compare.mjs` / `mermaid.mjs` — side-by-side HTML viewer and flow graphs from
  `graph.json` + shots.

The bespoke half was the two hand-authored recipe graphs — the exact thing its
README says blocked generalization.

**The reference build is the `prototype` git tag** — strip-harness deleted the
walkthrough and `notes.ts` from the ported tree, so the audit checks out the
tag (or a worktree of it) to run the prototype side and read the notes.

## Why it's cheap now: generate the recipes

The prototype built under the prototyping skill already emits what the recipe
graphs were hand-written to provide:

- **`notes.ts` flows are the recipe graph.** A flow's notes, in order — `text`
  as the action, `target` as the control, `expect`/`outcomes` as what the state
  should contain. Write `graph-from-notes.mjs` against that data instead of
  authoring recipes: the walkthrough spec, the locked tests, and the audit
  coverage are then three views of one file.
- **URL-addressable states** mean most nodes are a `goto`, not a click chain.
- **Mirror node ids across both graphs** — an id only in the prototype is
  designed-never-built; only in the app, built-never-designed. The leftovers
  are the finding.

**The graph.json shape**, so two agents produce compatible graphs:
`{ nodes: [{ id, url?, steps: [{ action: 'goto'|'click'|'fill', target, value? }] }], edges: [[from, to]] }`
— node ids mirrored across both sides; `steps` is the full ancestry from a
fresh load; targets are role/name locators.

## Determinism (both sides, before comparing anything)

- Pin the clock at the browser level on both sides to the same instant — the
  prototype's `NOW`.
- The app persists; the prototype resets on reload. **Reset the app through the
  real seeder before every captured node** — a delete-and-reseed of the audit
  user, cheap because isolation is owner-scoped.
- Anything minting ids from clock or counters breaks pairing — the replay-
  equality discipline already forbids it.

## Reading the output

- Similarity ranks, screenshots judge — screens have scored 92–95% textually
  similar while being a different interface entirely.
- Expect *broken*-class findings (real bugs, fix first, no design decision
  needed) and an *extra* list (routes nobody decided to add — governance, not
  cleanup).
- The audit is blind to motion and drag; walk those by hand and say so in the
  findings.
