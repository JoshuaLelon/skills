# AGENTS.md — [FILL: app name]

Always-loaded rules file. It may RESTATE a fact from any doc level; it may not
ORIGINATE one — a fact stated only here has no home that constrains it. Rules
live here one line each; the owning doc carries the reasoning.

## 0. Precedence when documents conflict

This file > `docs/design/*.md` > the production-port skill references
(react-patterns, testing, environments) > the playbook masters at
`~/workspace/epic-*.md` > general knowledge.
[FILL: adjust if the stack differs from the playbooks' assumptions]

## 1. Stack

<!-- stack-index:start -->
[FILL: run `node scripts/export-stack.mjs --stamp` to generate this table from
package.json — never hand-write versions; the hand-written version listed six
uninstalled packages within days]
<!-- stack-index:end -->

## 2. Divergences from the playbooks

Where this app deliberately departs from the playbooks' defaults, with the
reason. (The playbooks assume: Prisma, Conform+Zod, MSW, password auth,
progressive enhancement — diverge knowingly, and write it down here.)

[FILL: the divergence table for this app]

## 3. Banned patterns

Two tiers, and the tier is stated per row — **a rule credited with more than it
catches is worse than a rule nobody trusts, because the gap is invisible from
the claim.**

| id | rule | enforced by |
| --- | --- | --- |
| no-date-now-in-domain | domain logic takes `now` as an argument | ast-grep + verify:gates |
| no-testid-locator | role/name locators; no `getByTestId`/`waitForTimeout` | ast-grep + verify:gates |
| no-owner-from-params | owner comes from the session, never a route param | ast-grep + verify:gates |
| store-is-pure | store imports no view, framework, or db | dependency-cruiser + verify:gates |
| no-db-in-view | screens/components import no server-only deps | dependency-cruiser + verify:gates |
| no-any | `unknown` + narrowing, never `any` | oxlint |
| no-react-legacy(+ts) | no `forwardRef` / `useContext` — React 19 forms | ast-grep + verify:gates |
| no-remix-imports(+tsx) | Remix merged into RR8; upload pkgs exempt | ast-grep + verify:gates |
| no-app-load-context(+tsx) | RR7 API — builds clean, 500s at runtime | ast-grep + verify:gates |
| no-inline-promise-in-use(+ts) | `use(f())` refetches every render, forever | ast-grep + verify:gates |
| no-stale-zod | Zod 4 forms; old error params silently ignored | ast-grep + verify:gates |
| no-bcrypt | Argon2id or nothing; bcrypt truncates at 72 bytes | dependency-cruiser + verify:gates |
| single-door-console(+tsx) | logging via lib/log wide events; raw console is an unqueryable string | ast-grep + verify:gates |
| one-door-model(+tsx) | the model SDK only via the src/lib/ai adapter (ADR-0012) | ast-grep + verify:gates |
| config traps | jsdom, coverage thresholds, `--env` deploys, erasableSyntaxOnly, env-manifest completeness, wrangler per-env compat-date + vars parity | check-config-traps.mjs |
| rule coverage | every error-severity rule has a mutation, or is declared unprovable with a reason | verify:gates pre-pass |
| doc status blocks | staged docs carry Kind (matching folder), Level, and Built on designs | docs-check (staged only) |
| [FILL: app-specific bans — add the ast-grep rule AND its verify-gates mutation in the same commit; prose-only rows must say "prose only"] | | |

## 4. Traps that no gate can catch

Everything mechanizable moved into gates (§3, `check-config-traps.mjs`,
tsconfig's `erasableSyntaxOnly`) — run `npm run verify:gates` to see them all
prove they fire. A trap earns a line HERE only if it is **silent, ungateable,
and universal**:

- **Hiding UI is not authorization.** Every protected loader/action re-checks
  auth server-side; the component tree is presentation, not enforcement.
- **Never bare `wrangler dev` / `wrangler deploy`** — both serve/ship the stale
  `./build`, not current source, with exit 0. The npm scripts are the only
  path (config-traps checks the scripts; nothing can check your fingers).
- **Deprecated-but-working is not broken.** Prefer new forms in new code;
  never mass-rewrite working schemas or APIs to chase a deprecation list.
- **Execution outranks documentation on this stack** — peer-dep ranges lie and
  "removed" APIs live; smoke-run before encoding any version claim as a rule
  (that's what §7's ledger is for).

[FILL: app-specific ungateable traps — added the day they bite, with the
incident one-liner. If a machine could catch it, it goes in a gate instead,
in the same commit.]

The gated traps' reasoning lives where it belongs: rule `message:` fields,
`check-config-traps.mjs` assertions, and the skill references
(`react-patterns.md` for React/RR8/Zod/forms, `testing.md` for
Vitest/Playwright/MSW) — loaded when doing that work, not always.

## 5. Ownership

Every entity carries `owner`; the owner comes from the session, never from a
route param or request body (`/things/:id` does not decide whose thing it is).
Parse what crosses a trust boundary; trust what your own loader produced.
[FILL: this app's auth mechanics pointer]

## 6. Testing

The rules live in the production-port skill's `references/testing.md`; the two
that outrank everything: **a test must fail if, and only if, the intention
behind the system is not met** — and when a test fails, fix the code, not the
assertion. Four one-liners that change output daily:

- Hooks are for environment, test bodies are for data — never hoist fixtures or
  mock responses into `beforeEach`; `afterEach` exists to reset.
- Delete assertions the next interaction implies — asserting visible then
  clicking is redundant; the click *is* the assertion. Component tests assert a
  link's `href`; destinations are e2e's job.
- Test names: lowercase, third-person, verb-first, never "should" —
  `'returns the user by id'` names the intention, not the mechanism.
  (Coverage thresholds are gated out by config-traps — coverage is a map, not
  a target.)

## 7. Known-unverified

A confidence ledger: claims marked verified-by-execution, verified-by-docs, or
unverified — dated. Correct past entries rather than deleting them. It exists
because **execution outranks documentation on this stack**: peer-dep ranges
lie, "removed" APIs live, "moved" APIs hard-error — eight documented claims in
the source material were contradicted by actually running the packages.
Smoke-run before encoding any version claim as a rule.

[FILL: start the ledger with the port's own claims]
