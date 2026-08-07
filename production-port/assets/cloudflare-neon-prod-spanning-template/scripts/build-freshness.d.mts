// Types for the one build-freshness rule. The rule itself is a .mjs script
// because check-startup.mjs (a plain node script) is its other caller; this
// file is what lets the TypeScript side — integration/harness.ts — import it
// without `any`, so the shared rule stays shared instead of being copied into
// the tier that could not type it.
export declare function buildStaleness(): string | null
export declare function assertBuildFresh(label: string, what: string): void
