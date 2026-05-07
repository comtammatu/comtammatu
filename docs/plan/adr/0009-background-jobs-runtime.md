# ADR-0009: Background Jobs Runtime

Status: proposed
Date: 2026-05-07 (adopted from matu-superapp 2026-05-06)
Decision owner: Tech Lead + Owner

## Context

Several P0 surfaces require durable background work that must not be tied to a user request lifecycle:

- Payment webhook reconcile (provider sometimes retries hours later).
- HĐĐT signing / replace / stuck-state recovery (provider may take seconds to minutes).
- Receipt print retry queue.
- Branch Hub outbox flush when internet returns after offline window.
- Period-close housekeeping, materialized view refresh, daily revenue rollups.
- Provider credential rotation reminders, branch heartbeat alerts.

comtammatu currently uses ad-hoc PostgreSQL `pg_cron` jobs and Vercel cron for some flows. There is no unified queue substrate. This blocks W1 implementation owners (Tech Lead) because it changes RPC contracts and the DDL of `jobs` schema.

## Decision

Adopt a **layered background work model** built on Postgres-native primitives, with Supabase-managed runtimes for execution:

| Layer | Choice | Use case |
|---|---|---|
| Queue substrate | **Supabase Queues (PGMQ)** in the `jobs` schema | Durable FIFO queues per work type (payment webhook reconcile, HĐĐT, print retry, hub outbox flush, audit redact) |
| Scheduler | **Supabase pg_cron** | Time-based triggers (daily rollup, MV refresh, stuck-state scans, heartbeat alerts) |
| Short async work | **Supabase Edge Functions** with background-task primitive | Provider HTTP calls, signature verification, redacted audit writes |
| Escape hatch | **Self-hosted Node worker** consuming the same PGMQ queues | Long-running jobs (>5 min), heavy CPU, or anything that hits Edge Function limits |

The escape-hatch worker is **planned but not built in W1**. It is added when an Edge Function limit (CPU, runtime, memory, or rate) is observed in operations. The queue substrate is the same in both modes, so adopting the worker is a deployment change, not a schema change.

## Why This Layering

- **PGMQ keeps queues inside Postgres** — same backup/restore, same RLS-adjacent visibility, no extra service to operate or pay for at pilot scale.
- **pg_cron is the right tool for scheduled tasks** — visible inside the DB, no Vercel-Cron coupling, no "where is the cron defined?" mystery.
- **Edge Functions are the right runtime for short HTTP calls** — they can verify webhook signatures, call MISA/VietQR, redact and write to `audit_logs`, without spinning up a worker process.
- **A self-hosted worker stays available as an escape hatch** — Edge Function 5-minute and CPU limits will eventually bite when reconcile windows widen or HĐĐT batches grow. We do not commit to a vendor like Inngest/Trigger.dev/QStash for pilot scale because PGMQ already provides durable queueing.
- **No commitment to Vercel Cron** — the back-office web app may run on Vercel, but cron logic lives in Postgres so swapping hosts later is cheap.

## Job Schema Outline

The `jobs` schema is reserved for queue and run state. RLS revokes direct access from `authenticated`; only `SECURITY DEFINER` RPCs and the worker role read/write.

| Table | Purpose |
|---|---|
| `jobs.outbox_events` | High-level outbox row enqueued at the same transaction as the business write (payment commit, refund, HĐĐT issue). Worker drains and dispatches to the right queue. |
| `jobs.job_runs` | Audit of each scheduled or queue-consumed run: queue, started_at, finished_at, attempt, result, error fingerprint. |
| `jobs.dead_letters` | Permanently failed jobs after retry budget exhausted; require operator review. |
| `jobs.cron_definitions` (view over `cron.job`) | Read-only listing of pg_cron jobs for ops dashboards. |

PGMQ queue names (initial set):

- `payments_webhook_reconcile`
- `hddt_signing`
- `hddt_reconcile_stuck`
- `print_retry`
- `hub_outbox_flush`
- `audit_redaction`

Each queue is created in the W1 baseline migration with a documented retry policy and visibility timeout.

## Idempotency And Retry

- Every job consumer must be idempotent. Producers attach an `idempotency_key`; consumers `INSERT … ON CONFLICT DO NOTHING` into a per-work-type idempotency table (e.g., `webhook_events`, `print_jobs`) before performing side effects.
- Retry budgets are explicit per queue; exhaustion moves the job to `jobs.dead_letters` and creates an operator-visible notification.
- No queue consumer assumes "this is the first time I see this message". Replay is normal.

## Rate Limit, Auth, And Secrets

- Provider calls run in Edge Functions with secrets read from `private.provider_secrets` via the service role. Worker (when added) uses the same path.
- ADR-0013 fail-closed/fail-open policy applies to job-driven provider calls just as it applies to user-driven calls (renumbered from matu-superapp ADR-0003).
- Audit writes from job consumers redact via `redactCredentials()` (regression `AUDIT-CREDENTIAL-ALLOWLIST`).

## Alternatives Considered

| Alternative | Assessment |
|---|---|
| Vercel Cron + Route Handlers only | Rejected as primary: ties scheduling to the web host; per-route 60s timeout; opaque if Vercel is replaced |
| Self-hosted worker only | Rejected for pilot: extra service to deploy/monitor before it's needed. Kept as escape hatch |
| Inngest / Trigger.dev / QStash | Rejected for pilot: vendor lock-in and cost without solving anything PGMQ does not. May revisit if multi-region or fan-out demands appear |
| pg_cron only (no queue) | Rejected: cron alone cannot model retry/idempotency cleanly for webhook-driven work |
| Edge Functions only (no queue) | Rejected: Edge functions cannot durably hold work across restarts; queue is mandatory |

## Consequences

- W1 baseline migration creates the `jobs` schema, PGMQ queues, and pg_cron entries listed above.
- Edge Function deployment becomes part of the W1/W2 setup (not a post-pilot afterthought).
- The Tech Lead owns a runbook entry for "queue depth alert", "dead-letter triage", and "Edge Function quota check" before canary.
- Adding the self-hosted worker later does not require any schema change — only a new consumer pointed at the same queues.
- comtammatu's existing pg_cron jobs (e.g., `refresh_finance_views`) absorb into this layered model via `jobs.cron_definitions` view.

## Acceptance Gates

- `jobs` schema, queue list, and pg_cron entries enumerated in `docs/architecture/schema.md` and `supabase/migrations`.
- One end-to-end smoke: a payment webhook arrives → enqueues to `payments_webhook_reconcile` → Edge Function consumes → writes redacted audit row → marks payment processed.
- `jobs.dead_letters` triage UI stub exists in back-office web (`apps/web`); link to operator runbook is acceptable for W1.
- Operator runbook covers queue depth thresholds, retry budgets, and dead-letter handling.
- Branch Hub outbox flush job covers the offline-then-online recovery path from ADR-0007.

## Forward Pointers

- `docs/architecture/schema.md` and `docs/architecture/schema-p0-ddl.md` for table shapes (extend with `jobs.outbox_events`, `jobs.job_runs`, `jobs.dead_letters` in the same W1 baseline).
- ADR-0013: rate-limit fallback policy applies to provider calls invoked from queue consumers (renumbered from matu-superapp ADR-0003).
- ADR-0007: Hub outbox flush is one of the queues defined here.
