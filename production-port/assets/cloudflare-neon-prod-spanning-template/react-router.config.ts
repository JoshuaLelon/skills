import type { Config } from '@react-router/dev/config'

export default {
	ssr: true,
	appDirectory: 'src', // ADR-0003 + the port recipe: gates' globs live on src/
} satisfies Config
