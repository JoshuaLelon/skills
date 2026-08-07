#!/bin/sh
# Build N isolated copies of a REAL app built from the production-port template,
# each its own git repo at a green baseline, for turning fresh agents loose on.
#
#   sh lab.sh <lab-dir> <name>...
#
# The point is that the app is built the way the README says to build one —
# rename-app, git init, lefthook install — because two of the bugs this harness
# has found so far lived in that path and were invisible from inside the
# template (which never runs rename-app on itself).
#
# APFS clones (cp -Rc) make node_modules effectively free; the copies share one
# Postgres, which is itself a live test of ADR-0006's claim that owner-scoped
# isolation makes that safe.
set -e
LAB="${1:?usage: lab.sh <lab-dir> <name>...}"; shift
TPL="$(cd "$(dirname "$0")" && pwd)/cloudflare-neon-prod-spanning-template"
[ -d "$TPL" ] || { echo "lab: cannot find the template beside this script" >&2; exit 1; }

rm -rf "$LAB"; mkdir -p "$LAB"
cp -Rc "$TPL" "$LAB/pristine" 2>/dev/null || cp -R "$TPL" "$LAB/pristine"
cd "$LAB/pristine"
rm -rf .git test-results build
node scripts/rename-app.mjs notekeeper >/dev/null
git init -q .
npx lefthook install >/dev/null 2>&1 || true
[ -f .dev.vars ] || cp .dev.vars.example .dev.vars
node scripts/docs-index.mjs >/dev/null
git add -A
git -c user.email=lab@lab -c user.name=lab commit -q --no-verify -m "notekeeper: from the production-port template"

echo "lab: baseline built. verifying it is green BEFORE cloning —"
npm run check:ci 2>&1 | grep -E 'CHECK SUMMARY|checks in' || {
	echo "lab: BASELINE IS NOT GREEN — fix that first; every result would be polluted." >&2
	exit 1
}

for n in "$@"; do
	cp -Rc "$LAB/pristine" "$LAB/$n" 2>/dev/null || cp -R "$LAB/pristine" "$LAB/$n"
	echo "lab: $LAB/$n"
done
