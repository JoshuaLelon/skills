// The one door for server-side logging (ADR-0009). Two shapes, one rule each:
//
//   WIDE EVENTS — request-shaped work (loaders, actions, webhooks). One
//   canonical event per invocation: created at entry, ENRICHED during
//   handling via add(), emitted exactly once with outcome + duration_ms.
//   guarded() in lib/errors.ts owns this — handlers just call add().
//   13 scattered lines per request is the anti-pattern; 1 line with 50
//   fields is the design.
//
//   POINT EVENTS — log.info/warn/error, ONLY for work that is not
//   request-shaped (crons, queue consumers, outbound webhooks) or a genuinely
//   independent domain fact. If you're inside a guarded() handler, add() to
//   the wide event instead of emitting a new one.
//
// High cardinality is blessed: user ids, request ids, session ids as fields —
// Workers Logs indexes every field columnar-style and this is what makes
// production queryable. Do NOT embed unbounded payloads (full bodies, blobs):
// 256 KB/line truncates. Workers Logs also bills per event — consolidation
// into wide events is the cost model working for you.
//
// console.* anywhere else in src/ is gated out.

type Fields = Record<string, unknown>
export type Outcome = 'ok' | 'expected' | 'error'

function emit(level: 'info' | 'warn' | 'error', event: string, fields: Fields = {}): void {
  const entry = { event, level, ...flatten(fields) }
  if (level === 'error') console.error(entry)
  else if (level === 'warn') console.warn(entry)
  else console.log(entry)
}

function flatten(fields: Fields): Fields {
  const out: Fields = {}
  for (const [k, v] of Object.entries(fields)) {
    if (v instanceof Error) {
      out[k] = v.message
      out[`${k}_stack`] = v.stack
      out[`${k}_name`] = v.name
    } else out[k] = v
  }
  return out
}

export interface WideEvent {
  add(fields: Fields): void
  emit(outcome: Outcome, extra?: Fields): void
}

// One per invocation; emit() is idempotent so the finally-path can't double-log.
// Level derives from outcome: only 'error' is an error — 'expected' is
// behaviour (a 404 is a feature working), logged info for the record.
export function wide(event: string, base: Fields = {}): WideEvent {
  const fields: Fields = flatten(base)
  const t0 = Date.now()
  let emitted = false
  return {
    add(f) {
      Object.assign(fields, flatten(f))
    },
    emit(outcome, extra = {}) {
      if (emitted) return
      emitted = true
      emit(outcome === 'error' ? 'error' : 'info', event, {
        ...fields,
        ...flatten(extra),
        outcome,
        duration_ms: Date.now() - t0,
      })
    },
  }
}

export const log = {
  info: (event: string, fields?: Fields) => emit('info', event, fields),
  warn: (event: string, fields?: Fields) => emit('warn', event, fields),
  error: (event: string, fields?: Fields) => emit('error', event, fields),
}
