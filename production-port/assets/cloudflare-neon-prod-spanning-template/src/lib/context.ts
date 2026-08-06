import { createContext } from 'react-router'

export interface AppContext {
	env: Env
	ctx: ExecutionContext
	now: () => Date
	owner: { id: string } | null
}

export const appContext = createContext<AppContext>()

export function app(context: { get: (c: typeof appContext) => AppContext }): AppContext {
	return context.get(appContext)
}
