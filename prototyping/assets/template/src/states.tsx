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
	Record<string, unknown>
>

type Comp = ComponentType<Record<string, unknown>>

/**
 * `task-row` and `PATH_LINE` both become `PathLine`-shaped names.
 *
 * LOWERCASE FIRST, and that is the whole of it. Without it this only uppercased
 * the letter after a separator and left the rest alone, so a SCREAMING_SNAKE
 * prefix came back SCREAMING: `PATH_LINE` → `PATHLINE`, which can never match a
 * PascalCase export. Every `<NAME>_STATES` in the repo therefore resolved to
 * nothing while the comment beside it claimed otherwise.
 */
const pascal = (s: string): string =>
	s.toLowerCase().replace(/(^|[-_])([a-zA-Z])/g, (_m, _sep, c: string) => c.toUpperCase())

/**
 * Resolve the component a states array belongs to. Files are kebab-cased while
 * components are PascalCase (`task-row.tsx` exports `TaskRow`), so the filename
 * is NOT the export name.
 *
 * TWO CANDIDATES, AND NO THIRD. There used to be a fallback to "the first
 * component-shaped export", which was neither first nor a guess worth making:
 * ESM namespace keys are SORTED, so it resolved ALPHABETICALLY. A file whose
 * component name did not match its filename handed one component's `STATES` to
 * a different component, which dereferenced a prop it was never given and threw
 * — and because every section renders inside one route, one mismatched file
 * took the whole page down. Measured: `relay-reading.tsx` exported `Reading` and
 * `PathLine`, `PathLine` sorted first, and `/__states` was dead for the entire
 * app.
 *
 * A missing section is a bad afternoon. A thrown render is everyone's.
 */
function pickComponent(name: string, mod: Record<string, unknown>): Comp | undefined {
	const named = mod[pascal(name)]
	if (typeof named === 'function') return named as Comp
	return typeof mod.default === 'function' ? (mod.default as Comp) : undefined
}

/**
 * Every states array in a file, and the component each one is FOR.
 *
 * `STATES` belongs to the file's own component. `<NAME>_STATES` belongs to
 * `<Name>` — `PATH_LINE_STATES` to `PathLine`, `SCROLL_STATES` to `Scroll`.
 *
 * The `<NAME>_STATES` convention is required of every extra component in a file,
 * and this page RENDERED NONE OF THEM. So the convention described variants that
 * nobody could look at, which is the same as not having them: `/__states` is
 * where a primitive's states are judged, and a state nobody sees is a state
 * nobody judged. A convention with no consumer is deleted or given one; this
 * gives it one.
 */
function groupsOf(file: string, mod: Record<string, unknown>) {
	return Object.entries(mod)
		.filter(([k, v]) => (k === 'STATES' || k.endsWith('_STATES')) && Array.isArray(v))
		.map(([key, states]) => {
			const name = key === 'STATES' ? file : key.slice(0, -'_STATES'.length)
			return {
				key,
				name: pascal(name),
				states: states as StateDef[],
				Comp: pickComponent(name, mod),
			}
		})
}

export function StatesPage() {
	return (
		<main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 900 }}>
			<h1>States</h1>
			{Object.entries(modules).map(([path, mod]) => {
				const file = path.replace('./components/', '').replace('.tsx', '')
				const groups = groupsOf(file, mod)
				return (
					<section key={path} style={{ borderTop: '1px dashed #999', margin: '24px 0' }}>
						<h2>{file}</h2>
						{groups.length === 0 && <p>⚠ {path} exports no STATES</p>}
						{groups.map(({ key, name, states, Comp }) => (
							<div key={key}>
								{groups.length > 1 && (
									<h3 style={{ fontSize: 14, color: '#666', margin: '16px 0 0' }}>{name}</h3>
								)}
								{/* NAMED, NOT GUESSED. The warning says which export is missing,
								    because "no export named X" is a one-line fix and a wrong
								    render is an afternoon. */}
								{!Comp && (
									<p>
										⚠ {path} has no export named {name} (needed by {key})
									</p>
								)}
								{Comp &&
									states.map((s) => (
										<figure key={s.name} style={{ margin: '12px 0' }}>
											<figcaption style={{ fontSize: 12, color: '#666' }}>{s.name}</figcaption>
											<Comp {...s.props} />
										</figure>
									))}
							</div>
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
