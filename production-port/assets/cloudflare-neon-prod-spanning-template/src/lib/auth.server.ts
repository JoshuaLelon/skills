// Sessions in HTTP-only cookies (ADR-0004). Minimal HMAC-signed cookie: the
// exemplar needs a real session boundary, not a real user system. requireOwner
// is the one door for "who is acting" — hiding UI is not authorization.
import { AppError } from './errors'

export const SESSION_COOKIE = 'session'

async function hmac(secret: string, value: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	)
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
	return btoa(String.fromCharCode(...new Uint8Array(sig))).replaceAll('=', '')
}

export async function makeSessionCookie(env: Env, ownerId: string): Promise<string> {
	const sig = await hmac(env.SESSION_SECRET, ownerId)
	return `${SESSION_COOKIE}=${ownerId}.${sig}; HttpOnly; Path=/; SameSite=Lax`
}

export async function readOwner(request: Request, env: Env): Promise<{ id: string } | null> {
	const raw = request.headers.get('Cookie')?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1]
	if (!raw) return null
	const [id, sig] = raw.split('.')
	if (!id || !sig) return null
	// A bad cookie resolves to NOBODY (the door), never to an error page.
	return (await hmac(env.SESSION_SECRET, id)) === sig ? { id } : null
}

export function requireOwner(owner: { id: string } | null): { id: string } {
	if (!owner) throw new AppError(403, 'Sign in first — try /login/dev in development')
	return owner
}
