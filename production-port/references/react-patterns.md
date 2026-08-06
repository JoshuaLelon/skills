# React and fullstack patterns — the read-before-building layer

Distilled from the epic playbooks (masters at `~/workspace/epic-*.md`); the
always-loaded traps live in the AGENTS template. This is the judgment layer —
load when building screens, forms, or auth.

## Component architecture

- **Composition before context.** Solve prop drilling by passing elements as
  children/props first — identical elements returned to React also skip
  re-rendering that subtree for free. Context is the second resort.
- **Colocation is lifting's counterpart.** Keep state at the lowest component
  that needs it, and *push it back down* when the shared requirement
  disappears — the half of the discipline that gets skipped because lifting
  feels like the skill.
- Compound components, slots, prop getters, state reducers, control props are
  **library-author tools**; app code covers its needs with composition + plain
  hooks. Render props and HOCs are absent from the modern pattern set.
- **Effects are only for synchronizing with things outside React** (browser
  APIs, third-party libs, with cleanup). Derived values are calculations in
  render; data fetching has its own tool. The test: not-outside-React ⇒ not an
  effect.
- `useTransition` / `useDeferredValue` are first-line responsiveness tools, and
  `useSyncExternalStore` is ordinary app code for browser APIs — none of them
  are exotic.

## Rules the gates enforce — the judgment around them

- **Memoization is the third resort:** fix the slow render, restructure for
  element identity/composition, and only then `memo`/`useMemo` — after
  profiling a production build. Unmeasured memoization can make things slower.
- `useEffectEvent` (19.2+) replaces the latest-ref pattern — but only call it
  from inside an effect; never in a dep array, never passed down.
- Loud-failure translations (tsc/build already catch these — for orientation,
  not vigilance): RR8 loaders return plain objects (`json()`/`defer()` gone;
  returned promises stream); route types come from generated
  `./+types/<route>`; an explicit `routes.ts` + `react-router.config.ts` must
  exist — and `appDirectory: 'src'` keeps the ported layout, so every gate's
  globs survive (SKILL Phase 1);
  `HydratedRouter` imports from `react-router/dom`. TS 7: `types` defaults to
  `[]` — list ambient `@types` explicitly or they vanish.
- Zod 4 swaps beyond the gated ones: `err.flatten()` → `z.treeifyError(err)`;
  `A.merge(B)` → `A.extend(B.shape)`; `.passthrough()` → `.loose()`;
  `.cuid()` → `.cuid2()` (v1 leaks information). With Conform, import from
  `@conform-to/zod/v4` — the default entry crashes at import on Zod 4.
- Sessions live in HTTP-only cookies backed by server-side records — JWT in
  localStorage is the training-data default and wrong here.

## Forms, validation, uploads

- One Zod schema per form, parsed in the action as the authoritative result,
  reused client-side — never a second validator. Conform 1.x binds it to
  accessible prop getters (field errors wired for screen readers); note
  `getZodConstraint` → `getConstraints` and `.invalid` → `.valid` renames.
- Pending/optimistic UI: prefer the router's `useNavigation`/`useFetcher` state
  for route-bound mutations; React 19 `useOptimistic` is for local-only
  optimism — don't reach for the newer API first.
- File uploads (RR8): `parseFormData` + per-field `uploadHandler` from
  `@remix-run/form-data-parser` + `@remix-run/file-storage`.

## Auth hardening (beyond the AGENTS rules)

- CSRF/bot posture is yours, not the framework's: honeypot fields for bot
  submissions, SameSite cookies for CSRF.
- Route password reset, email change, and 2FA through **one**
  cryptographically-secure verification primitive, not per-feature ad-hoc
  tokens.
- Owning auth is the playbook default (it's application-domain logic); an app
  may still divert to a provider — that's a §2 divergence, written down.

## Prisma 7 runtime gotchas (if Prisma over Drizzle — a §2 divergence)

- Connection URL lives in `prisma.config.ts` (`defineConfig({ datasource })`) —
  a `url` in the schema datasource block is a hard validation error. Generator
  is `provider = "prisma-client"` with mandatory `output`; the client takes an
  explicit driver adapter.
- `file:` URLs resolve cwd-relative, not schema-relative — the mismatch
  presents as "table does not exist" against an empty second database.
- The generated client is TypeScript source (needs tsx/strip-types);
  `$queryRaw` COUNT returns BigInt, which breaks `JSON.stringify`.
