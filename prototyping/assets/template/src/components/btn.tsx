import type { ComponentProps } from 'react'

export function Btn(props: ComponentProps<'button'>) {
	return <button {...props} className="border px-2 text-sm" />
}

export const STATES = [
	{ name: 'default', props: { children: 'Add' } },
	{ name: 'disabled', props: { children: 'Add', disabled: true } },
]
