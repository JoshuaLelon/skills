// THE ACTION UNION AND THE CASES, and nothing else. What the cases are written
// with — the `State` types, `freshState`, and every helper — lives in
// `state.ts`, one level below; this file imports from there and that file never
// imports back. See `state.ts` for why the two are separate from line one: a
// file holding cases may not have fixture rows in scope, and `freshState` seeds
// them (gate: `fixture-in-reducer`).
//
// Pure. Never imports the view or the framework — the gate enforces it.
// Actions carry data, never closures. Ids mint from `seq` IN state, never a
// module counter. Run invariants at the tail of every case that can break them.
//
// When the gate's `store slice` warning fires, split by ACTION PREFIX: one file
// per prefix in `slices/`, and this file reduced to the root `Action` union plus
// a delegation on the prefix (skill: store rules). `state.ts` is already at the
// bottom, so that split adds files and moves no line of it.
import type { State } from './state'

export type Action = { type: 'app/noop' } | { type: 'clock/set'; now: string }
// add cases as { type: 'entity/verb', ...data } — the gate enforces the shape

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'app/noop':
      return s
    // The only door time comes through.
    case 'clock/set':
      return { ...s, now: a.now }
  }
}

// THE STORE'S PUBLIC SURFACE IS THIS FILE. Re-exported rather than moved, so
// `host.tsx` and every screen keep importing `store/reducer` — that import is
// the seam the port copies across, and `host.tsx` must stay byte-identical with
// production's.
export type { Fx, State } from './state'
export { freshState } from './state'
