// Walkthrough notes as data, keyed by control — one file, four consumers: the
// strip renders them, the one-marker assertion checks them, the port audit
// reads them as its coverage spec, and locked flows are written from them.
// Never render notes as prose in markup. strip-harness.mjs deletes this whole
// directory at port time — nothing here may be imported by product code.
import type { State } from '../../store/reducer'

export interface Note {
  id: string // 'n1', 'n2', …
  target: string // component name + slot, e.g. 'Row/title'
  text: string // do this
  expect: string // expect this — include the why when the why is the design
  flow?: string // narrative this note belongs to, e.g. 'tuesday' — walked in order
  kind?: 'do' | 'absence' // absence = the load-bearing thing that ISN'T there;
  //                          marked HOLLOW, on the spot where it would be
  when?: (s: State) => boolean // only show when reachable (e.g. a grouped row exists)
  outcomes?: { input: string; expect: string }[] // the possibility map for this control
}

export const NOTES: Note[] = []
