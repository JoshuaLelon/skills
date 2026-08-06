// The HOST (ADR-0007) — the only file touching both store and framework.
// SSR note (the port recipe's "carries edited"): the module-level store is a
// BROWSER singleton. useSyncExternalStore gets a server snapshot (freshState)
// so SSR renders the initial state; dev invariants run client-side only.
import { useSyncExternalStore } from 'react'
import type { Action, State } from './store/reducer'
import { freshState, reducer } from './store/reducer'

let state: State = freshState()
const log: Action[] = []
const subs = new Set<() => void>()
const SERVER_SNAPSHOT: State = freshState()

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
