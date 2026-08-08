# What walking a prototype catches

Careful design docs reliably miss errors that surface within minutes of clicking.
They fall into recognisable families — each invisible in prose and obvious in use.
Look for these deliberately while walking; do not wait for them to announce themselves.

## The eight families

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

**A control that removes the only means of satisfying its own precondition.**
Choosing "evening" in a filter hid every item, the empty list unmounted the panel
holding the filter, and the control that would bring the items back went with it —
a trap two clicks from the start screen. **The test: for every control that
narrows, name the control that widens it again, then check that the widener still
renders in the narrowed state.** This hides in empty states, because the empty
state is usually drawn by a different branch than the full one, and the branch
that draws nothing is the one nobody walks.

**Motion that fixes the wrong variable.** Rounds of softening curves and lengthening
durations cannot fix an objection that was never to speed — it was to content moving
under you at all; only taking the element out of flow works. **There is no easing
that makes an unrequested layout shift comfortable.**

## Gesture and motion rules that survive the walk

- **A row that is both a drag handle and a click target starts its drag on a
  HOLD, never on a distance.** A 4px threshold sits inside the noise of an
  ordinary click, so a click with a twitch in it silently reorders the list and
  marks it dirty — reproducible in one gesture. Use a 250ms delay with an 8px
  tolerance, without which the finger's drift while waiting makes it unusable on
  touch. The trade is deliberate: a delay starts every drag late, a threshold
  keeps drags instant, and on a list you mostly tick things off the click is the
  more common act by far.
- **Holding is not yet moving.** The delay elapsing makes the library consider a
  drag active with the pointer standing still — which lit a drop line under a
  neighbour, announced a destination, and performed that move on release. Gate
  the line, the announcement and the drop on real travel: nobody asked for a
  destination they never pointed at.
- **The carried block may not outlive the pointer.** A row re-sorted across a
  group boundary is unmounted and remounted, not moved, so the library can lose
  the node it was tracking and never fire its end event — leaving the drag chip
  hanging over the page until something unrelated disturbs it. Bind teardown to
  the one fact that is always true: the gesture is over when the button comes up.
- **Never blank a thing you are about to replace.** While a call is in flight,
  draw the SHAPE of what is coming — same rows, same boxes, `aria-hidden`,
  because empty placeholders are something to look at and nothing to read — and
  announce the wait once in a live region, so it is heard as well as drawn.
  Blanking the region and filling it on arrival moves the layout at the one
  moment attention returns to it. **Disable only what the pending answer feeds**:
  a control that does not need the answer — typing your own wording — stays live
  while it lands. And a wait of a second or two is not a background task and must
  not be turned into one; you get the step you asked for, with its parts pending.
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
