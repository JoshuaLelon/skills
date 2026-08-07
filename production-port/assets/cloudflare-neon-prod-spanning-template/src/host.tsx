// The HOST (ADR-0007) — the only file touching both store and framework.
// SSR note (the port recipe's "carries edited"): the module-level store is a
// BROWSER singleton. useSyncExternalStore gets a server snapshot (freshState)
// so SSR renders the initial state; dev invariants run client-side only.
import { useSyncExternalStore } from 'react'
import type { Action, Fx, State } from './store/reducer'
import { freshState, reducer } from './store/reducer'

let state: State = freshState()
const log: Action[] = []
const subs = new Set<() => void>()
const SERVER_SNAPSHOT: State = freshState()

// The effect registry. A reducer case describes its effects as data and nothing
// else; the impure half — timers, animations, focus, anything touching the DOM —
// is registered here by name. Registering is how an effect gets a body: an `fx`
// with no handler is dropped, which keeps the reducer honest but means a typo in
// the name fails silently. Handlers receive `dispatch` so an effect can feed a
// result back in as a named action rather than writing state behind the store.
/** @public — effect handler signature, implemented by apps. */
export type FxHandler = (fx: Fx, dispatch: (a: Action) => void) => void
const fxHandlers = new Map<string, FxHandler>()

/** @public — the effect registry is API for apps; the exemplar registers none. */
export function registerFx(name: string, handler: FxHandler): void {
	fxHandlers.set(name, handler)
}

export function dispatch(a: Action): void {
	log.push(a)
	state = reducer(state, a)
	const fx = state._fx
	if (fx.length) state = { ...state, _fx: [] }
	if (import.meta.env.DEV && typeof document !== 'undefined') {
		assertReplay()
		deepFreeze(state)
	}
	for (const s of subs) s()
	// Drained AFTER subscribers, so an effect always observes the settled state
	// it was described from — and a handler that dispatches re-enters cleanly.
	for (const f of fx) fxHandlers.get(f.fx)?.(f, dispatch)
}

export function useAppState(): State {
	return useSyncExternalStore(
		(cb) => {
			subs.add(cb)
			return () => subs.delete(cb)
		},
		() => state,
		() => SERVER_SNAPSHOT,
	)
}

// Dev affordance: "what just happened". The log already exists for replay
// equality; exposing the tail costs nothing. (The prototype's walkthrough
// renders it; production simply never calls it.)
/** @public — dev affordance the prototype walkthrough renders. */
export function recentActions(n: number): Action[] {
	return log.slice(-n)
}

function assertReplay(): void {
	let replayed = freshState()
	for (const a of log) replayed = reducer(replayed, a)
	if (JSON.stringify({ ...replayed, _fx: [] }) !== JSON.stringify({ ...state, _fx: [] })) {
		throw new Error('replay equality violated — state lives outside the store or a case is impure')
	}
}

function deepFreeze<T>(o: T): T {
	if (o && typeof o === 'object' && !Object.isFrozen(o)) {
		Object.freeze(o)
		for (const v of Object.values(o)) deepFreeze(v)
	}
	return o
}
