#!/usr/bin/env node
// First command after copying the template (README step 1). Replaces every
// baked-in template identity with the app's — the config-traps sentinel check
// fails until this has run, so it cannot be forgotten.
//
//   node scripts/rename-app.mjs my-app
import { readFileSync, writeFileSync } from 'node:fs'

const name = process.argv[2]
if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
	console.error('usage: node scripts/rename-app.mjs <kebab-name>')
	process.exit(1)
}
const TEMPLATE = 'cloudflare-neon-prod-spanning-template'

// package.json name
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
pkg.name = name
writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`)

// wrangler: worker names + the template's OWN hyperdrive id must not survive —
// deploying with them would overwrite the reference deployment.
let w = readFileSync('wrangler.jsonc', 'utf8')
w = w
	.replaceAll('"spanning-template-demo"', `"${name}-demo"`)
	.replaceAll('"spanning-template"', `"${name}"`)
// replaceAll + /g: there is one Hyperdrive id per environment (prod and demo
// need SEPARATE configs), and a non-global replace would silently leave every
// id after the first pointing at the template's own database.
w = w.replaceAll(
	/"id": "[0-9a-f]{32}"/g,
	'"id": "00000000000000000000000000000000" /* [FILL: npx wrangler hyperdrive create] */',
)
writeFileSync('wrangler.jsonc', w)

// llms.txt head: reset to the app (regenerate below picks up the doc tree)
const l = readFileSync('llms.txt', 'utf8')
const head = `# ${name}\n\n> [FILL: one-paragraph summary — llms.txt is the entry point for an agent with no other context.]\n\n`
writeFileSync('llms.txt', head + l.slice(l.search(/^## /m)))

// README head
const r = readFileSync('README.md', 'utf8')
const readme = r.replace(
	`# ${TEMPLATE}`,
	`# ${name}\n\n[FILL: what this app is]\n\n<details><summary>Template provenance</summary>`,
)
writeFileSync('README.md', `${readme}\n</details>\n`)

console.log(
	`rename-app: ${TEMPLATE} → ${name}. Now: node scripts/docs-index.mjs && provision your own Hyperdrive (environments.md).`,
)
