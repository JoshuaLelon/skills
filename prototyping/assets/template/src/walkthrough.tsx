// The walkthrough harness from the prototyping skill: one note at a time, one
// glowing marker, a kill switch — plus the working-memory affordances (the
// harness exists because "the notes at the bottom and the numbers everywhere
// are getting overwhelming"; everything here trades screen pixels for the
// user's working memory):
//   · flows       — notes group into narratives; the strip shows walk progress
//   · outcomes    — per-control possibility map: each input → what to expect
//   · trail       — the last few actions dispatched ("what just happened")
//   · walked      — which notes this session has stepped through ("what's left")
//   · absence     — notes for the load-bearing thing that ISN'T there
//   · when        — notes hide until the state they describe is reachable
// Wrap the app in <Walkthrough> and each referenced control in <Mark note="n1">.
// Scaffolding file: dashed borders, an accent nothing in the product may use,
// exempt from the gate's style rules, deleted wholesale by strip-harness.mjs.
import { createContext, use, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { NOTES } from './fixtures/script/notes'
import type { Note } from './fixtures/script/notes'
import { recentActions, useAppState } from './host'

// The pointer colour. If the product ever uses it, pick another — you look for
// the glow, not for a number.
const ACCENT = '#e6007a'

interface Harness {
  active: string | null
  register: (id: string) => () => void
}
const Ctx = createContext<Harness>({ active: null, register: () => () => {} })

export function Walkthrough({ children }: { children: ReactNode }) {
  const s = useAppState()
  const [i, setI] = useState(0)
  const [flow, setFlow] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  const [detail, setDetail] = useState(false) // progressive disclosure: outcomes+trail on demand
  const [walked, setWalked] = useState<Set<string>>(new Set())
  const counts = useRef(new Map<string, number>())

  // Reachable notes only (the mockup needed this: a note about grouped rows is
  // noise until a grouped row exists), then the chosen flow.
  const visible = NOTES.filter((n) => (n.when ? n.when(s) : true)).filter(
    (n) => !flow || n.flow === flow,
  )
  const flows = [...new Set(NOTES.map((n) => n.flow).filter(Boolean))] as string[]
  const note: Note | undefined = visible[Math.min(i, Math.max(0, visible.length - 1))]
  const active = hidden || !note || note.kind === 'absence' ? null : note.id

  const register = (id: string) => {
    const m = counts.current
    m.set(id, (m.get(id) ?? 0) + 1)
    return () => {
      m.set(id, (m.get(id) ?? 1) - 1)
    }
  }

  // Every 'do' note has exactly one marker — catches notes that quietly point
  // at nothing after a control moves. Absence notes have exactly zero.
  useEffect(() => {
    if (!note) return
    const n = counts.current.get(note.id) ?? 0
    const want = note.kind === 'absence' ? 0 : 1
    if (n !== want) console.error(`walkthrough: note ${note.id} has ${n} markers (want ${want})`)
    setWalked((w) => (w.has(note.id) ? w : new Set(w).add(note.id)))
  }, [note])

  const step = (d: number) => setI((x) => Math.max(0, Math.min(visible.length - 1, x + d)))
  const remaining = NOTES.length - walked.size

  if (hidden)
    return (
      <Ctx.Provider value={{ active, register }}>
        {children}
        <button style={S.show} onClick={() => setHidden(false)}>
          notes{remaining > 0 ? ` (${remaining} unwalked)` : ''}
        </button>
      </Ctx.Provider>
    )

  return (
    <Ctx.Provider value={{ active, register }}>
      {children}
      {note && (
        <div style={S.strip} role="region" aria-label="Walkthrough notes">
          <div style={S.row}>
            {flows.length > 0 && (
              <select
                style={S.flowPick}
                aria-label="Flow"
                value={flow ?? ''}
                onChange={(e) => {
                  setFlow(e.target.value || null)
                  setI(0)
                }}
              >
                <option value="">all notes</option>
                {flows.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            )}
            <button onClick={() => step(-1)} aria-label="Previous note">
              ‹
            </button>
            <span style={S.count}>
              {i + 1}/{visible.length}
            </span>
            <button onClick={() => step(1)} aria-label="Next note">
              ›
            </button>
            <span style={S.text}>
              {note.kind === 'absence' && <em style={S.absent}>absent, deliberately · </em>}
              <b>{note.text}</b> — expect: {note.expect}
            </span>
            <button onClick={() => setDetail(!detail)} aria-label="Toggle detail">
              {detail ? '−' : '+'}
            </button>
            <span style={S.remaining}>{remaining} unwalked</span>
            <button onClick={() => setHidden(true)}>hide</button>
          </div>
          {detail && (
            <div style={S.detail}>
              {note.outcomes && (
                <table style={S.map}>
                  <caption style={S.caption}>possibilities for {note.target}</caption>
                  <tbody>
                    {note.outcomes.map((o) => (
                      <tr key={o.input}>
                        <td style={S.input}>{o.input}</td>
                        <td>{o.expect}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={S.trail}>
                last actions:{' '}
                {recentActions(3)
                  .map((a) => a.type)
                  .join(' → ') || '(none yet)'}
              </div>
            </div>
          )}
        </div>
      )}
    </Ctx.Provider>
  )
}

export function Mark({ note, children }: { note: string; children: ReactNode }) {
  const { active, register } = use(Ctx)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => register(note), [note]) // eslint-disable-line react-hooks/exhaustive-deps
  const on = active === note
  // Stepping a note scrolls its marker into view — one glowing thing you
  // cannot find is worse than a list of nine.
  useEffect(() => {
    if (on) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [on])
  return (
    <span ref={ref} style={on ? S.glow : undefined}>
      {children}
    </span>
  )
}

const S: Record<string, CSSProperties> = {
  strip: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    background: '#fff',
    borderTop: `2px dashed ${ACCENT}`,
    fontSize: 13,
    zIndex: 9999,
  },
  row: { display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px' },
  count: { color: ACCENT, fontVariantNumeric: 'tabular-nums' },
  text: { flex: 1 },
  absent: { color: ACCENT },
  remaining: { color: '#999', fontSize: 11, fontVariantNumeric: 'tabular-nums' },
  flowPick: { border: `1px dashed ${ACCENT}`, fontSize: 12 },
  detail: { borderTop: '1px dashed #ccc', padding: '6px 12px', display: 'flex', gap: 24 },
  map: { fontSize: 12, borderCollapse: 'collapse' },
  caption: { textAlign: 'left', color: '#999', fontSize: 11 },
  input: { color: ACCENT, paddingRight: 12, whiteSpace: 'nowrap' },
  trail: { color: '#999', fontSize: 12, alignSelf: 'end' },
  glow: { outline: `2px solid ${ACCENT}`, outlineOffset: 2, borderRadius: 2 },
  show: {
    position: 'fixed',
    bottom: 8,
    right: 8,
    border: `1px dashed ${ACCENT}`,
    background: '#fff',
    zIndex: 9999,
  },
}
