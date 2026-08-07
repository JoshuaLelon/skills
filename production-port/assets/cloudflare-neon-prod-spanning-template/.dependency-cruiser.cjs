// Module-boundary rules for the production-port layout. Every rule here has a
// matching mutation in scripts/verify-gates.mjs — a rule without a proof it
// fires is a rule that may be enforcing nothing (two of the original pantogen
// rules were dead on arrival and looked green). If you add a rule, add its
// mutation in the same commit.
module.exports = {
	forbidden: [
		{
			// The reducer stays pure and framework-free — it must port unedited
			// and unit-test without a DOM. (The prototype gate's store-imports-view
			// rule, graduated to real import-graph analysis.)
			comment:
				"The store imports no view, framework, or db — that purity is what lets the reducer be replayed and ported unedited (ADR-0007).",
			name: "store-is-pure",
			severity: "error",
			from: { path: "^src/store" },
			to: {
				path: "^src/(screens|components|host)|^node_modules/(react|react-dom)",
			},
		},
		{
			// No server-only dependencies in COMPONENTS. Screens are RR8 route
			// modules — their loaders legitimately import the db (the framework
			// strips server code from the client bundle); pure view components
			// never do.
			comment:
				"Screens and components import no server-only dependency; the loader is the seam (ADR-0012 seam 1).",
			name: "no-db-in-view",
			severity: "error",
			from: { path: "^src/components" },
			to: { path: "^src/db|^node_modules/(pg|drizzle-orm|postgres)" },
		},
		{
			// The seam: views read through accessors, never the fixture directly.
			// The accessor becomes the loader; this rule is what keeps that swap a
			// one-file change. (Prototype gate's seam-leak, graduated.)
			comment:
				"Views read data from loaders, never from fixtures — a fixture import is a screen that will render in dev and 500 in production.",
			name: "no-fixture-in-view",
			severity: "error",
			from: { path: "^src/(screens|components)" },
			to: { path: "^src/fixtures/entities" },
		},
		{
			comment:
				"Test helpers must not reach production code; anything imported here ships in the bundle.",
			name: "no-test-in-prod",
			severity: "error",
			from: { path: "^src", pathNot: "\\.test\\.(ts|tsx)$" },
			to: { path: "^(tests|e2e)/|\\.test\\.(ts|tsx)$" },
		},
		{
			comment:
				"A cycle means these modules are one module with extra steps — and it breaks the load order non-deterministically.",
			name: "no-circular",
			severity: "error",
			from: {},
			to: { circular: true },
		},
		{
			// bcrypt is legacy-only (OWASP): Argon2id or nothing. And bcrypt
			// silently truncates passwords past 72 bytes.
			comment:
				"Argon2id or nothing: bcrypt silently truncates at 72 bytes, so a long passphrase is weaker than a short one (ADR-0004).",
			name: "no-bcrypt",
			severity: "error",
			from: {},
			to: { path: "^node_modules/(bcrypt|bcryptjs)/" },
		},
		{
			// Loaders + TypeScript already cover server state and wire types here.
			// Warn, not error: adopting one of these is a legitimate §2 divergence —
			// but it must be written down, not drifted into.
			name: "server-state-lib",
			severity: "warn",
			from: { path: "^src" },
			to: { path: "^node_modules/(@tanstack/react-query|redux|@reduxjs|@trpc)/" },
		},
		{
			// Warn, not error: orphans are normal mid-build; the report is the value.
			name: "no-orphans",
			severity: "warn",
			from: {
				orphan: true,
				pathNot: "\\.d\\.ts$|(^|/)\\.|config|^src/(main|root|routes|entry\\.client|states)\\.tsx?$|^scripts/",
			},
			to: {},
		},
	],
	options: {
		// doNotFollow (don't traverse INTO) — never exclude — node_modules:
		// excluded modules vanish from the graph entirely, and a rule whose `to`
		// targets a vanished module is a dead gate that stays green. verify-gates
		// caught exactly this on first run.
		doNotFollow: { path: "node_modules" },
		exclude: { path: "^(dist|build)/" },
		tsPreCompilationDeps: true,
		// Vite splits tsconfigs; plain repos don't — resolve whichever exists,
		// because a tsConfig pointing at a missing file kills the whole cruise
		// and every rule with it (verify-gates caught this as three dead gates).
		tsConfig: {
			fileName: require("node:fs").existsSync("tsconfig.app.json") ? "tsconfig.app.json" : "tsconfig.json",
		},
	},
};
