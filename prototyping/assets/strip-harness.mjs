#!/usr/bin/env node
// Prototype → production, step one: remove every harness affordance from the
// tree, deterministically. What it does:
//
//   1. Refuses to run on a dirty git tree (the strip must be reviewable + revertable).
//   2. Deletes src/walkthrough.tsx and src/fixtures/script/ (harness by path —
//      the lifetime-segregation rule paying off: "becomes nothing" is a directory).
//   3. Unwraps every <Mark note="…">…</Mark> and the <Walkthrough> wrapper by
//      PARSING each file, not by matching text — see THE BRACE PROBLEM below.
//   4. Removes walkthrough / fixture-script imports.
//   5. Verifies its OWN OUTPUT: every rewritten file must still parse, and the
//      strip must not have invented any of the shapes this rewrite is known to
//      get wrong. Then greps for residual harness references.
//
// THE BRACE PROBLEM. A marker's children sit inside JSX braces, and those braces
// only mean "expression container" while the surrounding context is JSX. Delete
// the tags around them and the very same characters mean something else:
//
//     return n === 0 ? (<Mark note="n2">{row}</Mark>) : (row)
//   → return n === 0 ? ({row}) : (row)          ← ({row}) is the OBJECT { row: row }
//
//     wrapCheck={(el) => <Mark note="n1">{el}</Mark>}
//   → wrapCheck={(el) => {el}}                  ← a BLOCK BODY returning undefined
//
// Neither is a syntax error, so nothing downstream is guaranteed to catch it.
// The observed failure was one incidental tsc complaint about an array element
// type, two files already mangled, and this script reporting "clean" over both.
// The same trap is waiting in every expression position a marker can sit in:
// a parenthesized return, an arrow body, a ternary branch, a prop value, an
// array element. Whether the braces must go depends on whether the marker sat in
// JSX-children position or in an expression position — a question about the
// syntax TREE, not about the characters. So we ask the parser, and the answer
// kills the whole family at once rather than one shape at a time.
//
// Requires the TypeScript compiler API (`ts.createSourceFile`), which every
// prototype has: `typescript` is a devDependency of the Vite react-ts template
// and `npm run gate` shells out to `tsc -b`. TypeScript 7 removed that API — it
// ships `typescript/unstable/ast`, which has the node predicates but no parser
// entry point — and on 7 this script REFUSES rather than falling back to text
// matching, because the entire lesson here is that a plausible-looking text
// rewrite of JSX fails silently.
//
// Flags: --states  also delete src/states.tsx and its main.tsx route
//        (default: keep — the states page is useful in production too)
//
// After running: `npm run gate && npx playwright test` must be green before the
// strip commit. Flow tests survive by design — they never touch the harness.

import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const STRIP_STATES = process.argv.includes("--states");
const HARNESS_TAGS = new Set(["Mark", "Walkthrough"]);

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

// -- 2. the parser -----------------------------------------------------------
// Resolved BEFORE anything is deleted: a missing parser must not leave a
// half-stripped tree behind.
const ts = await (async () => {
	let mod;
	try {
		// Resolve from the TARGET repo, not from this script. A bare
		// `import("typescript")` in ESM resolves relative to the importing module's
		// URL — which is this file, inside the skill directory, where no
		// node_modules exists. It therefore refused in every repo including ones
		// with typescript installed, i.e. the codemod was inert. `typescript` is a
		// devDependency of the prototype, so look there.
		const req = createRequire(join(ROOT, "package.json"));
		mod = req("typescript");
	} catch {
		console.error(
			"strip-harness: `typescript` is not installed here — refusing.\n" +
				"  This codemod parses the JSX it rewrites; see THE BRACE PROBLEM at the\n" +
				"  top of this file for why a text rewrite is not an acceptable substitute.\n" +
				"  Fix: npm i -D typescript@6",
		);
		process.exit(1);
	}
	if (typeof mod?.createSourceFile !== "function") {
		console.error(
			`strip-harness: typescript ${mod?.version ?? "?"} exposes no compiler API\n` +
				"  (createSourceFile). TypeScript 7 replaced it with typescript/unstable/ast,\n" +
				"  which ships node predicates but no parser entry point. Refusing rather than\n" +
				"  falling back to text matching — see THE BRACE PROBLEM at the top of this file.\n" +
				"  Fix: npm i -D typescript@6, run this script, then restore your pin.",
		);
		process.exit(1);
	}
	return mod;
})();

const parseOf = (file, text) =>
	ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

// `parseDiagnostics` is not in the public typings, but it has been on the node
// for every version that has a compiler API at all. Returning null when it is
// missing matters: the verification below must SAY it cannot verify rather than
// quietly check nothing.
function parseErrors(sf) {
	const diags = sf.parseDiagnostics;
	if (!Array.isArray(diags)) return null;
	return diags.map((d) => `line ${sf.getLineAndCharacterOfPosition(d.start ?? 0).line + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`);
}

const deleted = [];
const edited = [];

// -- 3. harness by path ------------------------------------------------------
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

// -- 4. unwrap Mark / Walkthrough, drop their imports ------------------------
function harnessElements(sf) {
	const found = [];
	(function visit(node) {
		const tag = ts.isJsxElement(node) ? node.openingElement.tagName : ts.isJsxSelfClosingElement(node) ? node.tagName : null;
		if (tag && ts.isIdentifier(tag) && HARNESS_TAGS.has(tag.text)) found.push(node);
		ts.forEachChild(node, visit);
	})(sf);
	return found;
}

// JSX drops whitespace-only text that spans a line break, and `{/* … */}`
// renders nothing. Neither counts as a child when deciding what a marker wrapped.
const isNothing = (c) =>
	(ts.isJsxText(c) && (c.containsOnlyTriviaWhiteSpaces ?? /^\s*$/.test(c.text))) || (ts.isJsxExpression(c) && !c.expression);

// Splicing an expression into whatever slot the marker occupied is only safe if
// it binds at least as tightly as a call argument: `a, b` spliced into `[…, x]`
// silently becomes two elements. Parens are legal wherever an expression is, so
// anything not obviously atomic gets them — object literals included, since a
// bare one landing in an arrow's concise body would be read as a block.
const isAtomic = (e) =>
	ts.isIdentifier(e) ||
	ts.isPropertyAccessExpression(e) ||
	ts.isElementAccessExpression(e) ||
	ts.isCallExpression(e) ||
	ts.isNewExpression(e) ||
	ts.isParenthesizedExpression(e) ||
	ts.isArrayLiteralExpression(e) ||
	ts.isNonNullExpression(e) ||
	ts.isJsxElement(e) ||
	ts.isJsxSelfClosingElement(e) ||
	ts.isJsxFragment(e) ||
	ts.isStringLiteral(e) ||
	ts.isNumericLiteral(e) ||
	ts.isNoSubstitutionTemplateLiteral(e) ||
	ts.isTemplateExpression(e) ||
	e.kind === ts.SyntaxKind.ThisKeyword;

function replacementFor(node, sf, text) {
	const p = node.parent;
	// The ONE position where the children's braces still mean "JSX expression
	// container" once the tags are gone: directly inside another element or
	// fragment. Everywhere else — inside `{…}`, a ternary, a return, an arrow
	// body, an argument list — the marker sat in an EXPRESSION slot, and the
	// braces have to go with the tags.
	const inJsxChildren = p && (ts.isJsxElement(p) || ts.isJsxFragment(p));
	if (ts.isJsxSelfClosingElement(node)) return inJsxChildren ? "" : "null";
	const inner = text.slice(node.openingElement.end, node.closingElement.getStart(sf));
	if (inJsxChildren) return inner;
	const kids = node.children.filter((c) => !isNothing(c));
	if (kids.length === 0) return "null";
	if (kids.length === 1) {
		const k = kids[0];
		if (ts.isJsxExpression(k) && k.expression && !k.dotDotDotToken) {
			const src = text.slice(k.expression.getStart(sf), k.expression.end);
			return isAtomic(k.expression) ? src : `(${src})`;
		}
		if (ts.isJsxElement(k) || ts.isJsxSelfClosingElement(k) || ts.isJsxFragment(k)) return text.slice(k.getStart(sf), k.end);
	}
	// Bare text, a spread, or several children: a fragment is the only thing that
	// is both a legal expression here and the same rendering.
	return `<>${inner}</>`;
}

// One outermost layer per pass, re-parsing between: an outer marker's
// replacement is cut from the text as it stands and may still contain a nested
// marker, so the next pass is what sees that one. Each pass removes at least one
// element and adds none, so this terminates; the bound is a tripwire, not a
// budget.
function unwrapHarness(file, text) {
	for (let pass = 0; pass < 64; pass++) {
		const sf = parseOf(file, text);
		const found = harnessElements(sf);
		if (found.length === 0) return text;
		const outer = found.filter((n) => !found.some((o) => o !== n && o.getStart(sf) <= n.getStart(sf) && n.end <= o.end));
		const edits = outer
			.map((n) => {
				const rep = replacementFor(n, sf, text);
				let end = n.end;
				// A deleted self-closing marker takes its trailing whitespace with it,
				// or it leaves a hole in the middle of a JSX tree.
				if (rep === "") while (end < text.length && /\s/.test(text[end])) end++;
				return { start: n.getStart(sf), end, rep };
			})
			.sort((a, b) => b.start - a.start);
		for (const e of edits) text = text.slice(0, e.start) + e.rep + text.slice(e.end);
	}
	throw new Error(`strip-harness: ${file}: harness unwrap did not converge — the codemod is looping, not the input`);
}

function* walk(rel) {
	for (const name of readdirSync(join(ROOT, rel))) {
		if (["node_modules", "dist", ".git"].includes(name)) continue;
		const p = join(rel, name);
		if (statSync(join(ROOT, p)).isDirectory()) yield* walk(p);
		else yield p;
	}
}

function* srcFiles() {
	if (!existsSync(join(ROOT, "src"))) return;
	for (const f of walk("src")) if (/\.(tsx|ts)$/.test(f)) yield f;
}

// Kept for the verification pass below — it needs the pre-strip picture of every
// file it is asked to vouch for.
const original = new Map();

for (const file of srcFiles()) {
	const before = readFileSync(join(ROOT, file), "utf8");
	original.set(file, before);
	let after = before
		.split("\n")
		.filter((l) => !/import\s.*from\s+['"][./]*\.?\.?\/?walkthrough(\.tsx)?['"]/.test(l))
		.filter((l) => !/import\s.*from\s+['"].*fixtures\/script\//.test(l))
		.join("\n");
	after = unwrapHarness(file, after);
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

// -- 5. verify the output ----------------------------------------------------
// A codemod that reports success has to know its output still MEANS what it
// meant. Three checks, in descending order of how much they actually prove:
//
//   (a) a file that parsed before the strip must parse after it. Catches every
//       member of the brace family whose damage is outright nonsense.
//   (b) the strip invented none of the shapes this rewrite is known to get
//       wrong: an object literal made only of shorthand properties (`{row}` that
//       used to be a JSX container) and an arrow whose block body is a single
//       bare identifier (`=> {el}`). Both are the SILENT half of the family —
//       they parse. Compared as a MULTISET of source texts against the pre-strip
//       file, so a shape the prototype already had is not blamed on the strip,
//       and so removing one while adding another is still caught.
//   (c) no harness element survives anywhere in the tree — an AST check, unlike
//       the text grep below, which also has to answer for imports and comments.
//
// What this does NOT prove: that the output type-checks, that a screen still
// renders what it rendered, or that a rewrite which is well-formed and
// unsuspicious kept the right meaning — such a rewrite passes all three checks.
// (b) in particular is a tripwire for two known shapes, not a semantic diff.
// `npm run gate && npx playwright test` is still what says the strip was
// CORRECT; this only guarantees the script fails LOUDLY instead of reporting
// clean over a mangled tree.
function suspects(sf) {
	const out = [];
	(function visit(n) {
		if (ts.isObjectLiteralExpression(n) && n.properties.length > 0 && n.properties.every((p) => ts.isShorthandPropertyAssignment(p)))
			out.push({ what: "an object literal of only shorthand properties (a JSX container that lost its context?)", node: n });
		else if (
			ts.isArrowFunction(n) &&
			ts.isBlock(n.body) &&
			n.body.statements.length === 1 &&
			ts.isExpressionStatement(n.body.statements[0]) &&
			ts.isIdentifier(n.body.statements[0].expression)
		)
			out.push({ what: "an arrow whose block body is one bare identifier (it returns undefined)", node: n });
		ts.forEachChild(n, visit);
	})(sf);
	return out;
}
// Position-independent, so moved code is not mistaken for new code. Neither
// suspect shape can contain a marker, so its text cannot change under the strip.
const keyOf = (s, sf) => `${s.what} ${s.node.getText(sf).replace(/\s+/g, " ")}`;

const broken = [];
for (const file of srcFiles()) {
	const text = readFileSync(join(ROOT, file), "utf8");
	const sfAfter = parseOf(file, text);
	const errsAfter = parseErrors(sfAfter);
	if (errsAfter === null) {
		broken.push(`${file}: CANNOT self-verify — this TypeScript build exposes no parse diagnostics`);
		continue;
	}
	// (c) — every file, edited or not.
	for (const n of harnessElements(sfAfter)) broken.push(`${file}:${lineOf(sfAfter, n)}: a harness element survived the unwrap`);
	const before = original.get(file);
	if (before === undefined || before === text) continue;
	const sfBefore = parseOf(file, before);
	const errsBefore = parseErrors(sfBefore) ?? [];
	if (errsBefore.length) {
		broken.push(`${file}: did not parse BEFORE the strip, so this rewrite cannot be vouched for — ${errsBefore[0]}`);
		continue;
	}
	// (a)
	for (const e of errsAfter) broken.push(`${file}: broken by the strip — ${e}`);
	// (b)
	const had = new Map();
	for (const s of suspects(sfBefore)) {
		const k = keyOf(s, sfBefore);
		had.set(k, (had.get(k) ?? 0) + 1);
	}
	for (const s of suspects(sfAfter)) {
		const k = keyOf(s, sfAfter);
		const n = had.get(k) ?? 0;
		if (n > 0) {
			had.set(k, n - 1);
			continue;
		}
		broken.push(`${file}:${lineOf(sfAfter, s.node)}: the strip created ${s.what} — ${s.node.getText(sfAfter).replace(/\s+/g, " ").slice(0, 90)}`);
	}
}

// Text-level residue: imports, strings, and anything the AST scan cannot see.
const residue = [];
const NEEDLES = ["<Mark", "</Mark", "<Walkthrough", "</Walkthrough", "fixtures/script", "from './walkthrough", "from '../walkthrough", 'from "./walkthrough', 'from "../walkthrough', "import('./walkthrough", 'import("./walkthrough'];
if (STRIP_STATES) NEEDLES.push("StatesPage");
for (const file of srcFiles()) {
	const text = readFileSync(join(ROOT, file), "utf8");
	for (const n of NEEDLES) if (text.includes(n)) residue.push(`${file}: contains "${n}"`);
}

console.log(`strip-harness: deleted ${deleted.length}: ${deleted.join(", ") || "(none)"}`);
console.log(`strip-harness: edited  ${edited.length}: ${edited.join(", ") || "(none)"}`);
if (broken.length) {
	console.error(
		"strip-harness: NOT VERIFIED — do not commit this tree.\n" +
			"  Each line below is either damage the strip did or a file it cannot vouch for.\n" +
			"  Revert (`git checkout -- src`), fix the cause, re-run. Do NOT hand-patch the\n" +
			"  output: if the codemod got a shape wrong, it got EVERY occurrence of it wrong.\n  " +
			broken.join("\n  "),
	);
	process.exit(1);
}
if (residue.length) {
	console.error(`strip-harness: RESIDUE — resolve by hand:\n  ${residue.join("\n  ")}`);
	process.exit(1);
}
console.log(`strip-harness: verified — ${edited.length} rewritten file(s) still parse and the strip invented no brace-context damage.`);
console.log("strip-harness: clean. Now run: npm run gate && npx playwright test");
