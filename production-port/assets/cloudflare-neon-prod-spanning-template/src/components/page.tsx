import type { ReactNode } from 'react'

export function Page({ title, children }: { title: string; children: ReactNode }) {
	return (
		<main className="mx-auto max-w-xl p-8">
			<h1 className="text-xl font-semibold">{title}</h1>
			{children}
		</main>
	)
}

export const STATES = [{ name: 'default', props: { title: 'Notes', children: 'content' } }]
