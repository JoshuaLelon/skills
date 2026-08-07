// The one frozen instant. Every fixture timestamp derives from it, and flow
// tests install it as the browser clock (e2e/helpers.ts). One frozen instant
// everywhere, or determinism dies in the seams. Change the date, not the pattern.
//
// The `Z` is load-bearing, not decoration. Bare `new Date('2026-08-04T09:00:00')`
// parses in the MACHINE's timezone, so "the one frozen instant" was 16 hours
// apart between Tokyo and Los Angeles — and in NZ it landed on 2026-08-03, a
// MONDAY, while the suite is anchored to a Tuesday on purpose (routine fixtures
// written for a Tuesday flake on any other day). Measured, not theorised. Always
// fully-qualified UTC: the locale is a hidden input exactly like `Date.now()`.
export const NOW = new Date('2026-08-04T09:00:00Z')
