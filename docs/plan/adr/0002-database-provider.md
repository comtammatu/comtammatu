# ADR-0002: Database Provider — Supabase Blue/Green

> **Status:** PROPOSED
> **Date:** 2026-05-05
> **Decider:** Architect → Owner sign-off (B4)
> **Context:** Whole-system rebuild — see `docs/plan/system-rebuild/02-GREEN-BASELINE.md`

---

## Context

Blue project runs on Supabase (managed Postgres + Auth + Storage + Realtime + Edge Functions). The rebuild creates a parallel "green" project. Need to decide:

1. Same Supabase org or new org?
2. Same region or new region?
3. Schema migration tooling?
4. Data migration tooling?
5. Storage migration tooling?
6. Realtime + cron + Edge Functions reconfiguration?

Constraints:
- Vietnam-based business → latency to ap-southeast region preferred.
- Tax/compliance data must remain in-region (data sovereignty per Vietnam Decree 53/2022 if applicable).
- Cost: 2 paid Supabase projects in parallel during rebuild window (3-4 months).
- Team has existing operational fluency with Supabase (CLI, MCP).

---

## Decision

**Create new Supabase project in same org, same region (ap-southeast-1 Singapore), Postgres major version 17+ (latest Supabase supports — currently PG17). No self-hosting.**

Naming convention:
- Blue: `comtammatu` (existing, keep ID — referenced in production env vars)
- Green: `comtammatu-green` (new project, becomes `comtammatu` after blue is renamed `comtammatu-archive`)

Migration tooling:

| Concern | Tool | Pattern |
|---|---|---|
| **Schema** | Hand-written `supabase/migrations-green/0001_green_baseline.sql` | Single squashed baseline. Old blue migrations archived to `supabase/migrations/_archive-2026-05/`. |
| **Schema apply** | `supabase db push --linked` (against green project) | Standard Supabase CLI workflow. |
| **Data — bulk** | `pg_dump --data-only --table=... \| pg_restore` | Per-table, in FK order. |
| **Data — transformed** | Custom Node.js script reading blue → INSERT INTO green via service-role | For tables needing schema reshape (e.g., V1→V2 mapping). |
| **Storage** | `supabase storage cp` (CLI) or `s3cmd sync` against Storage S3 endpoint | Per-bucket parallel transfer. |
| **Auth** | Per ADR-0001 (Admin API import) | |
| **Realtime** | Re-apply `ALTER PUBLICATION supabase_realtime ADD TABLE ...` per green | Replication identity must be set per `20260425024802_realtime_replica_identity_full.sql`. |
| **Cron** | Recreate via `pg_cron.schedule()` in baseline migration | Per audit `queries.sql §11` list. |
| **Edge Functions** | `supabase functions deploy --project-ref <green>` | Per existing `supabase/functions/*` directory. |
| **Secrets** | `supabase secrets set --project-ref <green>` | Per existing `.env.production`. |

---

## Alternatives Considered

### A. Self-host Postgres + Auth (PostgREST + GoTrue self-hosted)
- **Pro**: full control over `GOTRUE_JWT_SECRET` (would solve ADR-0001 password preservation).
- **Con**: 6-8 week ops setup, on-call burden, backup/HA tooling needed, RLS still works but Realtime+Storage need separate stack.
- **Rejected**: opex cost > benefit for current scale (3-7 branches).

### B. New Supabase org + new region (e.g., ap-southeast-2 Sydney)
- **Pro**: organizational isolation between blue (audit) and green (live).
- **Con**: latency adds 50-150ms for VN users (Singapore vs Sydney). POS p95 budget tight (4s SW timeout already).
- **Rejected**: latency hurts cashier experience.

### C. Supabase branch (preview env)
- **Pro**: cheap, sibling of blue.
- **Con**: not a production-grade project; resource limits + isolation insufficient for cutover.
- **Rejected**: not designed for prod traffic.

### D. Squash all migrations in-place (drop + recreate on blue)
- **Pro**: no second project, no data migration.
- **Con**: blue has running prod data; in-place schema rewrite = downtime + impossible rollback.
- **Rejected**: violates blue/green principle (`00-DEBATE-SYNTHESIS.md` A2).

---

## Consequences

### Positive
- Familiar tooling — team already uses Supabase CLI + MCP.
- Same-region keeps latency stable.
- Blue stays read-only audit snapshot for tax/legal retention (B6 = 12 months).
- Cost overlap is bounded (Supabase Pro plan ~$25/project/month × 2 = $50 during rebuild).

### Negative
- 2 projects = 2 dashboards, 2 secret stores, 2 CI configs to maintain during cutover window.
- `supabase migration list --linked` must be aware of which project — dev environment confusion risk.
- Storage transfer cost: bucket size × egress × ingress. Estimate via `queries.sql §6`.
- Edge Functions deployed twice during overlap.

### Mitigations

| Risk | Mitigation |
|---|---|
| Dev env points to wrong project | New `.env.green` + `.env.blue` distinct files; CI matrix tags. Pre-commit hook blocks `supabase` commands without explicit `--project-ref`. |
| Migration drift between blue (legacy) and green (new) | Blue freezes after audit start (no new migrations). Green has its own `supabase/migrations-green/` directory. |
| Storage transfer mid-flight | Stop blue writes during transfer window (per cutover runbook §"Pre-Cutover" #2-3). Delta transfer at the end. |
| Realtime room subscription drift | Document realtime tables in baseline migration. Smoke test KDS realtime before cutover go/no-go. |

---

## Cutover Switch

App points to green via env var swap:

```bash
# .env.production (vault, swapped at cutover)
NEXT_PUBLIC_SUPABASE_URL=https://<green>.supabase.co       # was <blue>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<green-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<green-service-role>
```

Vercel env update + deploy = atomic switch (per Vercel deployment ID flip).

PWA installed clients pick up new SUPABASE_URL on next page navigation (NetworkFirst) — Serwist precache hash invalidates HTML cache automatically.

---

## Verification

Before cutover:
1. Green provisioned, baseline migration applied from empty.
2. `supabase db pull` from green = empty diff vs `migrations-green/`.
3. Auth import rehearsal (per ADR-0001).
4. Storage bucket counts match blue (per `queries.sql §6` re-run on green).
5. Realtime: subscribe to KDS channel from green dev client, observe order_items insert echo.
6. Edge Functions: each function `curl <green-functions-url>/<fn>` returns 200.
7. Cron: `SELECT * FROM cron.job` on green matches expected list per ADR plan.

Post-cutover:
- 30-day blue read-only retention starts.
- Daily backup verification on green.
- Cost monitoring: green-only after blue archive (month 13).

---

## Open Items

- **Postgres major version**: PG18 hinted in `docs/plan/platform-fork-2026.md`. Need to verify Supabase PG18 GA timing — if not GA at cutover, use PG17. Don't block on PG18.
- **Blue retention**: B6 says 12 months. After 12 months, decision tree: snapshot → S3 cold storage → drop blue project? Or keep paid-tier?
- **Cross-project IAM**: service role keys per project. Document who has which key (rotate post-cutover).

---

## References

- Supabase project provisioning docs
- `docs/plan/system-rebuild/02-GREEN-BASELINE.md` §"Implementation Sequence"
- `docs/plan/system-rebuild/04-CUTOVER-QA-RUNBOOK.md` §"Pre-Cutover" + §"Switch"
- Companion ADRs: 0001 (auth), 0003 (rollback), 0004 (position-code)
- Existing platform plan: `docs/plan/platform-fork-2026.md` (PG18 + Cloudflare Workers — broader, not blocked here)
