// The composition root (ADR-0012 seam 6): bindings, clock, and identity are
// resolved HERE, once, and passed in via router context — feature code never
// reaches for them.
import { createRequestHandler, RouterContextProvider } from 'react-router'
import { appContext } from '../src/lib/context'
import { readOwner } from '../src/lib/auth.server'

declare module 'react-router' {
  interface AppLoadContext {} // eslint-disable-line
}

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
)

export default {
  async fetch(request, env, ctx) {
    const now = new Date() // the ONLY place a clock is constructed (ADR-0005)
    const owner = await readOwner(request, env)
    const context = new RouterContextProvider()
    context.set(appContext, { env, ctx, now: () => now, owner })
    return requestHandler(request, context)
  },
} satisfies ExportedHandler<Env>
