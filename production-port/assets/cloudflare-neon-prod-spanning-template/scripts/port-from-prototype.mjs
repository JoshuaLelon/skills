#!/usr/bin/env node
// The programmatic half of the port (ADR-0013). Run INSIDE a fresh copy of the
// spanning template:
//
//   node scripts/port-from-prototype.mjs --from ../my-prototype
//
// It verifies the prototype's exit state (the `prototype` tag exists, the
// harness is stripped), then carries the portable set:
//
//   docs/{reference,design,plans}  → docs/            (level docs continue)
//   src/fixtures/**                → src/fixtures/    (minus script/, stripped)
//   src/{store,components,screens} → src/_port/…      (STAGING — map from here)
//   e2e/flows/**                   → e2e/_port/…      (re-point as routes land)
//
// Direct-copy vs staging is deliberate: docs and fixtures are stack-agnostic
// and land in place; store/screens/components collide with the exemplar and
// must be MAPPED onto its patterns one feature at a time. The port is done
// when `_port/` is empty and the note exemplar is deleted — `port:status`
// reports the remainder, and both staging dirs are excluded from tsc/gates.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const STATUS = args.includes("--status");
const ROOT = process.cwd();

function* walk(dir) {
	if (!existsSync(dir)) return;
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) yield* walk(p);
		else yield p;
	}
}

if (STATUS) {
	const remaining = [...walk(join(ROOT, "src/_port")), ...walk(join(ROOT, "e2e/_port"))];
	const exemplar = [
		"src/screens/notes.tsx",
		"src/screens/note-detail.tsx",
		"src/fixtures/entities/notes.ts",
		"e2e/flows/notes.spec.ts",
	].filter((p) => existsSync(join(ROOT, p)));
	if (!remaining.length && !exemplar.length) {
		console.log("port:status — DONE: staging empty, exemplar deleted.");
		process.exit(0);
	}
	if (remaining.length) {
		console.log(`port:status — ${remaining.length} file(s) still in staging:`);
		for (const f of remaining) console.log(`  ${f.replace(`${ROOT}/`, "")}`);
	}
	if (exemplar.length) {
		console.log(`port:status — exemplar still present (delete once its pattern has a real follower):`);
		for (const f of exemplar) console.log(`  ${f}`);
	}
	process.exit(1);
}

const fromIdx = args.indexOf("--from");
if (fromIdx === -1 || !args[fromIdx + 1]) {
	console.error("usage: node scripts/port-from-prototype.mjs --from <prototype-repo>   (or --status)");
	process.exit(1);
}
const SRC = resolve(args[fromIdx + 1].replace(/^~/, process.env.HOME ?? "~"));

// -- verify the prototype's exit state ---------------------------------------
try {
	execSync("git rev-parse -q --verify refs/tags/prototype", { cwd: SRC, stdio: "pipe" });
} catch {
	console.error(`port: ${SRC} has no 'prototype' tag — run the prototyping skill's Phase 7 first (tag, then strip).`);
	process.exit(1);
}
if (existsSync(join(SRC, "src/walkthrough.tsx"))) {
	console.error(`port: ${SRC} still has the walkthrough harness — run strip-harness.mjs there first.`);
	process.exit(1);
}

// -- carry -------------------------------------------------------------------
const carried = [];
const carry = (from, to) => {
	if (!existsSync(join(SRC, from))) return;
	mkdirSync(join(ROOT, to, ".."), { recursive: true });
	cpSync(join(SRC, from), join(ROOT, to), { recursive: true });
	carried.push(`${from} → ${to}`);
};

// Level docs continue — never restart. Template's docs/decisions (ADR seed)
// stays; the prototype has none.
for (const d of ["reference", "design", "plans"]) carry(`docs/${d}`, `docs/${d}`);

// Fixtures are stack-agnostic: entities become the schema's source, view/ is
// UI option data, now.ts is the anchor. script/ is already gone (strip).
carry("src/fixtures", "src/fixtures");

// The collide-y layers go to STAGING — map onto the exemplar's patterns.
// Files byte-identical to this template's own copy (shared primitives, host,
// ScreenError, states page) are skipped: they already live here.
const identical = (from) => {
	const here = join(ROOT, from);
	const there = join(SRC, from);
	try {
		return readFileSync(here, "utf8") === readFileSync(there, "utf8");
	} catch {
		return false;
	}
};
const carryStaged = (dir, dest) => {
	if (!existsSync(join(SRC, dir))) return;
	let staged = 0;
	let skipped = 0;
	for (const abs of walk(join(SRC, dir))) {
		const rel = abs.replace(`${SRC}/`, "");
		if (identical(rel)) {
			skipped++;
			continue;
		}
		const to = join(ROOT, dest, rel.replace(`${dir}/`, ""));
		mkdirSync(join(to, ".."), { recursive: true });
		cpSync(abs, to);
		staged++;
	}
	carried.push(`${dir} → ${dest} (${staged} staged, ${skipped} identical-skipped)`);
};
carryStaged("src/store", "src/_port/store");
carryStaged("src/components", "src/_port/components");
carryStaged("src/screens", "src/_port/screens");
carryStaged("e2e/flows", "e2e/_port");

console.log(`port: carried —\n  ${carried.join("\n  ")}`);
console.log(`
port: next, the mapping loop (one feature at a time):
  1. schema: extend src/db/schema.ts from src/fixtures/entities interfaces (ADR-0010;
     notes table is the worked example) + drizzle-kit generate.
  2. seed: extend src/db/seed.ts from the entity arrays.
  3. store: merge src/_port/store/reducer.ts cases into src/store/reducer.ts
     (the template host stays — it is the SSR-adapted one).
  4. screens: rebuild each src/_port/screens/* on the exemplar pattern
     (loader→queries, guarded(), primitives compose) + route in src/routes.ts.
  5. flows: move each e2e/_port/* into e2e/flows/, re-pointing paths.
  6. delete what you mapped from _port/, and the note exemplar once its
     pattern has a real follower.
Check progress: node scripts/port-from-prototype.mjs --status`);
