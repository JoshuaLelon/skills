#!/bin/sh
# Production-port toolify step. Stack-agnostic: run inside the repo AFTER the
# harness strip — it layers the production tooling (static analysis, hooks,
# docs system, gate verification) onto whatever app stack was chosen. It does
# NOT create the app or the database; those are skill phases with judgment in
# them.
#
#   sh <skill-dir>/assets/scaffold-prod.sh
#
# Ends by running verify-gates: every rule it installed must prove it can fire.
set -e
ASSETS="$(cd "$(dirname "$0")" && pwd)"

[ -f package.json ] || { echo "scaffold-prod: run from the repo root" >&2; exit 1; }

# -- configs (copied, not authored — improve the skill's copy) ----------------
cp "$ASSETS/configs/biome.json" .
cp "$ASSETS/configs/.oxlintrc.json" .
cp "$ASSETS/configs/.dependency-cruiser.cjs" .
cp "$ASSETS/configs/knip.json" .
cp "$ASSETS/configs/lefthook.yml" .
[ -f .dev.vars.example ] || cp "$ASSETS/configs/.dev.vars.example" .
mkdir -p ast-grep/rules scripts
cp "$ASSETS/ast-grep/sgconfig.yml" ./sgconfig.yml
cp "$ASSETS"/ast-grep/rules/*.yml ast-grep/rules/
# Sourced from the spanning template — the SINGLE canonical copy of these
# scripts (same move as the log/errors/screen-error dedupe). There used to be a
# second set under assets/scripts/ for this path to copy from; the two were
# byte-different in every file, because only the template's copies sit inside
# biome's `includes` and get formatted. They never diverged in behaviour, but
# nothing would have caught it if they had: check-parity.mjs guards the nine
# files shared with the PROTOTYPING skill and never covered this pair.
SPAN_SCRIPTS="$ASSETS/cloudflare-neon-prod-spanning-template/scripts"
for s in verify-gates db-push-guard docs-check docs-index docs-fillins \
         check-llmstxt-spec export-stack check-config-traps check-startup check-runner \
         adr-graph docs-tracks; do
  cp "$SPAN_SCRIPTS/$s.mjs" scripts/
done

# The prototype gate keeps running until each rule is superseded (SKILL Phase 2).
# A port into a fresh repo arrives without it — pull it from the sibling skill.
[ -f scripts/gate.mjs ] || cp "$ASSETS/../../prototyping/assets/gate.mjs" scripts/gate.mjs \
  || echo "scaffold-prod: WARNING — scripts/gate.mjs missing and prototyping skill not found; lefthook's prototype-gate will fail"
[ -f vitest.config.ts ] || cp "$ASSETS/configs/vitest.config.ts" .
mkdir -p .github/workflows
[ -f .github/workflows/check.yml ] || cp "$ASSETS/configs/check.yml" .github/workflows/

# Deterministic patches — the agent never hand-edits these:
grep -q '^\.dev\.vars$' .gitignore 2>/dev/null || echo ".dev.vars" >> .gitignore
# TS 7 discipline: erasableSyntaxOnly bans enum/namespace mechanically.
node -e '
const fs = require("fs");
for (const f of ["tsconfig.app.json", "tsconfig.json"]) {
  if (!fs.existsSync(f)) continue;
  const t = fs.readFileSync(f, "utf8");
  if (t.includes("erasableSyntaxOnly")) break;
  const patched = t.replace(/("compilerOptions"\s*:\s*\{)/, "$1\n    \"erasableSyntaxOnly\": true,");
  if (patched !== t) { fs.writeFileSync(f, patched); console.log(`scaffold-prod: added erasableSyntaxOnly to ${f}`); }
  break;
}'

# -- docs skeleton ------------------------------------------------------------
mkdir -p docs/decisions docs/design docs/reference docs/plans docs/conventions

# Always-loaded rules file: the distilled playbook lessons prefilled,
# app-specifics as [FILL]s. The playbooks themselves are NOT vendored — their
# generalizable content lives in this template and the skill's references;
# the masters at ~/workspace/epic-*.md remain the source to re-distill from.
[ -f AGENTS.md ] || cp "$ASSETS/docs/AGENTS-template.md" AGENTS.md

# -- everything below is COPIED from the spanning template, never re-authored --
# There were three copies of the docs conventions (here as a heredoc, the
# template's, and the skill's reference) and two of the ADR seed. They had
# already drifted: the heredoc still described `docs-check` as freezing the
# whole ADR file and listed none of the status-block edges. One canonical copy,
# in the template, the same fix the scripts got.
SPAN_DOCS="$ASSETS/cloudflare-neon-prod-spanning-template/docs"

[ -f docs/conventions/documentation.md ] \
  || cp "$SPAN_DOCS/conventions/documentation.md" docs/conventions/
[ -f docs/decisions/README.md ] || cp "$SPAN_DOCS/decisions/README.md" docs/decisions/
[ -f docs/decisions/adr-template.md ] || cp "$SPAN_DOCS/decisions/adr-template.md" docs/decisions/

# The pre-decided architecture (ADR seed, accepted): the conversation starts
# from "here's what's decided; where do you diverge?", not a blank page. The
# tree they form is DERIVED — docs:adr-graph regenerates it from the edges each
# ADR declares, so nothing here states a count or a dependency in prose.
for f in "$SPAN_DOCS"/decisions/[0-9]*.md; do
  b="$(basename "$f")"
  [ -f "docs/decisions/$b" ] || cp "$f" docs/decisions/
done

# Adoption dates. `Updated:` on a seed ADR means "when THIS app adopted the
# seed" — which is now. The seed ships [FILL: adoption date] and, left alone,
# every app inherits 23 unfilled markers and a dating discipline that is purely
# decorative. Status-block-only edits, which docs-check permits by design.
TODAY="$(date +%F)"
for f in docs/decisions/[0-9]*.md; do
  [ -f "$f" ] || continue
  sed -i.bak "s/\*\*Updated:\*\* \[FILL: adoption date\]/**Updated:** $TODAY/" "$f" && rm -f "$f.bak"
done

# The lookup table those ADRs cite. It ships INTO the app because the citations
# are relative — `../reference/cloudflare-primitives.md` resolves only if it is
# here, and a dangling pointer in every ported app is what the skill-only copy
# used to be.
# cloudflare-primitives.md is the lookup behind the selection ADRs;
# measurements.md holds the figures ADR-0017 and ADR-0019 argue from. Both are
# cited relatively from decisions/, so a missing one is a dangling pointer.
for r in cloudflare-primitives measurements; do
  [ -f "docs/reference/$r.md" ] || cp "$SPAN_DOCS/reference/$r.md" docs/reference/
done

# The code those ADRs promise (log door, error taxonomy, screen boundary) —
# sourced from the spanning template, the single canonical copy.
SPAN="$ASSETS/cloudflare-neon-prod-spanning-template/src"
mkdir -p src/lib src/components src/db
for f in lib/log.ts lib/errors.ts components/screen-error.tsx; do
  [ -f "src/$f" ] || cp "$SPAN/$f" "src/$f"
done
[ -f src/db/seed.ts ] || cp "$ASSETS/template-prod/src/db/seed.ts" src/db/seed.ts

# -- dependencies + wiring ----------------------------------------------------
npm install -D @biomejs/biome oxlint @ast-grep/cli dependency-cruiser knip lefthook vitest

# Adoption pass: reconcile the config with the installed biome version, then
# format the whole tree once — this is also the formatter pass that erases the
# blank lines strip-harness leaves behind.
npx biome migrate --write >/dev/null 2>&1 || true
npx biome check --write . || true

# scripts.gate may already exist from the prototyping scaffold — only set if absent.
node -e '
const fs = require("fs");
const p = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!p.scripts?.gate) { p.scripts = { ...p.scripts, gate: "node scripts/gate.mjs && tsc -b" };
  fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n"); }'

npm pkg set \
  scripts.lint="biome check . && oxlint && ast-grep scan" \
  scripts.lint:arch="depcruise src --config .dependency-cruiser.cjs" \
  scripts.lint:dead="knip" \
  scripts.docs:check="node scripts/docs-check.mjs && node scripts/docs-index.mjs --check && node scripts/adr-graph.mjs --check && node scripts/docs-tracks.mjs" \
  scripts.docs:index="node scripts/docs-index.mjs" \
  scripts.docs:adr-graph="node scripts/adr-graph.mjs" \
  scripts.docs:tracks="node scripts/docs-tracks.mjs" \
  scripts.docs:bless="node scripts/docs-tracks.mjs --bless" \
  scripts.docs:fillins="node scripts/docs-fillins.mjs" \
  scripts.config:traps="node scripts/check-config-traps.mjs" \
  scripts.types="wrangler types" \
  scripts.types:check="wrangler types --check" \
  scripts.check:startup="npm run build && node scripts/check-startup.mjs" \
  scripts.test="vitest run --passWithNoTests" \
  scripts.verify:gates="node scripts/verify-gates.mjs" \
  scripts.db:push="node scripts/db-push-guard.mjs" \
  scripts.check="npm run docs:check && npm run config:traps && npm run types:check && npm run lint && npm run lint:arch && npm run lint:dead && npm run gate && npm run test && npm run check:startup && playwright test --pass-with-no-tests"

node scripts/docs-index.mjs
node scripts/adr-graph.mjs

# Lefthook supersedes the prototype's hand-rolled hook — its lefthook.yml
# includes everything the old .githooks/pre-commit ran (gate + flow suite).
if [ -z "$SKIP_LEFTHOOK" ]; then
  git config --unset-all --local core.hooksPath 2>/dev/null || true
  rm -rf .githooks
  npx lefthook install
fi

echo "scaffold-prod: proving every gate can fire…"
node scripts/verify-gates.mjs

node scripts/check-llmstxt-spec.mjs
echo ""
echo "scaffold-prod: done. The pre-commit hook now runs lint + arch + gate + docs + flows."
echo "scaffold-prod: the doc fill-in checklist — work through it with the user:"
node scripts/docs-fillins.mjs
