# Product invariants

> **Kind:** reference · **Status:** draft · **Updated:** [FILL: date]
> **Level:** 1 — law
> **Constrained by:** `intent.md`
> **Scope:** invariants a feature would be a bug to violate — whatever the
> feature request says. How objects behave is `../design/`; this file only
> constrains it.

Laws are extracted from intent, never from designs — a law that tracks a design
restates instead of constrains (the inverted-`Tracks:` failure). Each law:
one sentence, falsifiable, with the intent bullet it derives from.

[FILL: the laws. Elicit with: "what should still be true after any redesign?",
"what would make you reject a feature even if it tested well?", "finish the
sentence: it is always safe to ___ / it is never acceptable that ___",
"which of your spiky points of view are load-bearing enough that violating
them is a bug, not a preference?"]

Examples of the *shape* (not content): "every action is instantly reversible";
"nothing leaves the user's day without the user seeing it happen"; "the model
proposes, the user disposes".
