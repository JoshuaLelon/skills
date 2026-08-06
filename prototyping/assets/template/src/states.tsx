// /__states — every primitive in every variant, auto-collected via
// import.meta.glob. Never hand-edit a registry: a primitive missing here is a
// primitive without STATES, and the gate flags it at the file. Harness file —
// exempt from the gate's style rules.
import type { ComponentType } from 'react'

interface StateDef {
  name: string
  props: Record<string, unknown>
}

const modules = import.meta.glob('./components/*.tsx', { eager: true }) as Record<
  string,
  Record<string, unknown> & { STATES?: StateDef[] }
>

export function StatesPage() {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 900 }}>
      <h1>States</h1>
      {Object.entries(modules).map(([path, mod]) => {
        const name = path.replace('./components/', '').replace('.tsx', '')
        const Comp = mod[name] as ComponentType<Record<string, unknown>> | undefined
        const states = mod.STATES ?? []
        return (
          <section key={path} style={{ borderTop: '1px dashed #999', margin: '24px 0' }}>
            <h2>{name}</h2>
            {!Comp && <p>⚠ {path} has no export named {name}</p>}
            {Comp &&
              states.map((s) => (
                <figure key={s.name} style={{ margin: '12px 0' }}>
                  <figcaption style={{ fontSize: 12, color: '#666' }}>{s.name}</figcaption>
                  <Comp {...s.props} />
                </figure>
              ))}
          </section>
        )
      })}
      {/* Screens in edge states go below, as manual sections: empty, one item,
          overflowing, error — with the absence cases ("no Delete here",
          "nothing pre-selected") rendered beside the state that has them. */}
    </main>
  )
}

// Default export so RR8 can route this file directly (routes.ts: '/__states').
export default StatesPage
