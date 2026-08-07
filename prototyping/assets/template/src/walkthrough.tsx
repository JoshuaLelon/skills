// The walkthrough harness from the prototyping skill: one note at a time, ONE
// marker, a kill switch — plus the working-memory affordances (the harness
// exists because a real walkthrough reported "the notes at the bottom and the
// numbers everywhere are getting overwhelming"; everything here trades screen
// pixels for what the walker would otherwise have to hold in their head):
//   · flows       — notes group into narratives; the header picks one
//   · outcomes    — per-control possibility map, ONE at a time behind ‹ 1/3 ›
//   · absence     — the load-bearing thing that ISN'T there, marked HOLLOW on
//                   the spot where it would be (every note has exactly one
//                   marker; an absence has a location even when it has no thing)
//   · when        — notes hide until the state they describe is reachable
// Wrap the app in <Walkthrough> and each referenced control in <Mark note="n1">.
//
// A DRAWER docked beside the content column and vertically centred, not a strip
// along the bottom: <Mark> scrolls the active marker to block:'center', so the
// note and the control it names land on the same line. Fixed height, because a
// centred panel that resizes per note slides its own controls out from under
// the cursor. The accent is the POINTER and its budget is two uses — the marker
// and the counts; scaffolding is signalled by the dashed edge instead.
//
// Scaffolding file: exempt from the gate's style rules, deleted wholesale by
// strip-harness.mjs.
import { createContext, use, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { NOTES } from './fixtures/script/notes'
import type { Note } from './fixtures/script/notes'
import { useAppState } from './host'

// The pointer colour. If the product ever uses it, pick another — you look for
// the glow, not for a number.
const ACCENT = '#e6007a'

interface Harness {
  active: string | null
  /** An absence marker points at WHERE the missing thing would be. */
  absent: boolean
  register: (id: string) => () => void
}
const Ctx = createContext<Harness>({ active: null, absent: false, register: () => () => {} })

export function Walkthrough({ children }: { children: ReactNode }) {
  const s = useAppState()
  const [i, setI] = useState(0)
  const [flow, setFlow] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  const [open, setOpen] = useState(true) // drawer slid out or tucked away
  const [detail, setDetail] = useState(false) // progressive disclosure: outcomes+trail on demand
  const [outcome, setOutcome] = useState(0) // one possibility at a time
  const counts = useRef(new Map<string, number>())

  // Reachable notes only (the mockup needed this: a note about grouped rows is
  // noise until a grouped row exists), then the chosen flow.
  const visible = NOTES.filter((n) => (n.when ? n.when(s) : true)).filter(
    (n) => !flow || n.flow === flow,
  )
  const flows = [...new Set(NOTES.map((n) => n.flow).filter(Boolean))] as string[]
  const note: Note | undefined = visible[Math.min(i, Math.max(0, visible.length - 1))]
  const active = hidden || !note ? null : note.id
  const absent = note?.kind === 'absence'

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
    // EVERY note has exactly one marker, absence notes included. They used to
    // be asserted at zero — "you cannot glow a thing that is not there" — which
    // left the reader hunting for a control the note never pointed at. An
    // absence has a LOCATION: the debt count that isn't in the day header, the
    // 0/8 that isn't on the group header. Mark the place, style it hollow.
    const n = counts.current.get(note.id) ?? 0
    if (n !== 1) console.error(`walkthrough: note ${note.id} has ${n} markers (want 1)`)
  }, [note])

  // A new note means a new possibility set — start it at the first.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setOutcome(0), [note?.id])

  const step = (d: number) => setI((x) => Math.max(0, Math.min(visible.length - 1, x + d)))

  if (hidden)
    return (
      <Ctx.Provider value={{ active, absent, register }}>
        {children}
        <button style={S.show} onClick={() => setHidden(false)}>
          notes
        </button>
      </Ctx.Provider>
    )

  return (
    <Ctx.Provider value={{ active, absent, register }}>
      {children}
      {note && (
        <div style={S.dock} role="region" aria-label="Walkthrough notes">
          {/* Hover/active/focus states need a stylesheet — inline styles cannot
              express them, and a control without a hover state feels dead.
              Harness-only; strip-harness.mjs deletes this file wholesale. */}
          <style>{CSS}</style>

          <button
            data-wt-tab
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Close notes drawer' : 'Open notes drawer'}
            aria-expanded={open}
          >
            {open ? '›' : '‹'}
          </button>

          <div style={{ ...S.panel, width: open ? 294 : 0, borderWidth: open ? 1 : 0 }}>
            <div style={S.inner}>
              <div style={S.head}>
                <button data-wt-nav onClick={() => step(-1)} aria-label="Previous note">
                  ‹
                </button>
                <span style={S.count}>
                  {i + 1}/{visible.length}
                </span>
                <button data-wt-nav onClick={() => step(1)} aria-label="Next note">
                  ›
                </button>
                <span style={S.spacer} />
                {flows.length > 0 && (
                  <select
                    data-wt-select
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
                <button data-wt-quiet onClick={() => setHidden(true)}>
                  hide
                </button>
              </div>

              <div style={S.scroll}>
                {note.kind === 'absence' && (
                  <div style={S.absent}>the marker shows where this would be — it isn’t</div>
                )}
                <div style={S.title}>{note.text}</div>
                <div style={S.expect}>{note.expect}</div>

              </div>

              {note.outcomes &&
                (() => {
                  // The disclosure lives ON the thing it discloses. It used to
                  // sit in a footer at the far corner of the panel, which asked
                  // you to connect a control to content it was nowhere near.
                  //
                  // The block is pinned to the bottom and BOTH its states are a
                  // fixed height, so the toggle holds its position across notes
                  // whether open or shut — the drift only ever moves when you
                  // are the one who moved it.
                  const n = note.outcomes.length
                  const at = Math.min(outcome, n - 1)
                  const o = note.outcomes[at]
                  return (
                    <div style={S.poss}>
                      <div style={S.possHead}>
                        <span style={S.label}>possibilities for {note.target}</span>
                        <span style={S.spacer} />
                        {detail && (
                          <>
                            <button
                              data-wt-nav
                              onClick={() => setOutcome((x) => Math.max(0, x - 1))}
                              aria-label="Previous possibility"
                            >
                              ‹
                            </button>
                            <span style={S.count}>
                              {at + 1}/{n}
                            </span>
                            <button
                              data-wt-nav
                              onClick={() => setOutcome((x) => Math.min(n - 1, x + 1))}
                              aria-label="Next possibility"
                            >
                              ›
                            </button>
                          </>
                        )}
                        <button
                          data-wt-nav
                          onClick={() => setDetail(!detail)}
                          aria-label={detail ? 'Hide possibilities' : 'Show possibilities'}
                        >
                          {detail ? '−' : '+'}
                        </button>
                      </div>
                      <div style={{ ...S.possBody, height: detail ? 76 : 0 }}>
                        <div style={S.possInput}>{o.input}</div>
                        <div style={S.expect}>{o.expect}</div>
                      </div>
                    </div>
                  )
                })()}
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}

export function Mark({ note, children }: { note: string; children: ReactNode }) {
  const { active, absent, register } = use(Ctx)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => register(note), [note]) // eslint-disable-line react-hooks/exhaustive-deps
  const on = active === note
  // Stepping a note scrolls its marker into view — one glowing thing you
  // cannot find is worse than a list of nine.
  useEffect(() => {
    if (on) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [on])
  return (
    <span ref={ref} style={on ? (absent ? S.glowAbsent : S.glow) : undefined}>
      {children}
    </span>
  )
}

// Neutrals are hue-tinted toward the product's violet rather than pure grey —
// pure #808080 reads as placeholder. Alpha hairlines recede; solid hex sits on
// top of the surface.
const INK = '#191520'
const MUTED = '#645d70'
const FAINT = '#9b95a6'
const HAIRLINE = 'rgba(0,0,0,0.09)'

// THE ACCENT BUDGET: two uses, total — the marker glow on the product, and the
// position counts here. Nothing else. The harness had spent it on the border,
// the tab, the select, four arrow boxes and the possibility text, which is why
// the panel read as louder than the app it was describing: if everything is the
// pointer, nothing is. Scaffolding is signalled by the DASHED edge (a separate
// signal, deliberately neutral), never by the accent.
const CSS = `
  [data-wt-nav] {
    min-width: 32px; height: 30px;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 15px; line-height: 1;
    border: 0; border-radius: 4px; background: transparent;
    color: ${MUTED}; cursor: pointer;
    transition: background-color 150ms ease, color 150ms ease;
  }
  [data-wt-nav]:hover { background: rgba(0,0,0,0.055); color: ${INK}; }
  [data-wt-nav]:active { background: rgba(0,0,0,0.09); }
  [data-wt-nav]:focus-visible,
  [data-wt-quiet]:focus-visible,
  [data-wt-select]:focus-visible,
  [data-wt-tab]:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }

  [data-wt-quiet] {
    border: 0; background: transparent; padding: 4px 2px;
    font-size: 11px; color: ${FAINT}; cursor: pointer;
    transition: color 150ms ease;
  }
  [data-wt-quiet]:hover { color: ${INK}; }

  [data-wt-select] {
    border: 0; background: transparent; font-size: 11px; color: ${FAINT};
    cursor: pointer; max-width: 92px;
  }
  [data-wt-select]:hover { color: ${INK}; }

  [data-wt-tab] {
    flex: 0 0 auto; width: 24px; height: 56px; align-self: center;
    border: 1px dashed ${HAIRLINE}; border-right: 0; border-radius: 4px 0 0 4px;
    background: #fff; color: ${FAINT}; cursor: pointer;
    transition: color 150ms ease;
  }
  [data-wt-tab]:hover { color: ${INK}; }
`

const S: Record<string, CSSProperties> = {
  // Docked beside the CONTENT COLUMN and vertically centred, not a full-width
  // strip along the bottom. The strip cost a saccade the height of the window
  // between the instruction and the control it named — the rulebook problem in
  // a different axis. <Mark> scrolls the active marker to `block: 'center'`, so
  // note and marker land on the same line and the eye travels sideways.
  dock: {
    position: 'fixed',
    top: '50%',
    left: 'min(calc(50% + 352px), calc(100vw - 340px))',
    transform: 'translateY(-50%)',
    display: 'flex',
    alignItems: 'stretch',
    zIndex: 9999,
  },
  panel: {
    background: '#fff',
    // Dashed = scaffolding. One dashed edge, not three nested ones.
    border: `1px dashed ${HAIRLINE}`,
    borderRadius: '0 6px 6px 0',
    boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 8px 20px rgba(0,0,0,.06), 0 24px 48px rgba(0,0,0,.05)',
    // FIXED height. The drawer is vertically centred, so a height that changes
    // per note moves BOTH edges and slides the ‹ › out from under the cursor
    // that just clicked them.
    height: 420,
    overflow: 'hidden',
    transition: 'width 200ms ease',
  },
  inner: {
    width: 294,
    height: '100%',
    boxSizing: 'border-box',
    padding: '10px 12px',
    fontSize: 13,
    color: INK,
    display: 'flex',
    flexDirection: 'column',
  },
  head: { display: 'flex', gap: 2, alignItems: 'center', marginBottom: 10 },
  spacer: { flex: 1 },
  count: { color: ACCENT, fontSize: 12, fontVariantNumeric: 'tabular-nums', padding: '0 2px' },
  scroll: { flex: 1, overflowY: 'auto', minHeight: 0 },
  title: { fontSize: 14, fontWeight: 600, lineHeight: 1.35, letterSpacing: '-0.01em' },
  expect: { marginTop: 6, fontSize: 13, lineHeight: 1.5, color: MUTED },
  absent: { fontSize: 11, color: MUTED, marginBottom: 6 },
  // A recessed block instead of rules above and below it: a tint groups without
  // adding two more lines to a panel that already had too many.
  poss: {
    flex: '0 0 auto',
    marginTop: 10,
    padding: '4px 8px 8px',
    borderRadius: 6,
    background: 'rgba(0,0,0,0.035)',
  },
  possHead: { display: 'flex', alignItems: 'center', gap: 2 },
  // Fixed height in the open state too, so stepping notes never resizes it.
  possBody: { overflowY: 'auto', transition: 'height 180ms ease' },
  possInput: { fontSize: 13, fontWeight: 600, lineHeight: 1.4 },
  label: { fontSize: 11, color: FAINT },
  glow: { outline: `2px solid ${ACCENT}`, outlineOffset: 2, borderRadius: 2 },
  // Hollow, so "here is the thing" and "here is where the thing would be" are
  // never confused for one another.
  glowAbsent: { outline: `2px dashed ${ACCENT}`, outlineOffset: 3, borderRadius: 2, opacity: 0.75 },
  show: {
    position: 'fixed',
    top: '50%',
    right: 8,
    transform: 'translateY(-50%)',
    border: `1px dashed ${HAIRLINE}`,
    background: '#fff',
    fontSize: 11,
    color: MUTED,
    padding: '6px 8px',
    borderRadius: 6,
    zIndex: 9999,
  },
}
