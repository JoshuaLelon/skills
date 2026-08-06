// The one frozen instant. Every fixture timestamp derives from it, and flow
// tests install it as the browser clock (e2e/helpers.ts). One frozen instant
// everywhere, or determinism dies in the seams. Change the date, not the pattern.
export const NOW = new Date('2026-08-04T09:00:00')
