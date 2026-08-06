# ADR-0013 — The walking skeleton: no pattern ships unexecuted

> **Kind:** decision · **Status:** accepted · **Updated:** [FILL: adoption date]
> **Level:** 3 — architecture
> **Scope:** why this repo began as a copy of the spanning template, what the
> exemplar was, and the rule that governs additions to the pattern set.

## Decision

Apps on this stack start as a copy of the **spanning template** — a complete,
CI-green, once-deployed application in which every convention (schema shape,
seeder, guarded wide events, error taxonomy, auth door, AI one-door,
transactions, store host under SSR, every gate) is exercised by one boring
exemplar entity. The prototype is then ported INTO it: a script carries the
level docs and fixtures into place and stages store/screens/components/flows in
`_port/`; each feature is mapped onto the exemplar's pattern; **the port is
done when staging is empty, the exemplar is deleted, and the locked flows pass
here** (`port:status` reports all three).

The rule the skeleton extends: gates prove rules can fail (verify:gates);
the skeleton proves patterns can RUN. **A convention with no executing example
in the template is documentation, not architecture.** New conventions land in
the template (with the exemplar exercising them) before any real app uses them.

## Alternatives declined

- **In-place vite→RR8 transformation by recipe**: every born file arrived
  derived instead of proven; superseded by this ADR the day the template first
  deployed.
- **Keeping the exemplar as permanent reference**: deleting beats deprecating —
  the patterns survive in the real features, git history, and the skill.

## Consequences

Fixes discovered in any app flow UP to the skill's template copy, so every
future app inherits them. The prototype repo survives untouched as the
fidelity audit's reference side (its `prototype` tag). Template rot is caught
by its own CI: `npm run check` green in a fresh copy is the port's
precondition, and a red check before any port work is a template bug, not an
app bug.
