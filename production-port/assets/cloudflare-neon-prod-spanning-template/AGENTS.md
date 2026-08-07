# AGENTS.md — [FILL: app name]

Always-loaded rules file. It may RESTATE a fact from any doc level; it may not
ORIGINATE one — a fact stated only here has no home that constrains it. Rules
live here one line each; the owning doc carries the reasoning.

## 0. Where to look

**`llms.txt` is the entry point** — one line per doc, with its level and scope.
Start there, not here.

This file does not outrank anything. It restates; it never originates, and a
fact that lives only here has no doc constraining it. When it disagrees with a
doc, the doc wins and this file is stale — an always-loaded file that could
override `decisions/` would be a way to overturn an immutable ADR by editing a
convenience copy of it.

Reasoning lives in the owning doc: `docs/decisions/` for what was decided and
why, `docs/reference/` for what is currently true, `docs/design/` for how it
should behave, `docs/conventions/documentation.md` for how the docs work.

## 1. Stack

<!-- stack-index:start -->
Generated from package.json by export-stack.mjs — do not hand-edit.

| package | version | kind |
| --- | --- | --- |
| @anthropic-ai/sdk | 0.115.0 | runtime |
| drizzle-orm | 0.45.2 | runtime |
| isbot | 5.1.32 | runtime |
| pg | 8.22.0 | runtime |
| react | 19.2.8 | runtime |
| react-dom | 19.2.8 | runtime |
| react-router | 8.3.0 | runtime |
| @ast-grep/cli | ^0.45.0 | dev |
| @biomejs/biome | ^2.5.7 | dev |
| @cloudflare/vite-plugin | 1.50.0 | dev |
| @cloudflare/workers-types | 5.20260801.1 | dev |
| @playwright/test | 1.62.1 | dev |
| @react-router/dev | 8.3.0 | dev |
| @tailwindcss/postcss | ^4.3.3 | dev |
| @types/node | 24.10.1 | dev |
| @types/pg | 8.20.3 | dev |
| @types/react | 19.2.18 | dev |
| @types/react-dom | 19.2.4 | dev |
| dependency-cruiser | ^18.1.1 | dev |
| drizzle-kit | 0.31.10 | dev |
| knip | ^6.32.0 | dev |
| lefthook | ^2.1.10 | dev |
| oxlint | ^1.77.0 | dev |
| tailwindcss | 4.3.3 | dev |
| typescript | 5.9.3 | dev |
| vite | 8.2.0 | dev |
| vitest | ^4.1.10 | dev |
| wrangler | 4.118.0 | dev |
<!-- stack-index:end -->

## 2. Divergences from the seed

Every ADR that supersedes a seed decision — this app departing from what it
inherited. Generated from the `Supersedes:` edges; run `npm run docs:adr-graph`.

<!-- divergences:start -->
| seed decision | replaced by |
| --- | --- |
| ADR-0009 (traces) | ADR-0016 — Observability depth: logs answer "what happened", traces "what was slow" |
| ADR-0011 (release) | ADR-0020 — Release mechanics: a deploy you can preview, split, and undo |
| ADR-0006 (integration-runtime) | ADR-0021 — Runtime parity: the integration tier runs in workerd, against the production build |
| ADR-0001 (ai-gateway) | ADR-0022 — Model access: the seam is decided, the route to the model is not |
<!-- divergences:end -->

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
- **`drizzle-kit generate` on a RENAME prompts, and its default answer destroys
  data.** It cannot tell a rename from a drop-plus-add, so it asks — and the
  pre-highlighted option is "create table", which emits DROP + CREATE. Move the
  selection to the rename line before answering. The prompt needs a TTY, not a
  human: drive it from a pty (`pty.spawn`, `expect`) if you are not one. Without
  a TTY it throws, the throw is swallowed, and it exits 0 having written nothing.
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
