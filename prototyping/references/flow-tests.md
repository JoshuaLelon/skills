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

To capture a flow you cannot reconstruct from the narration, record it:
`npx playwright codegen localhost:5173` — walk the flow, take the generated actions
(codegen emits role/name locators by default), then add the assertions.

## Test shape — five rules

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
4. **Every test starts from a URL and a fresh page.** Addressable states (the audit
   rule) mean a flow deep in the app starts at its address, not at the end of another
   flow's clicks. A client-side prototype resets on reload, so isolation is free now;
   when persistence arrives, reset through the real seeder.
5. **No `waitForTimeout`, ever.** Web-first assertions auto-wait; a sleep is a race
   condition with a green checkmark.

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
