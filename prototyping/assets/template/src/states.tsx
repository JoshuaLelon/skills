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

// Resolve the component a file exports. Files are kebab-cased while components
// are PascalCase (`task-row.tsx` exports `TaskRow`), so the filename is NOT the
// export name — looking one up by the other matched nothing, and this page
// rendered a list of "has no export named …" warnings instead of a single
// component, in every project including this template. Try the PascalCased
// filename first (deterministic when a file exports several), then the default
// export, then the first component-shaped export.
function pickComponent(
	fileName: string,
	mod: Record<string, unknown>,
): ComponentType<Record<string, unknown>> | undefined {
	const pascal = fileName.replace(/(^|-)([a-z])/g, (_m, _dash, c: string) => c.toUpperCase())
	const candidates = [
		mod[pascal],
		mod.default,
		...Object.entries(mod)
			.filter(([k, v]) => k !== 'STATES' && typeof v === 'function' && /^[A-Z]/.test(k))
			.map(([, v]) => v),
	]
	return candidates.find((c) => typeof c === 'function') as
		| ComponentType<Record<string, unknown>>
		| undefined
}

export function StatesPage() {
	return (
		<main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 900 }}>
			<h1>States</h1>
			{Object.entries(modules).map(([path, mod]) => {
				const name = path.replace('./components/', '').replace('.tsx', '')
				const Comp = pickComponent(name, mod)
				const states = mod.STATES ?? []
				return (
					<section key={path} style={{ borderTop: '1px dashed #999', margin: '24px 0' }}>
						<h2>{name}</h2>
						{!Comp && (
							<p>
								⚠ {path} has no export named {name}
							</p>
						)}
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
