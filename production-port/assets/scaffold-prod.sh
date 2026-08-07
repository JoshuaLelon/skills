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
         check-llmstxt-spec export-stack check-config-traps check-startup check-runner; do
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
[ -f docs/decisions/README.md ] || cat > docs/decisions/README.md <<'EOF'
# Decisions (ADRs)

Immutable once accepted; supersede, never edit. Files: `ADR-NNNN-slug.md`,
copied from `adr-template.md`. Cite from code as `ADR-NNNN` — docs-check
verifies citations resolve.
EOF
[ -f docs/decisions/adr-template.md ] || cp "$ASSETS/docs/adr-template.md" docs/decisions/

# The pre-decided architecture (ADR seed, accepted): the conversation starts
# from "here's what's decided; where do you diverge?", not a blank page.
for f in "$ASSETS"/docs/adr-seed/*.md; do
  b="$(basename "$f")"
  [ -f "docs/decisions/$b" ] || cp "$f" docs/decisions/
done

# The code those ADRs promise (log door, error taxonomy, screen boundary) —
# sourced from the spanning template, the single canonical copy.
SPAN="$ASSETS/cloudflare-neon-prod-spanning-template/src"
mkdir -p src/lib src/components src/db
for f in lib/log.ts lib/errors.ts components/screen-error.tsx; do
  [ -f "src/$f" ] || cp "$SPAN/$f" "src/$f"
done
[ -f src/db/seed.ts ] || cp "$ASSETS/template-prod/src/db/seed.ts" src/db/seed.ts
[ -f docs/conventions/documentation.md ] || cat > docs/conventions/documentation.md <<'EOF'
# Documentation

Two axes, both required on every doc.

**Lifecycle — the folder.** "Where does this go" is answered by the path:

- `decisions/` — immutable ADRs (supersede, never edit)
- `design/`    — living specs: how it should behave
- `reference/` — living statements of fact
- `plans/`     — time-bounded work; delete when done
- `conventions/` — how we work

**Level — the stability tree**, in each doc's status block. Intent at the top,
implementation at the bottom; **a document may rest on things ABOVE it, never
below** — fast layers may couple to slow ones; the reverse is what rots.

| L | what | changes when |
| --- | --- | --- |
| 0 | intent — what this is for, the spiky points of view | you change your mind about the product |
| 1 | law — invariants a feature would be a bug to violate | a law turns out to be wrong |
| 2 | behaviour — how the objects behave | a feature is redesigned |
| 3 | architecture — the shape behaviour requires | a boundary moves |
| 4 | mechanism — stack, runtime, practice | a dependency or tool changes |
| 5 | in flight | constantly |

These docs began life in the prototyping phase (intent → invariants → designs)
and continue here — never restart them. Every file opens with a status block:
`Kind / Status / Updated / Level / Built (design docs; falsifiable) / Scope
(including what it does NOT cover) / Constrained by`.

Every invariant of this system, with its enforcement stated — a rule credited
with more than it catches is worse than no rule:

| invariant | enforced by |
| --- | --- |
| llms.txt generated, never edited | docs-index --check (pre-commit + CI) |
| doc add/delete/rename updates llms.txt same-commit | docs-check (staged) |
| ADR citations in code resolve | docs-check (staged) |
| ADRs immutable; only legal edit is the superseded-by pointer | docs-check (staged) |
| status block present; Kind matches folder; Level present | docs-check (staged docs) |
| design docs carry a falsifiable Built line | docs-check (staged docs) |
| [FILL:] markers worked down over time | docs:fillins — a REPORT, by design |
| level direction (rest on things above, never below) | JUDGMENT — deliberately ungated; graduates to a gate only after confirmed drift (see the production-port skill's docs-system reference) |
| doc content matches reality | the fidelity audit + the ledger — no mechanical check pretends to cover this |
EOF

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
  scripts.docs:check="node scripts/docs-check.mjs && node scripts/docs-index.mjs --check" \
  scripts.docs:index="node scripts/docs-index.mjs" \
  scripts.docs:fillins="node scripts/docs-fillins.mjs" \
  scripts.config:traps="node scripts/check-config-traps.mjs" \
  scripts.test="vitest run --passWithNoTests" \
  scripts.verify:gates="node scripts/verify-gates.mjs" \
  scripts.db:push="node scripts/db-push-guard.mjs" \
  scripts.check="npm run docs:check && npm run config:traps && npm run lint && npm run lint:arch && npm run lint:dead && npm run gate && npm run test && playwright test --pass-with-no-tests"

node scripts/docs-index.mjs

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
