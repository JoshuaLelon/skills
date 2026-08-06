import type { ComponentProps } from 'react'

export function TextInput(props: ComponentProps<'input'>) {
	return <input {...props} className="grow border p-1" />
}

export const STATES = [{ name: 'default', props: { 'aria-label': 'New note title' } }]
