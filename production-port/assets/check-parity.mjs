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
	["prototyping/assets/gate.mjs", "production-port/assets/cloudflare-neon-prod-spanning-template/scripts/gate.mjs"],
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
if (bad) process.exit(1);
console.log(`parity: OK (${PAIRS.length} shared files identical)`);
