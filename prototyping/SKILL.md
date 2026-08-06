---
name: prototyping
description: Process for taking an idea through design docs to a clickable prototype that stays cheap to change and ports cheaply to production. Use when building a prototype, mockup, clickable demo, wireframe, or vertical slice; when starting a design session that ends in a prototype; when the user approves a flow and wants it protected from later edits; when porting a prototype to the real stack; or when auditing how far a shipped app drifted from its design. Triggers on: prototype, mockup, clickable demo, wireframe, vertical slice, design session, throwaway code, lock this flow, e2e, Playwright, port to production.
---

# Prototyping: idea → prototype → production

The bottleneck is never producing artifacts — it is the user's ability to hold them.
Optimise every artifact for how little they have to carry. Distilled from the pantogen
reboot and its port (`~/.claude/ai-prototyping-lessons.md` is the full retrospective).

One principle recurs, so it gets a name the rules below cite:

> **A rule needs a cheap path.** A rule with no cheap alternative loses to whoever is
> in a hurry, which is always. Accessors, wrappers, and gates exist to *be* the cheap path.

## Checkpoints — the only places to stop and ask

Everywhere else: decide, state the decision, continue.

1. **Phase 0** — keeping it or throwing it away. If the user is unsure, apply
   spec-and-port rules: every observed "throwaway" that survived long enough to be
   walked got ported.
2. **Phase 3** — genuine forks in the docs, asked in batches, each with a
   recommendation attached.
3. **Phase 5** — flow approval. Only the user approves a flow; never lock one unasked.
4. **Port audit** — anything graded *reconceived*. The app may be right and the
   prototype stale; only the owner settles it.

**Scaling down:** for a small ask (one screen, one control), Phases 1–3 compress to a
single message — the facts found, the collapsed object, the questions with
recommendations. Phase 4's rules do **not** compress; they are cheapest at exactly
this size.

## Phase 0 — Decide, out loud, whether you are keeping it

Before the first line, ask the user: **throwaway, or spec-and-port?** State which
ruleset applies. The two doctrines have opposite rules:

- **Throwaway** buys speed with duplication, inline styles, and no tests — solvent only
  because the code dies. **Throwaway means NO scaffold and NO gate** — a single
  file is fine; everything below this line assumes spec-and-port.
- **Spec-and-port** means the artifact will be read field by field at port time, so
  every unnamed decision is debt from line one. Everything in Phase 4 applies.

**The crossing has a tell: the moment you write a regression check** (or fix the same
bug twice), it is keep-code. Say so, and either delete it or promote it then. Neither
costs anything if noticed; the only expensive option is continuing under throwaway
rules while accruing keep-it obligations. Note that locking a flow as an e2e test
(Phase 5) *is* a regression check — the first locked flow is this crossing.

**If spec-and-port: run the Phase 4 stack block (scaffold included) NOW,
before Phase 1** — Phases 1–3 fill the level-doc templates the scaffold
creates; the elicitation prompts live inside them, so docs written freehand
before the scaffold silently suppress the interview.

## Phase 1 — Excavate

Query the database, read the schema, grep the commit history *before* designing.
Produce facts that contradict the stated intent.

- Never ask a question the database can answer. Query first, then ask what remains.
- `git log --grep` before re-litigating any decision — past-you may have paid for it.
- Row counts are design evidence. A feature with zero rows is a feature to delete.
- Real data is for *verifying*; realistic data is for *demonstrating*. Live data is
  usually test junk that makes the prototype unjudgeable — invent data shaped like the
  user's actual life.
- **Greenfield** (no repo, no db): excavate the user instead — their current
  tools, exports, spreadsheets — then go straight to Phase 2.

## Phase 2 — Collapse

Ask: **what is written N times here with the nouns swapped?** Five sketched flows are
usually one screen sequence with a subject and an intent bound in. The answer is the
object model; finding it late means building it five times. Write it down as entity
files (Phase 4 fixture rules), not as screens' worth of data.

## Phase 3 — Document by level

Docs are organised on two axes: **lifecycle folders** (where a file lives says
whether you may edit it) and **stability levels** (0 intent → 1 law → 2
behaviour → 3 architecture → 4 mechanism → 5 in-flight; a document may rest on
things ABOVE it, never below). The scaffold ships the level docs as templates
with `[FILL: …]` markers — each marker carries its own elicitation prompts, so
the questions to ask are in the file you're filling.

**Write top-down, and aim the dialogue at the level you're on:**

1. `docs/reference/intent.md` (L0) — what it's for and the **spiky points of
   view**. Ask what existing tools get wrong, what they'd keep against user
   protest, what they trade away deliberately.
2. `docs/reference/product-invariants.md` (L1) — laws extracted from intent,
   never from designs. Ask what survives any redesign; what makes a feature a
   bug even if it tested well. A law that tracks a design restates instead of
   constrains.
3. `docs/design/object-model.md` (L2) — Phase 2's collapsed object model, made
   durable; the fixture is its executable twin and they change in the same turn.
4. `docs/design/<screen>.md` per screen/flow, from `_screen-template.md`, as
   the session produces them.

L4 (stack) is settled by this skill; L5 lives in `docs/plans/`.

**During any conversation, when the user states an opinion, a constraint, or a
"never/always," ask yourself which level it belongs to and write it there in
the same turn** — unfiled statements are the ones that end up contradicting a
decision made five hours later. If a statement has no home, that's a missing
doc, not a reason to drop it.

Per document, the working rhythm: analysis → numbered questions, **each with a
recommended answer** (a recommendation makes "yes" cheap; an open question makes
it work) → write → end with **"Assumptions made"** and **"Open items"**. Make
routine calls unilaterally and state them; spend the user's attention only on
genuine forks. Defer explicitly, with the reason deferral is safe.

## Phase 4 — Slice: one narrative through the whole app

**Do not explain the system. Let them operate it.** A static annotated wireframe is a
rulebook read at you — nothing to hang it on. Build one vertical slice through the
*entire* app, clickable, following a single realistic narrative. Slice by narrative,
not feature: "a Tuesday" touches seven subsystems and teaches how it feels to live in
the thing; "the proposal flow" touches one doc.

**Ugly means unstyled, not unstructured.** The architecture below is decided here, in
the first hour. Retrofitting it is the expensive version (six repair commits, in the
evidence case).

### The stack — settled, not re-decided

```sh
npm create vite@latest <name> -- --template react-ts
cd <name> && npm install
sh <skill-dir>/assets/scaffold.sh   # one shot: layout, gate, hooks, Playwright, host, states page, walkthrough
npx shadcn@latest init              # interactive; scaffold pre-wired tailwind + aliases so preflight passes.
                                    # At the prompts: Radix, default preset — unless the user says otherwise.
```

`scaffold.sh` is this skill's setup made deterministic — run it before the first
component, never later. It creates the canonical layout, copies the gate and the
pre-commit hook, installs Playwright (chromium-only, `webServer` self-starts Vite —
rules in `references/flow-tests.md`), ships the store host with the dev invariants
built in, and deliberately overwrites `main.tsx` (states route + StrictMode +
Walkthrough). A lock that needs setup first is a lock that gets deferred.

### Canonical layout — never re-derive it

Everything below marked ◆ is created by `scaffold.sh` from the skill's templates —
never re-derived, never rewritten per project.

```
docs/
  reference/
    intent.md       ◆ L0 — what it's for + spiky points of view (Phase 3 fills)
    product-invariants.md ◆ L1 — laws, constrained by intent
  design/
    object-model.md ◆ L2 — the fixture's prose twin
    _screen-template.md ◆ copied per screen as the session produces them
  plans/            # L5 — in-flight work; delete when done
src/
  fixtures/
    now.ts          ◆ the one frozen instant every timestamp derives from
    entities/       # becomes tables — sources.ts exports SOURCES, …
    script/         # walkthrough screenplay; notes.ts ◆ — becomes nothing
    view/           # chip lists, colour tokens — becomes nothing
    accessors.ts    ◆ accessor() helper — sourceOf(id) etc., throws on miss
  store/            ◆ reducer.ts starter — pure; the gate keeps it that way
  host.tsx          ◆ the ONLY file touching store AND react; dev invariants built in
  components/       # L2 primitives, wrapped registry components included
  screens/          # L3 — composition only
  states.tsx        ◆ /__states — auto-collects STATES via import.meta.glob
  walkthrough.tsx   ◆ <Walkthrough> strip + <Mark> markers
  main.tsx          ◆ states route + StrictMode + Walkthrough (overwritten)
e2e/
  helpers.ts        ◆ test/expect with the clock pre-pinned to NOW
  flows/            # one spec per locked flow
playwright.config.ts ◆
scripts/gate.mjs    ◆
scripts/strip-harness.mjs ◆  # Phase 7: deletes/unwraps every harness affordance
.githooks/pre-commit ◆
```

### Conventions — decided once, here

- **Ids are `<type>:<kebab-slug>`** (`src:fee-salience`). The slug is minted from
  the title once and **never changes when the title does** — renaming a label must
  not touch references.
- **Accessors are `<entity>Of(id)` and throw on a miss.** Returning `undefined`
  is the display-name merge bug wearing a seatbelt.
- **Actions are `{ type: 'entity/verb', …data }`** — data only, never closures.
- **`ACTIONS` is a fixture** — `fixtures/entities/actions.ts`, an append-only
  array of `{ at, by, action }` rows (`at` derived from `NOW`; `by` = the owner
  or `'model'`), seeded like any entity, destined for the actions table. It is
  NOT the host's runtime dispatch log — that exists only for replay equality.
- **Every fixture timestamp derives from `NOW`**, and flow tests install the same
  value. One frozen instant everywhere, or determinism dies in the seams.
- **Aria snapshots live inline in the test.** The test is the readable flow spec; a
  snapshot exiled to a `.aria.yml` file is a spec nobody reads.

> **A prototype differs from the real app only in where data comes from — never in
> what the UI is made of.**

Every prototype-only idiom is paid for twice: once to maintain, once to port. The
"one double-clickable file" constraint is what buys the three most expensive ones —
delegated-event tables, full-`innerHTML` re-render, HTML-in-strings. Ninety seconds
of scaffold deletes all three: HMR, local state, typed props so the compiler finds
every call site when a primitive changes.

### Four layers

**L0 — Fixture.** Typed plain data. No HTML, no CSS values (`c: 'p1'` the token name,
never `'var(--p1)'`; a tweet is `{kind:'tweet', author, text}` rendered by a
component, never a `body` of raw HTML). Export accessors (`projectOf(id)`) so "don't
reach into the fixture" has a cheap path. Full rules below.

**L1 — Logic.** Pure functions plus the reducer. Never imports from the view, never
returns markup. The sorting rule: **if it reads state and does not return markup, it
is not view** — move it to the store, with tests, on day one.

**L2 — Primitives.** Every class a screen uses belongs to a primitive, not the
screen. Adopt vs build:

```
Would a stranger recognise this control by name?
├── Yes (dialog, toast, tabs, popover, combobox, checkbox, tree-with-dnd)
│     → adopt: npx shadcn add <thing>   (CLI resolves any registry, e.g. @magicui/…)
└── No (the step chain, the metric tabs — your novel components)
      → build it. The second list is your design; the first is work done twice.
```

In the evidence case, novel components were ~1/5 of component code; the other 4/5
(modal, toast, tabs, chips, checkbox tree, drag-reorder) were designed, debugged,
and ported for nothing.

- **Wrap every adopted component in your own named one.** Screens import your
  `Sheet`, never the registry `Dialog` — same cheap-path logic as L0's accessors,
  and it keeps utility classes on the correct side of the line by construction.
- **Never hand-roll a control to dodge a dependency: accessibility does not
  retrofit.** A hand-built checkbox with wrong semantics means rewriting the
  component and its tests together.

**L3 — Screens.** Composition only. A new visual is a new primitive or a new
variant — never a style decision made in a screen file.

### Gates — copied in, not written; run on every commit

The gate is `assets/gate.mjs`, a zero-dependency node script the scaffold installs
as `scripts/gate.mjs` (wired to `npm run gate`, which adds `tsc -b`). **Never
rewrite it per project** — a fix belongs in the skill's copy, so every prototype
inherits it. Its rules, each enforcing a standard defined elsewhere in this skill:

| rule | enforces |
| --- | --- |
| `inline-style` | no `style=` — a decision with no name |
| `utility-in-screen` | utilities live in primitives; Tailwind makes the unnamed decision *cheaper*, so the gate is stricter, not looser |
| `export-let` | no module-level mutable state hiding from the store |
| `impure-store` | no `Date.now` / `Math.random` / DOM / timers in the reducer |
| `store-imports-view` | store never imports components, screens, or react |
| `fixture-holds-view` | no CSS values, HTML, or wall-clock dates in entities |
| `seam-leak` | the view reads through accessors, never `fixtures/entities` |
| `raw-registry-import` | screens import your wrapped primitive, never `components/ui` |
| `missing-states` | every primitive exports `STATES` |
| `bad-locator` | flow tests use role/name only — no test ids, sleeps, or class/id `.locator()` selectors |
| `strict-mode` | `main.tsx` keeps `<StrictMode>` — it *is* the render-idempotence check |
| `bad-id-format` | entity ids are `type:kebab-slug` |
| `bad-action-name` | reducer cases are `'entity/verb'` strings |
| `bad-test-name` | flow test names are verb-first, never "should" |
| `snapshot-in-file` | aria snapshots stay inline — the test is the readable spec |
| `accent-leak` | the harness accent appears nowhere in the product |

Escape hatch: a `gate:allow <rule-id>` comment on or above the line. A rule needs a
cheap path — and the allow comment makes every exception deliberate and greppable,
instead of a rule silently ignored.

The pre-commit hook runs the gate plus the flow suite, so every commit re-proves
the standards and the locked flows without anyone remembering to. **Definition of
done for every change set, committed or not: `npm run gate` and
`npx playwright test --pass-with-no-tests` both green, run before reporting
the change complete** (the flag matters before the first flow is locked).
Reporting done without running the gate is not finishing; it is stopping.

### Fixture rules (in the order they pay)

Shape the fixture like a query result, not like a screen — it is where the object
model lives, and someone will read the schema off it. If a screen wants a different
shape, that is what accessors are for.

1. **Write the interface first, and let it be the DTO.** The interface is what the
   loader returns, what the table mirrors, what the component takes as props. You
   cannot write `{name: [def, example]}` as a named interface without noticing the
   positional tuple.
2. **One file per entity, one array per entity, named for the table it becomes.**
   `fixtures/sources.ts` exports `SOURCES` — never one `MOCK` object with twelve
   heterogeneous keys.
3. **Segregate by lifetime, in directories:** `entities/` becomes tables; `script/`
   (the walkthrough's screenplay — proposals, planted near-duplicates) is
   deleted at the strip; `view/` (chip pickers, colour tokens) **becomes no
   table** — the files themselves survive into production as UI option data.
   "Is this a table?" is then answered by the path.
4. **Explicit `id` on every entity; every reference by id, never by name.** Two
   entities with the same display name silently merge in a name-keyed object, and
   renaming a label — the most frequent change there is — breaks every reference.
   Legibility is what `nameOf()` is for.

   ```ts
   // Bad — joins on rendered strings
   { title: 'Fee salience', ideas: ['Client selection', 'Scope creep'] }
   // Good — ids + join table
   { id: 'src:fee-salience', title: 'Fee salience' }
   export const SOURCE_IDEAS = [{ source: 'src:fee-salience', idea: 'idea:client-selection' }]
   ```

5. **Many-to-many gets its own array**, never an embedded list. It reads worse and it
   *is* the join table — cardinality becomes visible, and the column the pair grows
   later has a place to go.
6. **`owner` and timestamps on every entity from line one**, even though a
   single-user frozen fixture never reads them. Free now; a seventeen-table
   migration later.
7. **One append-only `ACTIONS` array from day one.** A frozen snapshot contains
   nothing that has a history — event logs, versions, blocking — and that question
   generated a third of the real schema.

The payoff: entity arrays become seed rows 1-1, interfaces are already DTOs, and
`sourceOf(id)` becomes the loader's query function with the **same signature** — so
no screen changes when the data starts coming from Postgres.

### Store rules — logic that ports is logic that crossed unedited

- **Named actions, one reducer, actions carry data and never closures.**
- **Effects as data on a queue the host drains.** The single best portability call
  on record — the design survived the port verbatim. Copy it first.
- **Run invariants at the tail of every case that can break them** — never "before
  every render". If correctness depends on *when* render happens, it will not port:
  the target framework owns render timing, you do not.
- **No module-level mutable state outside the store.** Mint ids from a counter *in*
  state (a module counter burns ids under double-invoked producers). Grep
  `export let` and judge each — the store itself and a timer handle are legitimate.
- **Navigation is an action; never rebuild state on a screen change** — or a save
  works and the navigation it requested throws the result away. Free in the
  prototype; unfindable there too.
- `Set` in state is fine. It survives frameworks' identity checks.

The host ships in the scaffold (`src/host.tsx`): `dispatch`, `useAppState`, the
`_fx` drain with an `fxHandlers` registry, and the dev invariants below already
wired. Use it — never hand-roll a second store plumbing. A reducer case describes
its effects and nothing else:

```js
case 'task/complete':
  return { ...s, done: add(s.done, a.id), _fx: [...s._fx, { fx: 'toast', text: 'Done' }] };
```

**Five checks — three run themselves, one is the gate, one stays judgment:**

1. **Replay equality** — built into the host: after *every* dispatch, the action
   log is re-reduced from `freshState()` and compared to live state. Throws the
   instant any state lives outside the store, a case reads the DOM, an effect
   writes state directly, or anything nondeterministic gets in (ids minted from
   `Date.now()`). The property that makes the port a copy, checked continuously.
2. **Render idempotence** — StrictMode double-invokes render; the scaffold's
   `main.tsx` keeps it on and the gate's `strict-mode` rule refuses its removal.
3. **Freeze what render sees** — the host deep-freezes state after every dispatch,
   so view writes throw at the write instead of corrupting quietly. (`Set`
   mutations cannot be frozen out — they surface as replay divergence instead.)
4. **Architecture** — the gate: `export-let`, `impure-store`, `store-imports-view`.
5. **Derived data belongs to the store** — the one that stays judgment: if it
   reads state and does not return markup, move it to `store/`, with tests.

Warning that motivates all five: **a full `innerHTML` re-render hides every piece of
state living outside the store** — the world is re-read each frame, so staleness is
structurally impossible, right up until the framework arrives and it all surfaces at
once. The checks fail *now* instead.

### A states page

One route (`/__states`) rendering every primitive in every variant and every screen
in its edge states: empty, one item, overflowing, error. Large changes verify in one
scroll instead of a walkthrough; "this screen is an unstyled bulleted list" gets
caught before a port, not after. It is also the home for **absence cases** — no
Delete, nothing pre-selected — because an absence is easiest to see beside the state
that has it. It earns most on an adopted-component stack: 74 components' worth of
variants you did not author and cannot hold in your head.

Mechanism — shipped, not built: every primitive exports a `STATES` array of
`{ name, props }` variants (the gate's `missing-states` rule enforces it), and the
scaffold's `src/states.tsx` auto-collects them with `import.meta.glob`. There is no
registry to maintain and the page cannot go stale. Screens' edge states are the
manual half: add them as sections in that file as each screen lands.

### Address by role and accessible name, from the start

Checks then port to Playwright in spirit and stop breaking on class renames — and a
ported app often ships no test hooks, so accessible names end up the only thing
keeping it drivable. **Keep volatile text out of the name**: "Change time of X,
currently 10:20" is a fine label and a locator that churns every run — put the
changing part in `aria-describedby`.

## Phase 5 — Walk it

Physically, with the user. Note what feels *wrong*, not what looks wrong — load
`references/walk-critique.md` for the seven failure families that are invisible in
prose and obvious in use.

The harness ships in the scaffold (`src/walkthrough.tsx`, already wrapping the app
in `main.tsx`). Using it is two moves: write the notes into
`src/fixtures/script/notes.ts` as `{ id, target, text, expect, … }` — never as
prose in markup — and wrap each control a note references in `<Mark note="n1">`.
The strip (one note at a time, `‹ 3/6 ›`), the single glowing marker,
scroll-to-marker on step, the exactly-one-marker assertion, and the kill switch
are built in.

**The harness's whole job is working memory** — it exists because a real
walkthrough reported "the notes at the bottom and the numbers everywhere are
getting overwhelming." Every affordance trades screen pixels for what the walker
would otherwise have to hold in their head, disclosed progressively (the strip
shows one line; `+` opens the rest):

- **Outcome maps** — a note can carry `outcomes: [{ input, expect }]`: the full
  possibility table for the marked control, on demand. "What will each input get
  me" is answerable *before* acting instead of by trial.
- **Flows** — notes with a `flow` key group into narratives; the strip gets a flow
  picker and per-flow progress. A fully-walked flow is, verbatim, the spec its
  locked test is written from.
- **Unwalked count** — the harness tracks which notes this session has stepped
  through and shows what remains. Coverage of the walk stops being a thing anyone
  has to remember.
- **Action trail** — the last few dispatched actions, read from the host's
  replay log. "What just happened" survives a distraction.
- **Absence notes** — `kind: 'absence'` renders with zero markers (asserted): the
  load-bearing thing that *isn't* there, stated where it isn't.
- **Reachability** — a note with a `when(state)` predicate hides until the state
  it describes exists; a note about grouped rows is noise until a grouped row does.

The design it encodes, so it never gets argued back out (it took two rounds to
find): a numbered list of notes **is a rulebook**, and superscripts everywhere make
you scan for numbers instead of looking at the interface — so one note, one marker,
and the accent colour *is* the pointer (nothing in the product may use it). The
markers register against components at render, never `querySelector` paths into
product markup — or renaming one class breaks the notes and the regression suite at
once. Notes-as-data pays three times: the strip renders them, the marker assertion
checks them, the port audit reads them as its coverage spec.

Two judgments stay yours while walking:

- **Consolidate notes** — merge same-observation pairs; fold an example into the
  rule above it.
- **Scaffolding gets a dashed border** (a prototype clock, "jump to evening") — the
  user must never wonder whether something is a design decision.

### Lock approved flows as e2e tests

When the user approves a flow while walking — *click this, it says this, it does
this* — **write the Playwright test in the same turn**, while the narration is still
on screen. The narration is the spec; batched-for-later, it evaporates. Full
mechanics in `references/flow-tests.md`; the shape in brief:

- One test per flow, named for the narrative, alternating act → assert exactly as
  narrated. Role/name locators only; each "it says this" is a scoped
  `toMatchAriaSnapshot` (structure and copy, not pixels — restyling is not a flow
  change and must not fail the suite); `page.clock.install` pins the fixture's
  frozen date.
- Run `npx playwright test --ui` (watch mode) while iterating, and the plain suite
  after every LLM-driven change set. **This is how "the moment a flow changes, you
  know" actually happens — an unrun suite knows nothing.**
- A failure forces the decision silent drift never does: intended → update test and
  snapshots in the same turn as the change (a stale flow test is a stale spec);
  unintended → regression, fix before continuing. Never `--update-snapshots` to get
  green without deciding which — that converts the suite into a baseline pinning
  the app to itself.
- Locking the first flow is the Phase 0 crossing: the prototype is keep-code now.
  Say so.

## Phase 6 — Widen, and keep the docs honest

More narrative slices until the feature set is covered. **Prioritise the next slice
by what is least validated, not what is next in the docs** — novel interface beats
"the list you built, plus checkboxes". Some things are cheaper to get right in the
build than to prototype; saying so is part of the job.

- Docs and prototype update **in the same turn**; drift accumulates exactly by
  deferring the doc edit.
- Flag contradictions out loud before implementing a change that cuts against an
  established principle.
- Retire old vocabulary completely, in the same change — no legacy cross-reference
  tables "for continuity".
- Before compacting, grep the docs for names and buttons that changed while
  iterating. Contradictions cluster in the doc written *first* and left alone.

## Phase 7 — Raise fidelity, port, audit

Raising fidelity is a **visual** step — the architecture was Phase 4 and cannot be
deferred to here. If the rules held, the port is mostly copying files.

**First act of the port: `git tag prototype`, then strip the harness,
deterministically.** The tag preserves the walkthrough and notes as the fidelity
audit's reference side — strip deletes both. On a clean tree
(the script refuses otherwise): `node scripts/strip-harness.mjs` deletes
`walkthrough.tsx` and `fixtures/script/`, unwraps every `<Mark>` and the
`<Walkthrough>` wrapper, verifies no code-level harness reference survives, and
reports what it touched. Add `--states` to also drop the states page (default:
keep it — it is useful in production too). The strip commit may carry the
strip's blank lines unformatted — the prototype ships no formatter; the
production toolify's biome pass owns formatting. `npm run gate &&
npx playwright test` must be green before the strip commit — the flow tests
survive by design, because they never touched the harness.

Then **audit the port against the prototype, once, at the moment of porting** —
load `references/port-audit.md`. The prototype is the specification and the distance
to it is the only number that says whether the port succeeded. Nothing fails when you
skip this, which is exactly why it gets skipped — treat it as a phase, not a favour.

For everything past the strip — stack, database, environments, static analysis,
docs, deploy — load the **production-port** skill; its entry criteria are this
skill's exit state.
