// Pure. Never imports the view or the framework — the gate enforces it.
// Actions carry data, never closures. Ids mint from `seq` IN state, never a
// module counter. Run invariants at the tail of every case that can break them.

export type Fx = { fx: string } & Record<string, unknown>

export interface State {
  seq: number // id mint — a module-level counter burns ids under StrictMode
  _fx: Fx[] // effects as data; the host drains them after every dispatch
}

export function freshState(): State {
  return { seq: 0, _fx: [] }
}

export type Action = { type: 'app/noop' }
// add cases as { type: 'entity/verb', ...data } — the gate enforces the shape

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'app/noop':
      return s
  }
}
