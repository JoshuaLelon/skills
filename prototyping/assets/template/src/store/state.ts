// WHAT THE STORE HOLDS, and the helpers every case is written with.
//
// This is the BOTTOM of the store. It imports the fixtures and the pure modules
// beside it; `reducer.ts` and anything under `slices/` import from here and
// never the other way. That one-way arrow is the whole reason the split has no
// cycle — a case takes `State` as a type and the helpers as functions, and both
// come from this file.
//
// THE SPLIT SHIPS FROM LINE ONE, and it is not a size decision. `freshState`
// seeds rows, so this file has fixture rows in scope; a file with reducer cases
// may not (skill: store rules), because a case reaching a module array reads
// outside its arguments and NOTHING catches it — `impure-store` looks for clocks
// and the DOM, and replay equality cannot see it, since the fixture is constant
// within a run. The gate's `fixture-in-reducer` rule enforces the separation by
// the only proxy a line rule has: the import. Seeding and reducing in one file
// passed only while `worlds.ts` held no rows; the first real world puts
// `fixtures/entities/` in that file's scope and the proxy is routed around
// silently. Two files, and the rule holds by construction.
//
// PURE. Actions carry data, never closures; effects go on `_fx` and the host
// drains them after the state settles.
import { NOW } from '../fixtures/now'
import { WORLD, WORLDS, type World } from '../fixtures/worlds'

export type Fx = { fx: string } & Record<string, unknown>

export interface State {
  seq: number // id mint — a module-level counter burns ids under StrictMode
  // TIME IS AN INPUT, NEVER A READING. Everything time-dependent — overdue,
  // "2 days ago", which greeting, what the evening screen contains — is a pure
  // function of (state, now). Nothing reads the wall clock while DECIDING
  // anything: a reducer that did would be impure, unreplayable, and testable
  // only at this one moment.
  //
  // It opens at the fixture's frozen instant so the first render is
  // deterministic (freshState must be pure — replay equality re-runs it), and
  // the timer in root.tsx corrects it on mount. A flow test moves it with
  // `page.clock.fastForward`, through this same action, touching no harness
  // affordance — which is what lets a locked flow survive the strip.
  //
  // NEVER replace this with a mode you SET (`evening: true`). That makes the
  // harness button and the shipping behaviour two code paths with only one of
  // them ever under test. If nothing here depends on time, delete the timer and
  // leave `now` frozen; do not delete the field and reintroduce time as a flag.
  now: string // ISO, at the granularity the UI shows (minutes here)
  _fx: Fx[] // effects as data; the host drains them after every dispatch
}

// STATE IS AN INPUT TOO, like `now` — but it arrives ONCE, at construction, so
// it is this function's argument and never an action. The parameter is the
// PORT's signature, not a test affordance: production's initial state comes from
// a loader for one owner, so a no-argument `freshState` cannot exist there. The
// default keeps every call site unchanged, including the three in `host.tsx`,
// which stays byte-identical with production's. `fixtures/worlds.ts` holds the
// two rules a world obeys, and `worlds.test.ts` checks the second one.
export function freshState(world: World = WORLD): State {
  return { seq: 0, now: NOW.toISOString(), _fx: [], ...WORLDS[world]() }
}

// Put the helpers the cases are written with below this line — `announce`,
// `withFx`, whatever settles derived fields. They belong here and not in
// `reducer.ts` for the same reason `freshState` does: a helper that reads the
// fixture must not sit beside the cases that could reach it.
