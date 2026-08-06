import { index, type RouteConfig, route } from '@react-router/dev/routes'

export default [
	index('screens/notes.tsx'),
	route('notes/:ref', 'screens/note-detail.tsx'),
	route('login/dev', 'screens/dev-login.tsx'),
	route('health', 'screens/health.ts'),
	route('webhook/capture', 'screens/webhook-capture.ts'),
	route('dev/throw', 'screens/dev-throw.tsx'),
	route('__states', 'states.tsx'),
] satisfies RouteConfig
