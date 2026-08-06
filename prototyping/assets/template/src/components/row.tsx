import type { ReactNode } from 'react'

export function Row({
	title,
	done,
	children,
}: {
	title: string
	done?: boolean
	children?: ReactNode
}) {
	return (
		<div className="flex items-center gap-2 border-b py-1">
			<span className={done ? 'line-through opacity-50' : ''}>{title}</span>
			<span className="ml-auto">{children}</span>
		</div>
	)
}

export const STATES = [
	{ name: 'open', props: { title: 'Read the walking skeleton' } },
	{ name: 'done', props: { title: 'Map one feature', done: true } },
]
