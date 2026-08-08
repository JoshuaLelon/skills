# Lock flows as e2e tests

A flow the user approves — *click this, it says this, it does this* — is a design
decision, and the most perishable kind: nothing fails when an LLM-driven edit changes
it. Lock every approved flow as a Playwright test **the moment it is approved**. From
then on, the instant a flow changes, a test fails — which is the entire point.

## Setup — done by `scaffold.sh`, not by hand

The scaffold installs `@playwright/test` + chromium and ships two templates:
`playwright.config.ts` (`testDir: 'e2e'`, `webServer` so tests self-start Vite,
**chromium only** — cross-browser is a production question; three browsers triple
the wait for zero design signal) and `e2e/helpers.ts` (below). Nothing to write.

## The workflow

**Trigger: the user approves a flow while walking the prototype.** Write the test in
the same turn, while the flow is still on screen — do not batch them for later, the
narration is the spec and it evaporates. When the walk followed a notes `flow`
group, those notes — in order, `text` as the act, `expect` (and `outcomes`) as the
assertions — *are* the spec; transcribe rather than invent.

- One test per flow, in `e2e/flows/`, **named for the narrative**:
  `test('tuesday: capture a source and approve its tagging task', …)` — not
  `test('sources work')`.
- The body alternates act → assert exactly as the user narrated it: click → what it
  says → click → what it says. A flow test that only asserts the end state has
  forgotten most of what was approved.

## A spec that tests the HARNESS marks itself `@harness-spec`

Most specs never touch the walkthrough, which is why they cross the port
unedited. A few must: the drawer asserts things about itself through
`console.error`, and `helpers.ts` fails a test on `pageerror` only, so nothing
in the suite can see a note that lost its marker unless a spec looks.

Such a spec is a locked flow like any other and lives in `e2e/flows/` — but it
dies with the harness. Put the word **`@harness-spec`** in its header comment,
in the sentence that says why the file exists:

```ts
// @harness-spec — this drives the WALKTHROUGH, so it dies with it.
// FLOW: the drawer offers the notes for the screen you are on, and nothing else.
```

`strip-harness.mjs` deletes every spec carrying that word, in the same act that
deletes `walkthrough.tsx`. Without the marker the strip removes the file under
test and leaves the test, so `npm run check` is red at the strip commit — the one
commit this skill promises is green. The word, not a `*.harness.spec.ts`
filename: a filename is invisible in the tab of the editor you are reading the
spec in, and the person who must not rename it is the one least likely to know
the rule. Forgetting it is loud, not silent — the strip reports any surviving
spec that still addresses the drawer.

To capture a flow you cannot reconstruct from the narration, record it:
`npx playwright codegen localhost:5173` — walk the flow, take the generated actions
(codegen emits role/name locators by default), then add the assertions.

## Test shape — seven rules

1. **Locators by role and accessible name only** (`getByRole`, `getByLabel`). This is
   the skill's existing addressing rule with teeth: class-based selectors nail the
   suite to the layer that changes most, and these tests must survive restyling —
   restyling is not a flow change.
2. **"It says this" is an aria snapshot.** `toMatchAriaSnapshot` asserts the
   accessibility tree as YAML — structure, copy, and order, not pixels — so it fails
   on what matters (a renamed button, a vanished row, reordered affordances) and
   stays green through CSS work. Scope it to the region, never `body` (the shell
   appears in every flow; diffing it every time buries the signal — same rule as the
   port audit). Generate the first version by passing an empty string, then commit
   what it produced *after reading it*:

   ```ts
   await page.getByRole('button', { name: 'Approve' }).click();
   await expect(page.getByRole('region', { name: 'Today' })).toMatchAriaSnapshot(`
     - heading "Today" [level=2]
     - list:
       - listitem:
         - text: Fee salience
         - button "Snooze"
   `);
   ```

3. **Import `{ test, expect } from '../helpers'`, never from `@playwright/test`.**
   The helper (a scaffold template) extends `page` to run
   `page.clock.install({ time: NOW })` before every test — the same frozen instant
   every fixture timestamp derives from, faking `Date`, timers, and `performance`
   together. A prototype depicting one Tuesday then tests as that Tuesday forever,
   with nothing to remember. The determinism rule from the port audit, paid once.

   The same fixture **fails the test on any uncaught page error**. That is what
   connects the host's dev invariants to the suite: replay equality, a write to
   frozen state, and an effect with no registered handler all throw inside an
   event handler, where React does not catch them and Playwright, by default, did
   not either — the page threw and the run stayed green.

   **This does not survive the port, on purpose.** The clock follows the DATA:
   here the fixture holds absolute instants anchored on `NOW` and there is no
   server, so the clock must BE `NOW`. After the port the seeder rebases those
   same instants onto a live `now`, so production's helper leaves the clock real
   — pinning it there would put every seeded row in the browser's future. Do not
   "fix" the divergence in either direction; `check-parity.mjs` asserts both
   halves. A ported flow test that genuinely needs the pin takes it per-test and
   seeds at `NOW`, where the rebase is the identity.
4. **Every test starts from a URL, a fresh page, and a named world.**
   `await open('/', 'empty-day')` — the world is `freshState`'s argument (skill:
   store rules), read from the URL before the store is built, so the app takes
   its starting state the way it takes its clock: from outside itself, before it
   starts. No test-only route and no harness control, so it survives the strip;
   at the port only `open`'s body moves — the world gets seeded for a fresh owner
   through the dev-login door — and every test body crosses unedited.

   **A world may remove a step that is a ROUTE. A world may never remove a step
   that is the CLAIM.** The four clicks that get you to the screen under test are
   a route, so a world takes them. The typing, the second Preview, the order of
   acts, the copy, the absences, and any crossing whose crossing is the subject
   are the claim, and they stay clicked in a browser. **A world only changes
   where the walk BEGINS.** If it would make an approved flow shorter than what
   the owner approved, the world is wrong: split the test and keep the full walk.

   Addressable states (the audit rule) mean a flow deep in the app starts at its
   address, not at the end of another flow's clicks. A client-side prototype
   resets on reload, so isolation is free now; when persistence arrives, isolate
   by owner — one database and one owner per test, never one database per test.
5. **No `waitForTimeout`, ever.** Web-first assertions auto-wait; a sleep is a race
   condition with a green checkmark. When a delay genuinely has to be waited out —
   a drag sensor that activates on a 180ms hold, a debounce, an entrance that
   gates a control — **wait on the app's own live-region announcement**:

   ```ts
   await page.mouse.down();
   await expect(page.getByRole('status')).toContainText('is lifted');
   ```

   The announcement is the app stating that the thing happened, so the test waits
   on the fact instead of guessing a number, and asserts in the same line that the
   change is audible to someone who cannot see it. **If there is nothing to wait
   on, that is the finding, not an obstacle**: a state change with no announcement
   is invisible to a screen reader too, so the fix belongs in the product. Scope
   the locator when a library publishes its own `role="status"` — dnd-kit does —
   or two live regions answer to one name.
6. **Move time with `page.clock`, never with a harness control.** The prototype's
   "jump to evening" button is scaffolding and the strip deletes it, so a flow
   test that clicks it dies at the port. `page.clock.fastForward('02:00')` drives
   the app's own timer, which dispatches the same `clock/set` production
   dispatches — one seeded world, tested at two times, through the shipping code
   path. This works only because `now` is a pure input (skill: store rules), and
   it is what lets a time-dependent locked flow survive the strip untouched.
7. **Do the recorded act TWICE.** Every test answers once, accepts once, undoes
   once — so a case that overwrites the very field it must read back passes the
   entire suite and every dev invariant, because the first answer is correct and
   perfectly deterministic. The second is where "you looked and agreed" stops
   being distinguishable from "you never looked". Any act that records a decision,
   appends to a log, or can be revised gets a second invocation in the same test.

## Running

- While iterating: `npx playwright test --ui` — watch mode reruns on change, with
  time-travel debugging, so a broken flow surfaces as you edit, not at commit.
- As the gate: `npx playwright test` after every LLM-driven change set. This is the
  "know the moment it changes" mechanism — an unrun suite knows nothing.
- On every commit: the `.githooks/pre-commit` hook (a skill asset, installed at
  scaffold) runs `npm run gate` plus this suite, so a flow change cannot reach a
  commit unnoticed even when nobody remembers to run anything. The gate's
  `bad-locator` rule also enforces the locator discipline above mechanically.

## When a flow test fails

The failure is the product working. It forces a decision that silent drift never
does:

- **The change was intended** → the flow spec changed. Update the test (and
  `npx playwright test --update-snapshots` for the aria snapshots) **in the same
  turn as the change** — the docs-in-the-same-turn discipline; a stale flow test is
  a stale spec.
- **The change was not intended** → a regression, caught at the moment it was
  caused. Fix before continuing.

**Never update a snapshot to get to green without deciding which of these it was.**
An `--update-snapshots` run applied blindly converts the entire suite into a baseline
that pins the app to itself — the exact thing the port audit warns baselines do.

## Phase 0 consequence

A flow-lock test **is** a regression check, and writing the first one is the
crossing tell from Phase 0: the prototype is now keep-code. Say so out loud. Two
payoffs follow: role/name locators survive the port in spirit, so the suite crosses
with the code — and the locked flows are claims the shipped app must honor, which
makes them the port audit's coverage spec, already written.
