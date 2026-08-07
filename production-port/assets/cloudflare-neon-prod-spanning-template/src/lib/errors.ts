// The error taxonomy (ADR-0008) + the wide-event boundary (ADR-0009).
//
//   EXPECTED — a state the product knows about (not found, forbidden, gone).
//   Throw an AppError; the route boundary renders its publicMessage. Logged
//   as outcome:'expected' at info — a 404 is behaviour, not an error.
//
//   UNEXPECTED — everything else: recorded INTO the invocation's wide event
//   (outcome:'error' with stack), so the error line automatically carries
//   everything enriched before the failure — not just what the catch knew.
import { type WideEvent, wide } from './log'

export class AppError extends Error {
	readonly status: number
	readonly publicMessage: string
	constructor(status: number, publicMessage: string) {
		super(publicMessage)
		this.name = 'AppError'
		this.status = status
		this.publicMessage = publicMessage
	}
}

/** @public — error taxonomy surface; used by app routes, not by the exemplar. */
export const notFound = (what = 'Not found') => new AppError(404, what)
export const forbidden = (why = 'Not allowed') => new AppError(403, why)
/** @public — error taxonomy surface; used by app routes, not by the exemplar. */
export const badRequest = (why = 'Bad request') => new AppError(400, why)

// Wrap every loader/action body. One wide event per invocation: base fields at
// entry, handler enriches via add(), exactly one emit in every exit path.
//
//   export async function loader({ params }: Route.LoaderArgs) {
//     return guarded('today/load', { ref: params.ref }, async (add) => {
//       const day = await readDay(...)
//       add({ items: day.items.length, owner: day.owner })
//       return day
//     })
//   }
export async function guarded<T>(
	event: string,
	base: Record<string, unknown>,
	fn: (add: WideEvent['add']) => Promise<T>,
): Promise<T> {
	const evt = wide(event, base)
	try {
		const result = await fn(evt.add)
		evt.emit('ok')
		return result
	} catch (err) {
		if (err instanceof AppError) {
			evt.emit('expected', { status: err.status, reason: err.publicMessage })
			throw new Response(err.publicMessage, { status: err.status })
		}
		if (err instanceof Response) {
			evt.emit('expected', { status: err.status })
			throw err
		}
		evt.emit('error', { err: err instanceof Error ? err : new Error(String(err)) })
		throw err
	}
}

// Runtime validation at EXTERNAL boundaries — webhooks, third-party POSTs,
// public endpoints — the one wire RR8 route types cannot cover. Schema-agnostic
// (anything Zod-shaped). Internal loader/action data needs no parse: the type
// system already carried it. For schemas derived from tables, use drizzle-zod —
// deriving beats duplicating (two artifacts kept in sync by hand will drift).
interface SafeParser<T> {
	safeParse(input: unknown): { success: true; data: T } | { success: false; error: unknown }
}

export function parseOr400<T>(schema: SafeParser<T>, input: unknown): T {
	const r = schema.safeParse(input)
	if (r.success) return r.data
	throw new Response(JSON.stringify({ error: 'invalid_request', issues: r.error }), {
		status: 400,
		headers: { 'content-type': 'application/json' },
	})
}
