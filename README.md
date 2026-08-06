# skills

Two Claude Code skills that form one pipeline: an idea becomes a clickable
prototype, and the prototype becomes a deployed Cloudflare + Neon app — with
the judgment work confined to design dialogue and a feature-mapping loop, and
everything on either side of it scripted, gated, and execution-verified.

Distilled from the pantogen reboot and its port; built 2026-08-06.

## Setup

```sh
ln -s ~/workspace/skills/prototyping      ~/.claude/skills/prototyping
ln -s ~/workspace/skills/production-port  ~/.claude/skills/production-port
```

## The pipeline

1. **`prototyping/`** — design dialogue fills level docs (intent → invariants →
   object model), then a scaffold creates a React Router 8 **SPA-mode** app
   (the production framework, minus the server): fixtures with accessors, a
   pure reducer with replay-checked host, a walkthrough harness for working
   memory, flow tests locked as the user approves flows, and a 16-rule gate on
   every commit. Exit: `git tag prototype`, strip the harness. The repo then
   retires as the frozen specification.
2. **`production-port/`** — the app starts as a copy of
   `assets/cloudflare-neon-prod-spanning-template/`: a complete, CI-green,
   once-deployed walking skeleton (ADR-0013) where every convention — schema
   shape, shared seeder, wide-event logging, error taxonomy, owner-scoped
   auth, the AI one-door, 20 mutation-proven gates — is exercised by one
   exemplar entity. `scripts/port-from-prototype.mjs` carries the prototype's
   docs and fixtures into place and stages the rest in `_port/`; the mapping
   loop moves one feature at a time onto the exemplar's patterns;
   `port:status` says when it's done (staging empty, exemplar deleted, the
   prototype's locked flows green against production).

## House rules

- **No gate ships without a demonstration that it fails** (`verify:gates`
  plants a violation per rule) — and no pattern ships without an executing
  example in the template.
- **Fixes flow up**: a bug found in any prototype or app is fixed in the
  skill's copy, so every future project inherits it.
- **Shared runtime files are byte-identical across both templates** — 
  `production-port/assets/check-parity.mjs` lists and verifies the pairs; run
  it after touching any of them.
- **Template identities are sentinel-guarded**: `rename-app.mjs` clears them;
  config-traps fails anywhere outside this repo until it has run.

## Layout

```
prototyping/
  SKILL.md              the process (phases, checkpoints, gates table)
  references/           flow-tests, walk-critique
  assets/               scaffold.sh, gate.mjs, strip-harness.mjs, template/, docs/
production-port/
  SKILL.md              the port (template start, mapping loop, environments)
  references/           architecture, environments, testing, react-patterns, docs-system
  assets/
    cloudflare-neon-prod-spanning-template/   the walking skeleton (see its README)
    adr-seed → docs/    13 pre-accepted ADRs every app inherits
    configs/, scripts/  the divergence path (scaffold-prod.sh) + shared tooling
    check-parity.mjs    cross-template byte-identity guard
```

The reference deployment (the template's own live proof):
`spanning-template.jlelonmitchell.workers.dev` + Neon `spanning-template`.
The playbook masters this distills from live at `~/workspace/epic-*.md`;
`check-llmstxt-spec.mjs` pins both them and llmstxt.org.
