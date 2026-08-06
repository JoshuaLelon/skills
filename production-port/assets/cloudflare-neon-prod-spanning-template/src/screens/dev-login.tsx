// Dev-only door: mints a session for a fixed dev user. Fails closed outside
// development (ENVIRONMENT gate) — the test-context pattern in miniature.
import { redirect } from 'react-router'
import { makeSessionCookie } from '../lib/auth.server'
import { app } from '../lib/context'
import { forbidden, guarded } from '../lib/errors'
import type { Route } from './+types/dev-login'

export const DEV_USER = '00000000-0000-4000-8000-000000000001'

export async function loader({ request, context }: Route.LoaderArgs) {
	const { env } = app(context)
	return guarded('dev/login', {}, async () => {
		if (env.ENVIRONMENT === 'production') throw forbidden('No dev login in production')
		// ?as=<uuid> lets tests mint a fresh owner per run — owner-scoped isolation
		// (ADR-0006) instead of database resets.
		const as = new URL(request.url).searchParams.get('as')
		const who = as && /^[0-9a-f-]{36}$/.test(as) ? as : DEV_USER
		return redirect('/', { headers: { 'Set-Cookie': await makeSessionCookie(env, who) } })
	})
}
