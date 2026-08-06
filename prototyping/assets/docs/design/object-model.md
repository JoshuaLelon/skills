# Object model

> **Kind:** design · **Status:** draft · **Updated:** [FILL: date]
> **Level:** 2 — behaviour
> **Built:** [FILL: falsifiable — name the fixture files/screens that exist;
> "nothing yet" is a valid value]
> **Constrained by:** `../reference/product-invariants.md`
> **Scope:** the entities, their relationships, and their lifecycles. Screens
> live in their own design docs; this is what they all bind to.

This is Phase 2's output ("find the thing written five times") made durable —
the first doc written, because every other design doc binds to it, and the
fixture (`src/fixtures/entities/`) is its executable twin: **when one changes,
the other changes in the same turn.**

## Entities

[FILL: one section per entity. Elicit with: "what are the nouns you keep using
— and which two of them are secretly the same thing?", "what does each entity
have a lifecycle FROM and TO?", "which relationships carry data of their own?"
(that's a join table with columns), "what has a history worth keeping?" (that's
the ACTIONS log), "who owns each row?"]

## Relationships

[FILL: cardinality made explicit — every many-to-many named, matching the
fixture's join arrays one-to-one.]
