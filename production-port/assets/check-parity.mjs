#!/usr/bin/env node
// Files that MUST stay byte-identical across the two templates — the shared
// runtime the port relies on (ADR-0013). Self-locating: run it from anywhere
// (`node <production-port skill dir>/assets/check-parity.mjs`); it resolves
// the skills repo from its own path. Run after editing ANY shared file, in
// either skill — fixes flow to both copies in the same commit.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const PAIRS = [
	["prototyping/assets/template/src/host.tsx", "production-port/assets/cloudflare-neon-prod-spanning-template/src/host.tsx"],
	["prototyping/assets/template/src/states.tsx", "production-port/assets/cloudflare-neon-prod-spanning-template/src/states.tsx"],
	["prototyping/assets/template/src/components/screen-error.tsx", "production-port/assets/cloudflare-neon-prod-spanning-template/src/components/screen-error.tsx"],
	["prototyping/assets/template/src/components/page.tsx", "production-port/assets/cloudflare-neon-prod-spanning-template/src/components/page.tsx"],
	["prototyping/assets/template/src/components/btn.tsx", "production-port/assets/cloudflare-neon-prod-spanning-template/src/components/btn.tsx"],
	["prototyping/assets/template/src/components/text-input.tsx", "production-port/assets/cloudflare-neon-prod-spanning-template/src/components/text-input.tsx"],
	["prototyping/assets/template/src/components/row.tsx", "production-port/assets/cloudflare-neon-prod-spanning-template/src/components/row.tsx"],
	["prototyping/assets/template/src/fixtures/now.ts", "production-port/assets/cloudflare-neon-prod-spanning-template/src/fixtures/now.ts"],
	// clock.ts joined this list when the seeder learned to rebase: entity files
	// keep holding NOW-anchored instants after the port, so the vocabulary that
	// mints them has to cross too. It was prototype-only for exactly as long as
	// the production fixture spoke a different dialect (hand-written offsets),
	// which is what made every port hand-write the conversion.
	["prototyping/assets/template/src/fixtures/clock.ts", "production-port/assets/cloudflare-neon-prod-spanning-template/src/fixtures/clock.ts"],
	["prototyping/assets/gate.mjs", "production-port/assets/cloudflare-neon-prod-spanning-template/scripts/gate.mjs"],
];

// Some files must not be IDENTICAL — they must share a PROPERTY. Both skills'
// playwright configs need `reuseExistingServer: false` and a port that is not
// Vite's 5173 default, but they must use DIFFERENT ports so a prototype and the
// app it is being ported into can run at once. Byte-parity cannot express that,
// which is why this trap was fixed on the production side and shipped broken on
// the prototype side for as long as it did — it was in nobody's list.
const PROPERTIES = [
	{
		files: [
			"prototyping/assets/template/playwright.config.ts",
			"production-port/assets/cloudflare-neon-prod-spanning-template/playwright.config.ts",
		],
		test: (src) => /reuseExistingServer:\s*false/.test(src),
		why: "reuseExistingServer must be literal false — otherwise e2e adopts whatever already listens on the port and grades a different app",
	},
	{
		files: [
			"prototyping/assets/template/playwright.config.ts",
			"production-port/assets/cloudflare-neon-prod-spanning-template/playwright.config.ts",
		],
		test: (src) => !/localhost:5173|port:\s*5173/.test(src),
		why: "5173 is Vite's default and therefore the port every other project on the machine is also using; pick your own",
	},
	// The e2e helpers are the second file pair that must DIFFER in a stated way,
	// and for the same underlying reason as the ports: the clock follows the DATA.
	// The prototype's fixture holds absolute instants anchored on NOW, so its
	// browser clock must BE NOW. Production's seeder rebases those instants onto a
	// live `now`, so its browser clock must be REAL — pinning it there put every
	// seeded row in the browser's future, on every test, for as long as both files
	// looked equally correct in isolation. Byte-parity cannot express "differ, in
	// this direction, for this reason". These two can.
	{
		files: ["prototyping/assets/template/e2e/helpers.ts"],
		test: (src) => /page\.clock\.install\(\s*\{\s*time:\s*NOW/.test(src),
		why: "the prototype's data is absolute and anchored on NOW, so its browser clock must be pinned to NOW or the fixture renders against a clock its data disagrees with",
	},
	{
		files: ["production-port/assets/cloudflare-neon-prod-spanning-template/e2e/helpers.ts"],
		test: (src) => !/^(?!\s*\/\/).*page\.clock\.install/m.test(src),
		why: "production seeds rebased onto a live clock, so the default helper must leave the browser clock REAL (the ladder's preferred rung); pin per-test instead, and seed at NOW so the server agrees",
	},
];

let bad = 0;
for (const [a, b] of PAIRS) {
	try {
		if (readFileSync(join(REPO, a), "utf8") !== readFileSync(join(REPO, b), "utf8")) {
			console.error(`parity: DIVERGED — ${a} != ${b}`);
			bad++;
		}
	} catch (e) {
		console.error(`parity: MISSING — ${e.path}`);
		bad++;
	}
}
for (const { files, test, why } of PROPERTIES) {
	for (const f of files) {
		let src = "";
		try {
			src = readFileSync(join(REPO, f), "utf8");
		} catch {
			console.error(`parity: MISSING — ${f}`);
			bad++;
			continue;
		}
		if (!test(src)) {
			console.error(`parity: PROPERTY — ${f}: ${why}`);
			bad++;
		}
	}
}

if (bad) process.exit(1);
console.log(
	`parity: OK (${PAIRS.length} shared files identical, ${PROPERTIES.length} shared properties hold)`,
);
