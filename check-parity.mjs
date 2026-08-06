#!/usr/bin/env node
// Files that MUST stay byte-identical across the two templates — the shared
// runtime the port relies on. Run from the skills repo root; wire into CI.
import { readFileSync } from "node:fs";

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
		if (readFileSync(a, "utf8") !== readFileSync(b, "utf8")) {
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
