# Cloudflare primitives — what each one is for

> **Kind:** reference · **Status:** accepted · **Updated:** 2026-08-07
> **Level:** 4 — mechanism
> **Constrained by:** `../decisions/0001-cloudflare-for-everything-that-runs-neon-for-eve.md`
> **Scope:** what each primitive is, when to reach for it, when not to, and the
> numbers that decide. The DECISIONS about how to choose live in the ADRs that
> cite this file; this is the lookup table, and it moves when Cloudflare moves.

The ADRs decide *how to choose* (ADR-0014 storage, ADR-0015 deferred work,
ADR-0016 observability, ADR-0022 models, ADR-0023 edge). This file is the
lookup table behind them: what each primitive is, the condition that should make
you reach for it, the condition that should stop you, and the numbers that
actually decide.

**Read the numbers as dated, not fixed.** Limits and prices here were verified
2026-08-07. Where a figure decides an architecture, re-verify it against the
linked doc before committing.

**The framing throughout:** the default stack is Neon Postgres behind Hyperdrive
(ADR-0001). Every primitive below earns its place only by doing something
Postgres-behind-Hyperdrive cannot.

---

## Storage and state

### Hyperdrive — *in use*
Regional connection pool + read cache in front of an existing Postgres/MySQL, so
Workers reuse warm connections instead of paying TCP+TLS+auth per request.

- **Reach for it:** any Worker → external Postgres (this stack); capping origin
  connections; free read-caching on hot repeated queries.
- **Don't:** expecting it to fix *per-query* latency — it shortens the
  handshake, not the geographic round trip (that is placement, ADR-0019);
  write-heavy paths (nothing is cached); reads that must be fresh — run a second
  `caching-disabled` config for auth and post-write reads.
- **Numbers:** free on Free and Paid. 10 configs free / 25 paid. ~20 origin
  connections free / ~100 paid. Query max 60s. Cached response max 50 MB. Cache
  `max_age` default 60s, **max 1 hour**. Free plan caps at 100k queries/day;
  Paid is unlimited within the $5/mo minimum. `NOW()`/`RANDOM()` never cached.
- [Docs](https://developers.cloudflare.com/hyperdrive/) ·
  [Caching](https://developers.cloudflare.com/hyperdrive/configuration/query-caching/) ·
  [Limits](https://developers.cloudflare.com/hyperdrive/platform/limits/) ·
  [Get started](https://developers.cloudflare.com/hyperdrive/get-started/)

### Workers KV
Eventually-consistent global key-value store, cached at every edge location.

- **Reach for it:** a value read on nearly every SSR request and written rarely
  — feature flags, routing/redirect maps, tenant config; avoiding a Neon round
  trip on the hot path.
- **Don't:** when you need read-your-writes — **the failure mode is a user
  saving a setting and still seeing the old value**; frequently-written keys
  (**1 write/sec per key**); querying by anything but the exact key.
- **Numbers:** value 25 MiB, key 512 B. Up to **60s+** global propagation;
  negative lookups cached too. Free: 100k reads + 1k writes/day, 1 GB. Paid:
  unlimited.
- [Docs](https://developers.cloudflare.com/kv/) ·
  [How it works](https://developers.cloudflare.com/kv/concepts/how-kv-works/) ·
  [Limits](https://developers.cloudflare.com/kv/platform/limits/)

### R2
S3-compatible object storage with zero egress fees.

- **Reach for it:** user uploads, generated exports/PDFs/video; a Postgres row
  holding the *key* while R2 holds the bytes.
- **Don't:** when you need to query contents (prefix-list only); small hot
  objects mutated per request (1 write/sec per key); when you need a
  transaction with your Postgres write — **there is none, so write blob first,
  row second**: an orphaned object is garbage, an orphaned row is a 500.
- **Numbers:** object max 5 TiB; single-part 5 GiB; key 1,024 B. **Egress $0.**
  Standard $0.015/GB-mo, Class A $4.50/M, Class B $0.36/M. Free: 10 GB-mo, 1M
  Class A, 10M Class B.
- [Get started](https://developers.cloudflare.com/r2/get-started/) ·
  [Limits](https://developers.cloudflare.com/r2/platform/limits/) ·
  [Pricing](https://developers.cloudflare.com/r2/pricing/)

### Durable Objects
Single-threaded, globally-unique addressable compute + strongly-consistent
embedded SQLite. **Coordination, not storage.**

- **Reach for it:** WebSockets, presence, collaborative editing; serialized
  access to a contended resource (seat booking, inventory, idempotency lock);
  per-entity alarms (ADR-0015); the Agents SDK is one underneath.
- **Don't:** when data must be queried *across* objects — no cross-DO query, and
  the failure mode is fan-out code that re-implements a JOIN badly; a single
  "global" DO (**~1,000 req/s soft per object** — it will throttle); working
  set over 10 GB/object.
- **Numbers:** 10 GB SQLite per object. Strongly consistent; writes with no
  intervening `await` commit atomically. CPU 30s default → 5 min. Free: 100k
  req/day. Paid: $0.15/M requests, $12.50/M GB-s, $0.20/GB-mo.
- **2026:** new namespaces are **SQLite-only**; the `exports` field replaces
  imperative `migrations` (mutually exclusive — a config with both is rejected);
  `us` jurisdiction added alongside `eu`/`fedramp`. **Facets** (isolated SQLite
  per dynamically-created child DO) are **open beta under Dynamic Workers**,
  require Workers Paid, and are aimed at giving AI-generated code storage — not
  a conventional SSR app.
- [Get started](https://developers.cloudflare.com/durable-objects/get-started/) ·
  [Storage API](https://developers.cloudflare.com/durable-objects/api/storage-api/) ·
  [Limits](https://developers.cloudflare.com/durable-objects/platform/limits/) ·
  [Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) ·
  [`exports`](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/) ·
  [Facets](https://developers.cloudflare.com/dynamic-workers/usage/durable-object-facets/)

### D1
Managed serverless SQLite with optional read replicas.

- **Reach for it:** rarely, given Neon. Legitimate: a small isolated dataset
  kept out of the primary DB; a second service not worth a Neon project.
- **Don't:** alongside Postgres in the same app — two SQL stores, two migration
  systems, no cross-store transaction; anything approaching **10 GB** (hard cap);
  when you need `jsonb` operators, extensions, or real concurrency.
- **Numbers:** 10 GB/DB paid, 500 MB free. Row/BLOB 2 MB. 1,000 queries per
  Worker invocation paid / 50 free. Read replication is in production and free,
  but **only active via the Sessions API**.
- [Docs](https://developers.cloudflare.com/d1/) ·
  [Limits](https://developers.cloudflare.com/d1/platform/limits/) ·
  [Read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/)

### Cache API
Programmatic access to the per-colo CDN cache, keyed by Request, holding
Responses.

- **Reach for it:** caching a whole SSR HTML or JSON response *by URL* — the
  thing KV cannot do; `Cache-Tag` purge on generated responses.
- **Don't:** **any owner-scoped response** (see ADR-0023 — serving one owner's
  page to another is the worst bug here); expecting global reach — it is
  **per data centre**, so hit rates are poor on low-traffic apps; responses with
  `Set-Cookie` (never cached); on `workers.dev` or behind Access (no effect).
- **Numbers:** `caches.default` or `caches.open()`. `put()` returns **413** if
  too large; cacheable ceiling 512 MB Free/Pro/Business. No separate charge.
- [Docs](https://developers.cloudflare.com/workers/runtime-apis/cache/) ·
  [Example](https://developers.cloudflare.com/workers/examples/cache-api/)

### Vectorize
Distributed vector database for approximate nearest-neighbour search.

- **Reach for it:** semantic search / RAG without running `pgvector`; ANN served
  without a Neon round trip.
- **Don't:** embeddings over **1536 dimensions** (hard cap — rules out
  `text-embedding-3-large` at full width); when you need the vector search
  *joined* to relational data in one query — it returns IDs + ≤10 KiB metadata,
  so a second Neon call always follows. **If that second hop dominates,
  `pgvector` is strictly simpler** (ADR-0014).
- **Numbers:** 1536 dims max; 20M vectors/index; query returns ≤50 results with
  metadata. Free: 30M queried + 5M stored dimensions/mo.
- [Docs](https://developers.cloudflare.com/vectorize/) ·
  [Limits](https://developers.cloudflare.com/vectorize/platform/limits/)

### Analytics Engine
Write-only, unlimited-cardinality time-series sink with a SQL query API.
**Sampled, not exact.**

- **Reach for it:** per-request/per-tenant instrumentation without writing rows
  to Neon; high-cardinality dimensions that would bloat an analytics table.
- **Don't:** when you need exact counts — **the failure mode is billing or quota
  logic built on numbers that are statistically right and individually wrong**;
  retention beyond 90 days; anything needing update or delete.
- **Numbers:** 20 blobs, 20 doubles, **1 index** per data point; ≤250
  `writeDataPoint()` per invocation; retention 3 months. Published price sheet
  exists but **billing is not yet enabled**.
- [Docs](https://developers.cloudflare.com/analytics/analytics-engine/) ·
  [Limits](https://developers.cloudflare.com/analytics/analytics-engine/limits/)

---

## Deferred and background work

See ADR-0015 for the ladder. The question that picks the rung: *does anyone
notice if this silently didn't happen?*

### `ctx.waitUntil` — *plumbed, never called*
Keeps a promise running after the response returns.

- **Reach for it:** analytics pings, Cache API writes, `last_seen_at` touches.
- **Don't:** when the work must actually happen — **no retry, no persistence,
  no dead-letter**; over 30s; to keep a Durable Object alive (documented
  anti-pattern).
- **Numbers:** **30s wall clock shared across all `waitUntil` calls in the
  request**; unfinished tasks are cancelled. No extra cost.
- [Docs](https://developers.cloudflare.com/workers/runtime-apis/context/)

### Queues
At-least-once message queue with push consumers, batching, retries, DLQ.

- **Reach for it:** work that must survive a failed request; batching writes to
  smooth Hyperdrive/Neon connection pressure; absorbing bursts against a flaky
  third-party API.
- **Don't:** when you need ordering or exactly-once — **consumers must be
  idempotent** (unique message ID as primary key is the documented pattern); a
  job over 15 min.
- **Numbers:** 128 KB/message; 100 msgs/batch; 100 retries; 250 concurrent
  consumer invocations; 15 min consumer wall clock; backlog 25 GB. Free 10k
  ops/day, Paid 1M ops/mo then $0.40/M (an op = 64 KB written/read/deleted, so
  ~3 per message).
- [Docs](https://developers.cloudflare.com/queues/) ·
  [Delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/) ·
  [Limits](https://developers.cloudflare.com/queues/platform/limits/)

### Workflows
Durable execution — each step's result persisted and independently retried.

- **Reach for it:** ordered steps with distinct failure modes (charge →
  provision → email); waiting on human approval or a webhook without holding a
  connection; `step.sleep` for days.
- **Don't:** a single idempotent unit of work (Queues is cheaper and simpler);
  high-throughput fan-out of tiny jobs (steps are billed and capped);
  sub-second latency needs.
- **Numbers:** 10,000 steps default → 25,000; `step.sleep` up to **365 days**;
  1 MiB per step result; **50,000 concurrent instances, 300 new/sec**. Idle
  workflows incur no CPU. Billing for steps and storage starts **no earlier
  than 2026-08-10** — Cloudflare's wording is a floor, not a commitment, so
  confirm it has actually begun before pricing anything on it. Included:
  Paid **500,000 steps/month + 1 GB-month** storage, then **$0.80 per 100k
  steps**; Free **3,000 steps/day + 1 GB-month**, with no charge past it. The
  included allowance is the number that decides whether a design is affordable
  — the per-step price alone makes Workflows look costlier than it is.
- **2026:** the V2 control-plane rearchitecture raised concurrency 4,500 →
  50,000; pre-2026 "Workflows doesn't scale for fan-out" advice is obsolete.
- [Docs](https://developers.cloudflare.com/workflows/) ·
  [Limits](https://developers.cloudflare.com/workflows/reference/limits/) ·
  [Pricing](https://developers.cloudflare.com/workflows/reference/pricing/) ·
  [Examples](https://developers.cloudflare.com/workflows/examples/)

### Cron Triggers
A cron expression bound to a `scheduled()` handler.

- **Reach for it:** time-based work over a set — nightly rollups, expiring
  sessions, digests. If you'd write `SELECT … WHERE due_at < now()`, it's this.
- **Don't:** per-entity precision ("remind *this* user in 37 minutes" — that's a
  DO alarm); exact-time firing (config propagation up to 15 min, execution
  best-effort); jobs over 15 min.
- **Numbers:** 1-minute granularity. **5 triggers/account Free, 250 Paid.** Wall
  clock 15 min. CPU on Paid: 30s for intervals <1 hour, **15 min for intervals
  ≥1 hour** — schedule heavy sweeps hourly or slower to get the larger budget.
- [Docs](https://developers.cloudflare.com/workers/configuration/cron-triggers/) ·
  [Example](https://developers.cloudflare.com/workers/examples/cron-trigger/)

### Durable Object alarms
One per-object wake-up timer invoking `alarm()`.

- **Reach for it:** per-entity scheduling at arbitrary times; a debounce timer a
  later write can push forward (re-calling `setAlarm` overwrites); when you
  already have a DO for other reasons.
- **Don't:** when you need many independent timers on one object — **one alarm
  per DO, full stop**; when the retry budget matters (**6 retries**, then
  dropped — re-arm it yourself for indefinite retry); when you don't otherwise
  need a DO (a cron sweep is far less machinery).
- [Docs](https://developers.cloudflare.com/durable-objects/api/alarms/) ·
  [Example](https://developers.cloudflare.com/durable-objects/examples/alarms-api/)

### Containers / Sandboxes
Both GA April 2026; Sandboxes are built *on* Containers. **Not an
infrastructure choice — an abstraction and threat-model choice.**

- **Containers when:** you wrote the code and need a runtime Workers lacks
  (ffmpeg, pandoc, a Python ML lib), or you're lifting an existing Dockerfile.
- **Sandboxes when:** you did *not* write the code — AI-generated or
  user-submitted. Adds session isolation, a stateful code interpreter, PTY,
  preview URLs, and **Outbound Workers** (egress proxy that injects credentials
  the sandboxed code can never read).
- **Don't:** either, for an SSR CRUD app. Both need Workers Paid and add real
  operational surface.
- **Numbers:** `lite` (1/16 vCPU, 256 MiB) → `standard-4` (4 vCPU, 12 GiB).
  Active-CPU pricing; charges stop when idle.
- [Containers](https://developers.cloudflare.com/containers/) ·
  [Sandbox](https://developers.cloudflare.com/sandbox/) ·
  [Container pricing](https://developers.cloudflare.com/containers/pricing/)

### Browser Run *(renamed from Browser Rendering, 2026-04-15)*
Headless Chrome via Puppeteer/Playwright/CDP bindings, or stateless HTTP Quick
Actions for screenshots/PDFs/scrape.

- **Reach for it:** server-rendered PDFs or OG images from your own HTML;
  scraping sites that need JS; smoke tests against a deployed app.
- **Don't:** when fetch + parse would do — **the most expensive primitive here
  per unit of work**; sessions over 10 min. Always `browser.close()` in a
  `finally` — leaked browsers burn the quota.
- **Numbers:** Free 10 min/day, 3 concurrent. Paid: 10 browser hours/mo included
  then $0.09/hr; **120 concurrent**; 60s timeout extendable to 10 min.
- [Docs](https://developers.cloudflare.com/browser-run/) ·
  [Limits](https://developers.cloudflare.com/browser-run/limits/) ·
  [Pricing](https://developers.cloudflare.com/browser-run/pricing/)

### Email Service *(routing + sending; docs moved from `/email-routing/`)*
Inbound routing to an `email()` handler; outbound transactional send via an
`EMAIL` binding or REST.

- **Reach for it:** inbound mail triggering app logic (ticket ingestion,
  reply-to-comment) — unrestricted and genuinely useful; internal/ops
  notifications.
- **Don't:** user-facing signup/reset flows yet — **Sending is Beta, Workers
  Paid only, and recipients must be verified destination addresses**
  (`E_RECIPIENT_NOT_ALLOWED` otherwise), which rules out most real signup flows
  until limits are raised; marketing/bulk campaigns.
- **Numbers:** 5 MiB/message; 50 recipients across to/cc/bcc; 200 verified
  destinations/account. Routing is free on all plans.
- [Docs](https://developers.cloudflare.com/email-service/) ·
  [Send from Workers](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/) ·
  [Limits](https://developers.cloudflare.com/email-service/platform/limits/)

---

## Observability

See ADR-0016 for the layering rule.

**Config shape**, from wrangler's own `config-schema.json` (the docs reference
page is stale — it documents only the two top-level keys). `logs` and `traces`
are independent sub-blocks; `destinations` is **per-signal**, an array of
dashboard destination *names*:

```jsonc
"observability": {
  "enabled": true,               // legacy top-level; today enables LOGS ONLY
  "head_sampling_rate": 1,
  "logs": {
    "enabled": true,
    "head_sampling_rate": 0.6,
    "invocation_logs": false,    // drop the per-invocation event (logs only)
    "persist": true,             // false = export without paying for storage
    "destinations": ["my-otlp-destination"]
  },
  "traces": {
    "enabled": true,
    "head_sampling_rate": 0.05,
    "persist": true,
    "destinations": ["my-otlp-destination"]
  }
}
```

`observability` **inherits** into `env.*` blocks (verified by building both and
diffing) — unlike `vars` and bindings, which do not.

| Primitive | For | Note |
|---|---|---|
| **Workers Logs** | the wide event (ADR-0009); what happened | 256 KB/line truncates; bills per event |
| **`upload_source_maps`** | stack traces resolving to TypeScript | free; always on |
| **Traces** (automatic) | which binding call or subrequest was slow | spans for bindings, subrequests, handlers, no code change |
| **Custom spans** | timing *inside* one long operation | `enterSpan()` auto-ends; `startActiveSpan()` needs `span.end()` (2026-07-28) |
| **OTLP export** | correlation off-platform, alerting/paging | `logs.destinations` / `traces.destinations`; **Paid only** |
| **Tail Worker** | transforming/routing every invocation | declined in ADR-0009; docs now steer new integrations to OTLP. Billed by **CPU time**, fires per invocation (not batched) |
| **Logpush** | retention beyond the platform window | declined unless compliance requires it; needs `"logpush": true` **and** a separately created job |

**The date that matters: billing starts 2026-10-01**, for two separate meters.
Dashboard storage bills at **$0.60/M events** on the quota shared with Workers
Logs; OTLP **export** bills at **$0.05/M** on its own allowance. `persist: false`
pays only the cheap one. The included allowance is **10M events/month per data
type** — logs and traces each get their own 10M, which is the reading the
earlier "10M or 20M?" ambiguity was groping at: the 20M figure is the two
allowances summed, not one pooled quota. Free plan: **200k events/day**, and
**no OTLP export at all** — export is Paid-only, so `persist: false` is not a
Free-plan cost lever, it is a way to lose your telemetry.

**The lever, when the bill arrives.** ADR-0016 rules out lowering the log head
rate and names tail sampling behind an OTLP sink as the upgrade. That upgrade
is these keys: add a dashboard destination, point `traces.destinations` at it,
and set `traces.persist: false` — spans reach your sink and stop accruing the
$0.60/M dashboard meter, leaving the $0.05/M export meter. `persist: false`
without a `destinations` entry discards the signal rather than saving money,
so the destination is not optional.

**`observability.enabled: true` enables logs only.** Traces require
`traces.enabled` explicitly. A future `compatibility_date` will make `enabled`
imply traces — so a routine compat bump could start billing spans on a
logs-only Worker unless the `traces` key is declared explicitly either way.

**Two trace limitations:** non-I/O spans report **0 ms** (Spectre mitigations
stop the clock advancing without I/O — traces measure waiting, not computing),
and trace IDs are **not propagated to external services** yet, so a Worker span
arrives at your provider unparented. Span/attribute names are still unstable.

**Source maps** de-minify traces *after* the invocation — they are explicitly
**not accessible inside the Worker at runtime**, so `console.log(err.stack)`
still prints minified frames. Max 15 MB gzipped.

- [Observability](https://developers.cloudflare.com/workers/observability/) ·
  [Traces](https://developers.cloudflare.com/workers/observability/traces/) ·
  [Exporting OTel](https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/)

---

## AI

See ADR-0022. The seam (`src/lib/ai/`) is decided; this is the route behind it.

### Provider SDK direct — *in use*
- **Numbers:** provider list price, no Cloudflare markup. Needs
  `compatibility_flags: ["nodejs_compat"]` for most vendor SDKs. Subrequests
  **50/invocation Free, 1,000 Paid** (raisable via `limits.subrequests`). CPU
  configurable to 300,000 ms — that's CPU, not wall time, so waiting on the model
  API is not the binding constraint.
- **Gives up:** caching, retries, fallback, and any spend number.

### AI Gateway — *recommended next step*
Proxy in front of any provider: caching, rate limiting, retries, fallback,
logging, cost tracking. **Roughly a base-URL change inside the seam.**
- **Don't:** requests over **25 MB** are not cacheable (large multimodal payloads
  silently miss); Unified Billing adds a **200 req/60s per gateway** cap.
- **Numbers:** 10 gateways/account Free, 20 Paid. Cache TTL max 1 month. Logs
  10M/gateway Paid, 100k/account Free; 10 MB per log. Unified billing lets
  prepaid credits pay for Workers AI too, and raises frontier-model limits
  20 → 50 rpm.
- [Docs](https://developers.cloudflare.com/ai-gateway/) ·
  [Limits](https://developers.cloudflare.com/ai-gateway/reference/limits/) ·
  [Workers AI provider](https://developers.cloudflare.com/ai-gateway/usage/providers/workersai/)

### Workers AI
Open models on Cloudflare GPUs via an `AI` binding, billed in Neurons.
- **Reach for it:** embeddings colocated with your data; classification; ASR;
  cost-sensitive bulk work.
- **Don't:** as a frontier-model substitute — it is a **capability** decision,
  not a hosting one; bursty consumer traffic (**text generation 300 rpm**).
- **Numbers:** **$0.011 per 1,000 Neurons**; **10,000 Neurons/day free** on both
  plans. Embeddings 3,000 rpm. Frontier models 20 rpm (50 with prepaid credits).
- [Docs](https://developers.cloudflare.com/workers-ai/) ·
  [Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) ·
  [Limits](https://developers.cloudflare.com/workers-ai/platform/limits/)

### AI Search — *this is the renamed AutoRAG*
Managed RAG: ingests, chunks, embeds, indexes, and serves hybrid search plus an
MCP endpoint.
- **The old mental model is now wrong.** It no longer runs on *your* Vectorize +
  R2 — it moved to managed infrastructure with storage, indexing and crawl
  included. Instances predating the move may leave an orphaned R2 bucket in your
  account still counting toward storage.
- **Don't:** documents over **4 MB** (rejected); when you need control over
  chunking or embedding model; Free crawling (**500 pages/day**).
- **Numbers:** free during open beta; Workers AI + AI Gateway billed separately.
- [Docs](https://developers.cloudflare.com/ai-search/) ·
  [Limits & pricing](https://developers.cloudflare.com/ai-search/platform/limits-pricing/)

### Agents SDK
Stateful, addressable agent per entity with embedded SQLite, WebSockets,
hibernation.
- **Don't:** for a stateless request/response call — it adds a Durable Object hop
  for nothing. **Agents require Durable Objects** — DO pricing and SQLite storage
  billing are mandatory, not optional.
- [Docs](https://developers.cloudflare.com/agents/) ·
  [API](https://developers.cloudflare.com/agents/api-reference/agents-api/)

---

## Edge request primitives

See ADR-0023.

| Primitive | Reach for it when | Stop when |
|---|---|---|
| **Rate Limiting binding** | a per-key ceiling on abuse or cost — e.g. the `/capture` webhook, which has none | you need accurate counting: limits are **per colo**, and the docs call it "intentionally designed to not be used as an accurate accounting system" |
| **`request.cf`** | country/colo/bot score as wide-event fields — currently unread | you need granular bot scores off Enterprise, or you're in local dev where values are stubbed |
| **Images** | resize/reformat without a pipeline | Free and past 5,000 unique transformations/month — new ones return **error 9422** (a partial outage, not a bill) |
| **Turnstile** | public form input | you skip server-side Siteverify — a client-only integration is trivially bypassed |
| **WAF / Bot Management** | zone-wide protection, changeable without a deploy; a block costs no Worker invocation | the decision needs app state no ruleset field can express |

Details that decide:
- **Rate limiting `simple.period` must be exactly 10 or 60 seconds** — no other
  values. Bindings sharing a `namespace_id` share counters across Workers.
  Requires Wrangler ≥ 4.36.0. Not visible in the dashboard.
- **Bot score `0` means "not computed", not "human"** — range is 1–99 (1 =
  automated, 99 = human). Treating 0 as human is the classic bug. Granular scores
  are Enterprise + Bot Management; other plans get coarse groupings.
- **Images transformations bill per *unique* (source × params) per month**, not
  per delivery — so a high-traffic page with few variants is cheap and a
  low-traffic page with per-user crops is expensive. `.info()` is free.

- [Rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) ·
  [`request.cf`](https://developers.cloudflare.com/workers/runtime-apis/request/) ·
  [Bot score](https://developers.cloudflare.com/bots/concepts/bot-score/) ·
  [Images pricing](https://developers.cloudflare.com/images/pricing/) ·
  [Turnstile Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

---

## Release and platform mechanics

See ADR-0020 (release) and ADR-0019 (placement).

| Mechanism | Purpose |
|---|---|
| `wrangler versions upload` | build a version without serving it; get a preview URL |
| Versioned / aliased preview URLs | look at it before promoting; stable alias per branch |
| Gradual deployments | percentage split with version affinity |
| `wrangler rollback` | undo — **last 100 versions**; creates a new deployment |
| Cloudflare Access on previews | one-click, reusable policies — the fix for a public demo Worker |
| `placement` | Hint for one known single-homed DB; `mode: "smart"` for many/unknown |
| `wrangler check startup` | bundle size + startup CPU (ADR-0017); **measures `./build`** |
| `wrangler types --check` | generated `Env` matches config (ADR-0018) |

- [Versions & deployments](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/) ·
  [Gradual deployments](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/gradual-deployments/) ·
  [Rollbacks](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/) ·
  [Placement](https://developers.cloudflare.com/workers/configuration/placement/)

---

## Deliberately not adopted

**Cloudflare CI Workflows / Artifacts.** CI pipelines defined in TypeScript on
Workflows, with Artifacts (Git-compatible versioned storage) as the source of
truth, plus an AI self-healing example that pushes fixes to a
`ci-autofix/<run-id>` branch. It is **private beta**, needs bindings for
artifacts, workflows, containers, durable objects and R2, and requires moving
repo hosting to Artifacts. Its stated problem — *"CI/CD for millions of repos,
on your platform"* — is a platform vendor's, not this project's, and ADR-0011
already declined auto-deploy on merge.

Worth stealing regardless: pipeline-as-TypeScript, and runners cached by input
hash (`cache: { inputs: ['package.json', 'bun.lock'] }`).

The nearer-term answer to `check.yml`'s own TODO ("add a service container here
when CI coverage earns its keep") is a Postgres service container in GitHub
Actions — not a beta platform migration.

- [CI Workflows announcement](https://blog.cloudflare.com/ci-workflows/) ·
  [Self-healing example](https://github.com/cloudflare/ci/tree/main/examples/self-healing)
