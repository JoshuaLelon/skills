import { useEffect } from 'react'
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router'
import { NOW } from './fixtures/now'
import { dispatch } from './host'
import { Walkthrough } from './walkthrough'
import './index.css'

// THE CLOCK — the impure half of `now`, and the only place in the app that
// reads the wall clock. The reducer receives the answer as data (`clock/set`).
//
// THE ORIGIN IS CAPTURED AT MODULE LOAD, not at the first tick. A function that
// reads the clock later reads whatever it says THEN — so a flow test that moved
// time before the app finished mounting shifted the origin by exactly as much
// as it had moved, and the app serenely reported the same minute again. Pinned
// to page load it is NOW in any test (the helper installs the clock before the
// page loads) and it advances normally in a browser. At the port the timer
// stays and the NOW offset goes: production's `now` is just `Date.now()`.
const ORIGIN = Date.now()

// Ticks on a real interval and dispatches ONLY when the displayed minute
// changes: a dispatch per second grows the action log without saying anything
// new, and the dev replay check re-reduces that whole log after every dispatch.
// Coarsen the rounding to whatever granularity the UI actually shows.
//
// WHY A TIMER AT ALL, when the harness can offer a "jump to evening" button:
// because the button is harness and the harness is deleted at the strip. A
// locked flow has to be able to move time without touching scaffolding, and
// this is what lets it — `page.clock.fastForward` drives this interval, through
// the action production dispatches.
function startClock(): () => void {
  let last = ''
  const tick = () => {
    const ms = NOW.getTime() + (Date.now() - ORIGIN)
    const iso = new Date(ms - (ms % 60_000)).toISOString()
    if (iso === last) return
    last = iso
    dispatch({ type: 'clock/set', now: iso })
  }
  tick()
  const id = setInterval(tick, 1_000)
  return () => clearInterval(id)
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  useEffect(startClock, [])
  return (
    <Walkthrough>
      <Outlet />
    </Walkthrough>
  )
}

export { ScreenError as ErrorBoundary } from './components/screen-error'
