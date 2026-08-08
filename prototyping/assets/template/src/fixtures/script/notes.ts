// Walkthrough notes as data, keyed by control — one file, four consumers: the
// drawer renders them, the one-marker assertion checks them, the port audit
// reads them as its coverage spec, and locked flows are written from them.
// Never render notes as prose in markup. strip-harness.mjs deletes this whole
// directory at port time — nothing here may be imported by product code.
import type { State } from '../../store/state'

/**
 * EVERY ROUTE A MARKER CAN BE ON. Narrow this to your own routes as each one
 * lands, and keep it in step with `routes.ts` — a union rather than `string`,
 * so a path that does not exist is a compile error instead of a note that
 * silently never appears, which is the failure this file is least able to
 * notice on its own. `/__states` is deliberately absent: the states page
 * renders primitives out of context and carries no markers.
 */
export type NotePath = '/'

export interface Note {
  // 'n1', 'n2', … MINTED ONCE AND NEVER RENUMBERED. `<Mark note="n9">` names a
  // note from inside product markup, so closing a gap after deleting or merging
  // notes moves every marker after it onto the wrong control — silently, since
  // every id still resolves. GAPS ARE CORRECT. The number is an identity, not a
  // position; the order walked is the array's order, and `flow` groups it.
  id: string
  target: string // component name + slot, e.g. 'Row/title'
  /**
   * WHERE THE MARKER LIVES. Required, and required for a reason: a note offered
   * on a screen you are not on names a control that is nowhere, and the
   * one-marker assertion then fires on every OTHER screen — noise that teaches
   * you to ignore the one report that catches a marker going missing.
   *
   * Optional was tried and is the bug: the next note written is ungated by
   * default, and the drawer goes back to offering "Tick any row" on a screen
   * with no rows. It is invisible at three screens and constant at seven.
   *
   * A PATH, not a screen name held in state. The ROUTER decides what renders,
   * so the router is the only thing that agrees with where the markers are; a
   * `screen` field in state is written by a handful of actions, and the nav
   * rail and a typed URL both move the router past all of them.
   *
   * It is per NOTE and not per flow, because the marker is per note. Deriving
   * it from `flow` happens to work while every flow sits on one screen, and the
   * first note that walks you onward — "then go and read the digest" — turns
   * the gate back into the bug, silently.
   */
  at: NotePath
  text: string // do this
  expect: string // expect this — include the why when the why is the design
  flow?: string // narrative this note belongs to, e.g. 'tuesday' — walked in order
  kind?: 'do' | 'absence' // absence = the load-bearing thing that ISN'T there;
  //                          marked HOLLOW, on the spot where it would be
  when?: (s: State) => boolean // only show when reachable (e.g. a grouped row exists)
  outcomes?: { input: string; expect: string }[] // the possibility map for this control
}

export const NOTES: Note[] = []
