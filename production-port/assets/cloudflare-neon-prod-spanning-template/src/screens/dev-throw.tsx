// Demonstrates the UNEXPECTED error path: throws a plain Error, guarded()
// records it INTO the wide event (outcome:'error', stack included), the
// boundary renders generic. Dev-only.

import { app } from '../lib/context'
import { forbidden, guarded } from '../lib/errors'
import type { Route } from './+types/dev-throw'

export async function loader({ context }: Route.LoaderArgs) {
	const { env } = app(context)
	if (env.ENVIRONMENT === 'production') throw forbidden('Not in production')
	return guarded('dev/throw', { demo: true }, async (add) => {
		add({ enriched: 'this field arrives in the error event' })
		throw new Error('deliberate unexpected failure — check the wide event')
	})
}

export default function DevThrow() {
	return null
}

export { ScreenError as ErrorBoundary } from '../components/screen-error'
