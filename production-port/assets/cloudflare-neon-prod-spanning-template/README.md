# cloudflare-neon-prod-spanning-template

The **walking skeleton** (ADR-0013): every convention of the production stack —
RR8 framework mode on Cloudflare Workers, Neon via Hyperdrive, Drizzle, wide-
event logging, the error taxonomy, owner-scoped auth, the seams, every gate —
exercised by one deliberately boring exemplar entity (`note`) and **execution-
verified**: `npm run check` exits 0, and the template has deployed live
(worker → Hyperdrive → Neon, wide events landing in Workers Logs).

## Starting an app (the port — production-port skill, Phase 1)

```sh
cp -R <skill-dir>/assets/cloudflare-neon-prod-spanning-template my-app
cd my-app && node scripts/rename-app.mjs my-app   # config-traps fails until this runs
npm install && git init && npx lefthook install
cp .dev.vars.example .dev.vars
npm run docs:generate                          # rename-app moved llms.txt/AGENTS.md; regenerate
git add -A && git commit -m "from the production-port template"   # docs-check and the ADR
                                               # immutability gate work off git; with zero
                                               # commits three verify-gates controls cannot fire
npm run db:up && npm run db:migrate && npm run check   # green before you touch anything
node scripts/port-from-prototype.mjs --from ../my-prototype
```

Then the mapping loop the script prints: one prototype feature at a time onto
the exemplar's patterns, `port:status` until staging is empty and the note
exemplar is deleted. The locked flow tests passing against this app is the
port's proof.

Fixes belong in the SKILL's copy of this template — every future app inherits
them. Provisioning (Neon project, Hyperdrive id, secrets): the skill's
`references/environments.md` has the exact commands.
