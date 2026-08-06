// The screen pattern, from the first screen: a clientLoader reading through
// accessors (NEVER the fixture directly — the gate enforces it), the component
// composing primitives. At port time this file moves; clientLoader becomes
// loader inside guarded(), accessors become the query module — same
// signatures, nothing else changes.
import { useLoaderData } from 'react-router'
import { Page } from '../components/page'

export function clientLoader() {
  return { ready: true }
}

export default function Home() {
  const data = useLoaderData<typeof clientLoader>()
  return <Page title="Slice 01">{data.ready ? 'scaffold alive' : null}</Page>
}

export { ScreenError as ErrorBoundary } from '../components/screen-error'
