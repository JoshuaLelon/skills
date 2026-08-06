# Audit the port against the prototype

The prototype is the specification; the distance between it and the shipped app is a
measurable quantity, and nothing measures it unless you build the thing that does.
Run it **at the moment of porting**, while both sides are still in the user's head.

**Do not rely on visual regression baselines for this.** They pin the app to itself
and stay green while it drifts arbitrarily far from the design, because the design is
not in them. Baselines catch *change*; only a fidelity audit catches *wrongness*.

## Design for the audit, or it will not run

- **Make every meaningful state addressable by URL** — an open sheet, a wizard on
  step 2, an expanded node. Unaddressable states must be reached by clicking, clicking
  means selectors, and the audit becomes bespoke to one app. Addressable states let it
  enumerate instead of navigate — and the same property makes the states page cheap
  and bug reports reproducible.
- **Keep the walkthrough notes as data, keyed by control**, not rendered prose. They
  are a machine-readable list of what the design claims, written by the claimant at
  the time of the claim — the audit's coverage spec, free.
- **Do not expect a blind crawler to find the argument.** It finds what is clickable,
  which is both more and less than what matters; the sharpest claim in an interface
  is usually a multi-step sequence no shallow crawl stumbles into. Drive coverage
  from the notes, not from crawling.

## Make both sides deterministic before comparing anything

Three sources of nondeterminism; expect all three:

- **Wall clock** — pin at the browser level so `Date.now()`, `new Date()`, and timers
  move together.
- **Persistence** — a client-side prototype resets on reload; a real app does not.
  Reset between captures **through the real seeder, never a hand-written fixture**,
  or the reset drifts from what onboarding actually produces and one capture mutates
  the state the next replays against.
- **Generated ids and nonces** — minting from the clock or a global counter breaks
  comparison.

> Anything that breaks replay equality breaks comparability. The check written for
> the store is the check the audit needs — it is not paid for twice.

## Compare copy and structure, not pixels

- **Never pixel-diff two different stylesheets** — everything differs and none of it
  means anything. What survives comparison is copy, affordances, and their order.
- **Discount the shell.** Anything appearing on every screen of one side (nav,
  chrome, harness) is not content; left in, it is reported on every pair and buries
  the real differences. Diff the shell once, then exclude it.
- **Mirror node ids across both graphs.** The leftovers are the finding: an id only
  in the prototype is designed-but-never-built; an id only in the app is
  built-but-never-designed.
- **Rank by similarity; judge by the screenshot.** A screen can score 95% on copy and
  look nothing like the design — every word survives while the visual language does
  not. Similarity is a pointer, not a verdict.

## Grade the drift — the classes have different costs

| class | meaning | fix |
| --- | --- | --- |
| **absent** | designed, never built | build it |
| **reconceived** | built as a different idea | decide which idea wins, *then* rewrite |
| **broken** | built, does not work | bug fix |
| **dressed differently** | right structure, wrong visual language | CSS |
| **extra** | built, never designed | keep, fold in, or cut |

- **Fix *broken* first** — cheap, uncontroversial, waits on no design decision.
  Expect to find some: reading the app against its specification for the first time
  catches correctness bugs for free.
- **Stop before rewriting anything *reconceived*.** It is the one class where the app
  may be right and the prototype out of date. Only the owner can settle it, and the
  answer changes how much of the rest is worth doing.
- **Treat *extra* as governance.** Undesigned screens accrete one reasonable route at
  a time; nobody ever decides to add six. The audit is how accretion becomes visible.

## Know what the method cannot see

Captures run with motion reduced and settle before shooting, so the audit is blind to
motion — collapse-in-place, reflow, sliding vs jumping — and to drag, which scripts
too unreliably to distinguish "not built" from "bad recipe".

> A screenshot audit systematically under-samples exactly what a clickable prototype
> was best at demonstrating. Treat a clean report as covering structure and copy
> only, and **walk the motion by hand**.
