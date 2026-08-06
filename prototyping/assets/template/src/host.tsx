// The HOST — the only file that touches both the store and the framework.
// The dev invariants from the prototyping skill run themselves here on every
// dispatch: replay equality (the strongest single check — fails the instant any
// state lives outside the store or a reducer case is impure) and deep-freeze
// (view code that writes to state throws at the write, not corrupts quietly).
// Render idempotence is StrictMode's job — the gate checks main.tsx keeps it.
import { useSyncExternalStore } from 'react'
import { reducer, freshState } from './store/reducer'
import type { Action, Fx, State } from './store/reducer'

let state: State = freshState()
const log: Action[] = []
const subs = new Set<() => void>()

// Register effect handlers here (toasts, timers, navigation side effects).
// The reducer only *describes* effects; this is where they run.
export const fxHandlers: Record<string, (fx: Fx) => void> = {}

export function dispatch(a: Action): void {
  log.push(a)
  state = reducer(state, a)
  const fx = state._fx
  if (fx.length) state = { ...state, _fx: [] }
  if (import.meta.env.DEV) {
    assertReplay()
    deepFreeze(state)
  }
  for (const s of subs) s()
  for (const f of fx) (fxHandlers[f.fx] ?? warnNoHandler)(f)
}

export function useAppState(): State {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => state,
  )
}

// Dev affordance: "what just happened". The log already exists for replay
// equality; exposing the tail costs nothing.
export function recentActions(n: number): Action[] {
  return log.slice(-n)
}

function warnNoHandler(f: Fx): void {
  console.warn('host: no fx handler registered for', f.fx, f)
}

// -- dev invariants ----------------------------------------------------------

// O(actions) per dispatch — fine at prototype scale, and worth every cycle:
// this is the property that makes the port a copy.
function assertReplay(): void {
  let replayed = freshState()
  for (const a of log) replayed = reducer(replayed, a)
  if (!deepEqual({ ...replayed, _fx: [] }, { ...state, _fx: [] })) {
    console.error(
      'REPLAY DIVERGENCE — state lives outside the store, or a reducer case is impure (DOM read, Date.now, direct write)',
      { replayed, state },
    )
    throw new Error('replay equality violated')
  }
}

// NOTE: Object.freeze cannot block Set/Map mutation — Sets in state are fine
// (skill: store rules) but mutating one in view code will surface via replay
// divergence rather than a freeze throw.
function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o)) deepFreeze(v)
  }
  return o
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (a instanceof Set && b instanceof Set)
    return a.size === b.size && [...a].every((v) => b.has(v)) // Sets of primitives
  if (a instanceof Map && b instanceof Map)
    return a.size === b.size && [...a].every(([k, v]) => b.has(k) && deepEqual(v, b.get(k)))
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    return (
      ka.length === kb.length &&
      ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
    )
  }
  return false
}
