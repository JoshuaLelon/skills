#!/bin/sh
# Prototyping-skill scaffold. Run from inside a fresh Vite react-ts app:
#
#   npm create vite@latest <name> -- --template react-ts
#   cd <name> && npm install && sh <skill-dir>/assets/scaffold.sh
#
# Installs: canonical layout, gate + pre-commit hook, Playwright (chromium,
# webServer config), the store host with built-in dev invariants, the /__states
# page, the walkthrough harness, and npm scripts. Overwrites src/main.tsx
# deliberately (states route + StrictMode + Walkthrough). shadcn init stays a
# separate step — it is interactive.
set -e
ASSETS="$(cd "$(dirname "$0")" && pwd)"

[ -f package.json ] || { echo "scaffold: run from the app root (no package.json here)" >&2; exit 1; }

mkdir -p src/fixtures/entities src/fixtures/script src/fixtures/view \
  src/store src/components src/screens e2e/flows scripts .githooks \
  docs/reference docs/design docs/plans

# Level-doc templates (L0 intent → L1 laws → L2 designs) — the design dialogue
# fills these; [FILL: …] markers carry the elicitation prompts.
for f in reference/intent.md reference/product-invariants.md \
  design/object-model.md design/_screen-template.md; do
  [ -f "docs/$f" ] || cp "$ASSETS/docs/$f" "docs/$f"
done

cp -R "$ASSETS/template/." .

# React Router 8, SPA mode: the SAME framework as production (ADR-0013), no
# server. Screens are route modules whose clientLoaders read accessors — at
# port time clientLoader becomes loader-in-guarded() and nothing else moves.
rm -f src/App.tsx src/App.css src/main.tsx index.html
npm install react-router
npm install -D @react-router/dev
cat > vite.config.ts <<'VITE'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
})
VITE
node -e '
const fs = require("fs");
for (const f of ["tsconfig.app.json", "tsconfig.json"]) {
  if (!fs.existsSync(f)) continue;
  let t = fs.readFileSync(f, "utf8");
  if (!t.includes(".react-router/types")) {
    t = t.replace(/"include"\s*:\s*\[/, "\"include\": [\".react-router/types/**/*\", ");
    t = t.replace(/("compilerOptions"\s*:\s*\{)/, "$1\n    \"rootDirs\": [\".\", \"./.react-router/types\"],");
    fs.writeFileSync(f, t);
  }
  break;
}'
grep -q '.react-router' .gitignore 2>/dev/null || echo ".react-router" >> .gitignore

cp "$ASSETS/gate.mjs" scripts/gate.mjs
cp "$ASSETS/strip-harness.mjs" scripts/strip-harness.mjs
cp "$ASSETS/pre-commit" .githooks/pre-commit
chmod +x .githooks/pre-commit

npm pkg set \
  scripts.dev="react-router dev" \
  scripts.build="react-router build" \
  scripts.gate="react-router typegen && node scripts/gate.mjs && tsc -b" \
  scripts.check="npm run gate && playwright test --pass-with-no-tests" \
  scripts.e2e="playwright test"

npm install -D @playwright/test
npx playwright install chromium

# shadcn preflight, done FOR the agent: current shadcn init hard-fails on a
# bare Vite app — it needs Tailwind v4 wired and a path alias. Without this
# block the observed failure mode is an agent that quietly skips shadcn and
# hand-rolls controls, the exact sin the skill bans.
npm install tailwindcss @tailwindcss/vite
node -e '
const fs = require("fs");
// vite.config.ts: tailwind plugin + @ alias
let v = fs.readFileSync("vite.config.ts", "utf8");
if (!v.includes("@tailwindcss/vite")) {
  v = "import tailwindcss from \x27@tailwindcss/vite\x27\nimport path from \x27node:path\x27\n" + v;
  v = v.replace(/plugins:\s*\[/, "plugins: [tailwindcss(), ");
  v = v.replace(/(\}\)\s*)$/, "");
  if (!v.includes("resolve:")) v = v.replace(/plugins: \[[^\]]*\],?/, (m) => m + "\n  resolve: { alias: { \x27@\x27: path.resolve(\x27src\x27) } },");
  v += "})\n";
  fs.writeFileSync("vite.config.ts", v);
}
// index.css: tailwind import at the top
const css = fs.readFileSync("src/index.css", "utf8");
if (!css.includes("@import \x22tailwindcss\x22")) fs.writeFileSync("src/index.css", "@import \x22tailwindcss\x22;\n" + css);
// tsconfig alias in both files shadcn checks
for (const f of ["tsconfig.json", "tsconfig.app.json"]) {
  if (!fs.existsSync(f)) continue;
  let t = fs.readFileSync(f, "utf8");
  if (t.includes("\x22paths\x22")) continue;
  t = t.replace(/("compilerOptions"\s*:\s*\{)/, "$1\n    \x22paths\x22: { \x22@/*\x22: [\x22./src/*\x22] },");
  if (!t.includes("compilerOptions")) t = t.replace(/^\{/, "{\n  \x22compilerOptions\x22: { \x22paths\x22: { \x22@/*\x22: [\x22./src/*\x22] } },");
  fs.writeFileSync(f, t);
}
console.log("scaffold: tailwind + @ alias wired (shadcn preflight ready)");
'


# Let react-router's CLI add whatever runtime deps it wants (currently `isbot`)
# HERE, not on the user's first `npm run gate`. Observed failure: typegen adds a
# dep and triggers its own install, which prunes node_modules mid-tree — the very
# next command in the same gate run then dies on a missing @react-router/dev.
# Doing it during the scaffold means the reconcile install below sees the final
# package.json, so the first gate is a read-only operation.
npx react-router typegen || true

# Reconcile: the vite template's dependency set churns; a final plain install
# guarantees the tree matches package.json regardless of ordering effects.
npm install

git init -q 2>/dev/null || true
git config core.hooksPath .githooks

echo "scaffold: done."
echo "scaffold: next (interactive): npx shadcn@latest init"
echo "scaffold: verify: npm run gate"
