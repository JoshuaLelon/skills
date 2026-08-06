#!/usr/bin/env node
// The battle-tested dependency set, exported programmatically — never
// hand-copied. Reads a proven repo's package.json and either prints the
// install commands (default), applies them (--apply), or stamps the version
// table into AGENTS.md between the stack-index markers (--stamp).
//
//   node scripts/export-stack.mjs --from ~/workspace/pantogen         # print
//   node scripts/export-stack.mjs --from ~/workspace/pantogen --apply # install
//   node scripts/export-stack.mjs --stamp                             # table from THIS repo
//
// Versions are copied exactly as pinned in the source — the point is the SET
// that is known to work together, not freshness. Upgrade deliberately, in the
// source repo first.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const FROM = args.includes("--from") ? args[args.indexOf("--from") + 1] : null;
const APPLY = args.includes("--apply");
const STAMP = args.includes("--stamp");
const ROOT = process.cwd();

if (STAMP) {
	const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
	const rows = [
		"| package | version | kind |",
		"| --- | --- | --- |",
		...Object.entries(pkg.dependencies ?? {}).map(([n, v]) => `| ${n} | ${v} | runtime |`),
		...Object.entries(pkg.devDependencies ?? {}).map(([n, v]) => `| ${n} | ${v} | dev |`),
	];
	const agents = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
	const re = /(<!-- stack-index:start -->)[\s\S]*?(<!-- stack-index:end -->)/;
	if (!re.test(agents)) {
		console.error("export-stack: AGENTS.md has no stack-index markers.");
		process.exit(1);
	}
	writeFileSync(
		join(ROOT, "AGENTS.md"),
		agents.replace(re, `$1\nGenerated from package.json by export-stack.mjs — do not hand-edit.\n\n${rows.join("\n")}\n$2`),
	);
	console.log(`export-stack: stamped ${rows.length - 2} packages into AGENTS.md §1.`);
	process.exit(0);
}

if (!FROM) {
	console.error("export-stack: pass --from <proven-repo> (or --stamp). e.g. --from ~/workspace/pantogen");
	process.exit(1);
}

const src = JSON.parse(readFileSync(join(FROM.replace(/^~/, process.env.HOME), "package.json"), "utf8"));
const fmt = (o) =>
	Object.entries(o ?? {})
		.map(([n, v]) => `${n}@${v.replace(/^[\^~]/, "")}`)
		.join(" ");

const deps = fmt(src.dependencies);
const dev = fmt(src.devDependencies);
console.log(`# from ${FROM} (engines: ${JSON.stringify(src.engines ?? {})})`);
console.log(`npm install --save-exact ${deps}`);
console.log(`npm install --save-exact -D ${dev}`);

if (APPLY) {
	execSync(`npm install --save-exact ${deps}`, { cwd: ROOT, stdio: "inherit" });
	execSync(`npm install --save-exact -D ${dev}`, { cwd: ROOT, stdio: "inherit" });
	console.log("export-stack: applied. Run `node scripts/export-stack.mjs --stamp` to update AGENTS.md §1.");
}
