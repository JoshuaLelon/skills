// The shared per-route error boundary body (ADR-0008), adapted from the
// design proven in the source repo. Renders INLINE in the failed outlet slot —
// nav, store, and toasts stay mounted — offers a revalidator retry, and gates
// stack traces to DEV. Every screen route exports:
//
//   export { ScreenError as ErrorBoundary } from '../components/screen-error'
//
// RR8's own route boundary is used (not react-error-boundary) because it also
// catches loader/action rejections, which render-phase boundaries cannot.
// gate:allow missing-states — renders only inside a route's error slot; it
// needs useRouteError context, so the states page can't mount it standalone.
import { isRouteErrorResponse, useRevalidator, useRouteError } from 'react-router'

export function ScreenError() {
  const error = useRouteError()
  const { revalidate, state } = useRevalidator()

  const known = isRouteErrorResponse(error)
  const title = known ? `${error.status} — ${error.statusText || 'Error'}` : 'Something broke'
  const detail = known ? String(error.data ?? '') : 'The rest of the app is still running.'

  return (
    <section role="alert" aria-label="Screen error">
      <h2>{title}</h2>
      <p>{detail}</p>
      <button onClick={() => revalidate()} disabled={state === 'loading'}>
        {state === 'loading' ? 'Retrying…' : 'Try again'}
      </button>
      {import.meta.env.DEV && error instanceof Error && <pre>{error.stack}</pre>}
    </section>
  )
}
