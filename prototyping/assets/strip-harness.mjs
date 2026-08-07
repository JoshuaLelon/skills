#!/usr/bin/env node
// Prototype → production, step one: remove every harness affordance from the
// tree, deterministically. Zero dependencies. What it does:
//
//   1. Refuses to run on a dirty git tree (the strip must be reviewable + revertable).
//   2. Deletes src/walkthrough.tsx and src/fixtures/script/ (harness by path —
//      the lifetime-segregation rule paying off: "becomes nothing" is a directory).
//   3. Unwraps every <Mark note="…">…</Mark> in src/ (depth-aware, handles
//      nesting) and drops self-closing <Mark … />.
//   4. Removes walkthrough imports and the <Walkthrough> wrapper in main.tsx.
//   5. Verifies: greps for residual harness references and reports them.
//
// Flags: --states  also delete src/states.tsx and its main.tsx route
//        (default: keep — the states page is useful in production too)
//
// After running: `npm run gate && npx playwright test` must be green before the
// strip commit. Flow tests survive by design — they never touch the harness.

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const STRIP_STATES = process.argv.includes("--states");

// -- 1. clean tree only ------------------------------------------------------
try {
	const dirty = execSync("git status --porcelain", { cwd: ROOT }).toString().trim();
	if (dirty) {
		console.error(`strip-harness: git tree is dirty — commit or stash first.\n${dirty}`);
		process.exit(1);
	}
} catch {
	console.error("strip-harness: not a git repository — refusing (no way back).");
	process.exit(1);
}

const deleted = [];
const edited = [];

// -- 2. harness by path ------------------------------------------------------
for (const p of ["src/walkthrough.tsx", "src/fixtures/script"]) {
	if (existsSync(join(ROOT, p))) {
		rmSync(join(ROOT, p), { recursive: true });
		deleted.push(p);
	}
}
if (STRIP_STATES && existsSync(join(ROOT, "src/states.tsx"))) {
	rmSync(join(ROOT, "src/states.tsx"));
	deleted.push("src/states.tsx");
}

// -- 3 + 4. unwrap Mark / Walkthrough, drop their imports --------------------
// Depth-aware unwrap: removes <Tag …> and its matching </Tag>, keeps children.
function unwrap(text, tag) {
	const selfClose = new RegExp(`<${tag}(\\s[^>]*)?/>\\s*`, "g");
	let out = text.replace(selfClose, "");
	// Tokenize open/close pairs so nested tags resolve correctly.
	const token = new RegExp(`<${tag}(\\s[^>]*)?>|</${tag}>`, "g");
	const spans = [];
	const stack = [];
	let m = token.exec(out);
	while (m !== null) {
		if (m[0].startsWith(`</`)) {
			const o = stack.pop();
			if (o) spans.push([o.index, o.index + o.length], [m.index, m.index + m[0].length]);
		} else {
			stack.push({ index: m.index, length: m[0].length });
		}
		m = token.exec(out);
	}
	spans.sort((a, b) => b[0] - a[0]);
	for (const [s, e] of spans) out = out.slice(0, s) + out.slice(e);
	return out;
}

// A marker wrapped around a control passed as a prop —
//   wrapCheck={(el) => <Mark note="n1">{el}</Mark>}
// — unwraps to `(el) => {el}`, whose braces are no longer a JSX expression
// container but a FUNCTION BODY: it returns undefined, so the wrapped control
// silently disappears. TypeScript accepts it, so nothing downstream catches it.
// Collapse the artifact back to a concise-body arrow.
//
// Deliberately narrow: only an arrow whose entire body is a single bare
// identifier in braces. `(x) => { doThing() }` and anything with a statement is
// left alone, because only the JSX-container form can produce this shape.
function fixArrowBodies(text) {
	return text.replace(/=>\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/g, "=> $1");
}

function* walk(rel) {
	for (const name of readdirSync(join(ROOT, rel))) {
		if (["node_modules", "dist", ".git"].includes(name)) continue;
		const p = join(rel, name);
		if (statSync(join(ROOT, p)).isDirectory()) yield* walk(p);
		else yield p;
	}
}

for (const file of existsSync(join(ROOT, "src")) ? walk("src") : []) {
	if (!/\.(tsx|ts)$/.test(file)) continue;
	const before = readFileSync(join(ROOT, file), "utf8");
	let after = before
		.split("\n")
		.filter((l) => !/import\s.*from\s+['"][./]*\.?\.?\/?walkthrough(\.tsx)?['"]/.test(l))
		.filter((l) => !/import\s.*from\s+['"].*fixtures\/script\//.test(l))
		.join("\n");
	after = fixArrowBodies(unwrap(unwrap(after, "Mark"), "Walkthrough"));
	if (STRIP_STATES) {
		after = after
			.split("\n")
			.filter((l) => !/import\s.*from\s+['"][./]*states(\.tsx)?['"]/.test(l))
			.join("\n");
		// main.tsx's states route line references StatesPage — leave a clear error
		// if it survives; verification below reports it.
	}
	if (after !== before) {
		writeFileSync(join(ROOT, file), after);
		edited.push(file);
	}
}

// -- 5. verify ---------------------------------------------------------------
// Code-level references only — comments may legitimately mention the harness.
const residue = [];
const NEEDLES = ["<Mark", "</Mark", "<Walkthrough", "</Walkthrough", "fixtures/script", "from './walkthrough", "from '../walkthrough", 'from "./walkthrough', 'from "../walkthrough', "import('./walkthrough", 'import("./walkthrough'];
if (STRIP_STATES) NEEDLES.push("StatesPage");
for (const file of existsSync(join(ROOT, "src")) ? walk("src") : []) {
	if (!/\.(tsx|ts)$/.test(file)) continue;
	const text = readFileSync(join(ROOT, file), "utf8");
	for (const n of NEEDLES) if (text.includes(n)) residue.push(`${file}: contains "${n}"`);
}

console.log(`strip-harness: deleted ${deleted.length}: ${deleted.join(", ") || "(none)"}`);
console.log(`strip-harness: edited  ${edited.length}: ${edited.join(", ") || "(none)"}`);
if (residue.length) {
	console.error(`strip-harness: RESIDUE — resolve by hand:\n  ${residue.join("\n  ")}`);
	process.exit(1);
}
console.log("strip-harness: clean. Now run: npm run gate && npx playwright test");
