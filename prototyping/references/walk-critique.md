# What walking a prototype catches

Careful design docs reliably miss errors that surface within minutes of clicking.
They fall into recognisable families — each invisible in prose and obvious in use.
Look for these deliberately while walking; do not wait for them to announce themselves.

## The seven families

**Cruft — text restating a conclusion the reader already reached.** A `cont.` marker
on a group whose repeated name already says it continues; a context block summarising
what the items below each already name; a count above a list of exactly that many
items. **The test: read the content alone. Anything still on screen that you did not
need is cruft.** Prose review never catches these, because in a document every label
looks like helpful precision.

**Narrating the user's motive back at them.** "This does not work for you — what
should change?" on a screen reached by pressing a button that means exactly that.
Related: labelling a reply with the internal outcome class (`Operation`, `Answer`) —
that reports which branch of the code ran, not anything the user asked.

**One word doing two jobs.** `Submit` meaning *preview* on one step and *commit* on
the next. Unnoticeable in a spec where the two uses sit pages apart; immediate when
the button lies about whether you have already changed something.

**Autonomy set at the wrong level.** Surfaces as *"why is it asking me this?"* —
permission requested for a consequence of a decision already made (dropping the thing
*was* the decision). The felt symptom is friction; the actual bug is a `propose` that
should have been `act-then-review`.

**Action at a distance.** Ticking one block's checkbox completes the group day-wide
and two other blocks vanish elsewhere on the page. The arithmetic can be defensible —
the violated expectation is *spatial*, which no reasoning about counts will surface.
**An action must affect what you clicked on.**

**Structure that mirrors the data instead of the reading.** Boxes nested to the depth
of the tree mean reading three borders to locate one row; flattening to one box deep,
with intermediate levels as a prefix on the row, makes scanning cost independent of
depth. **Watch for a rule whose implementation simplifies when you fix it** — the
recursive renderer collapsing to a single loop is the sign the rule was real.

**Motion that fixes the wrong variable.** Rounds of softening curves and lengthening
durations cannot fix an objection that was never to speed — it was to content moving
under you at all; only taking the element out of flow works. **There is no easing
that makes an unrequested layout shift comfortable.**

## Two motion rules that survive the walk

- **FLIP for things that move** (pure transform, composites). **A `height` animation
  for a bordered container that resizes** — scaling distorts its border and text, so
  height is correct there, not a compromise. "Prefer transform" means *use it where
  it does the job*.
- **Attended exits are quick; unattended exits are gentle.** "Exits run 20–30%
  faster" assumes someone decided to leave and is waiting. Nobody waits on a timer —
  a fast start reads as *responsive* answering a click and as *being yanked* when
  nothing prompted it.

## When the user asks "do I have a point here?"

They usually do — but the useful move is not agreement. **State the original
rationale fairly first, then say what it fails on.** This can turn "should we cut X?"
into a better answer than cutting or keeping (X was not redundant with Y — it was
redundant with *the pass Y already runs*, so the capability relocates instead of
dying).

**Watch for chrome defended with plausible reasoning.** An element survives a round
because a justification *can* be constructed — the heading "states the scope", the
count is "load-bearing". If you find yourself arguing an element is *technically*
load-bearing, ask what else on screen already says it.
