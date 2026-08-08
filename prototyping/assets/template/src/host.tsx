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
// is registered here by name. Registering is how an effect gets a body, and an
// `fx` nobody registered is ALWAYS a bug (see reportUnhandled). Handlers receive
// `dispatch` so an effect can feed a result back in as a named action rather
// than writing state behind the store.
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
	const unhandled: string[] = []
	for (const f of fx) {
		const handler = fxHandlers.get(f.fx)
		if (handler) handler(f, dispatch)
		else unhandled.push(f.fx)
	}
	if (unhandled.length) reportUnhandled(unhandled)
}

// An effect with no registered handler used to be dropped in silence. That cost
// real hours: a button dispatched, the reducer handled it, the case emitted
// `{ fx: 'startProposal' }`, no handler existed, and NOTHING HAPPENED. The gate
// cannot see it — the reducer is correct. A flow test could not see it either,
// because the state is correct too; only the side effect is missing. A typo in
// a string was indistinguishable from an unimplemented feature.
//
// DEV THROWS, PRODUCTION LOGS, and both halves are correct in this one file.
// Dev is where a bug must stop the world: the throw lands in Vite's overlay,
// and `e2e/helpers.ts` fails any flow test on an uncaught page error, so a
// missing handler is now red instead of invisible. Production does not throw
// because by this point the state is committed and the subscribers have already
// rendered — turning one missing side effect into a blank screen makes the bug
// worse for the person using the app, and the report reaches the console either
// way. Every missing name is collected and reported AFTER the handlers that do
// exist have run, so one typo cannot swallow the rest of the batch.
function reportUnhandled(names: string[]): void {
	const msg = `host: no fx handler registered for ${names.join(', ')} — the effect was described and never performed (registerFx)`
	if (import.meta.env.DEV) throw new Error(msg)
	console.error(msg)
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
