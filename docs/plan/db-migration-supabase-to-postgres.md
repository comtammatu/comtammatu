# DB Migration Plan — Supabase → Self-hosted Postgres (100% production data preserved)

**Owner:** comtammatu  
**Drafted:** 2026-05-14  
**Status:** Plan only. No code changes. Owner approval required before any cutover step.

> Sibling to the Go BE migration tracked in `tasks/todo.md` ("Go BE migration backlog US-5xx"). The two efforts share a goal (sever the Supabase dependency) but can land on independent timelines: the Go BE can keep talking to Supabase Postgres until the DB cutover is ready, and the new Postgres can be served by the existing Next.js Server Actions until the BE is fully on Go.

---

## 1. Why this is non-trivial

Supabase is not just hosted Postgres. The current stack uses six distinct Supabase products that all need a story before cutover:

| Supabase product | What we use it for today | Self-hosted replacement decision |
|---|---|---|
| **Postgres** | Source of truth for all business data, ~150 tables, RLS policies, SECURITY DEFINER RPCs | Vanilla Postgres 17 (matches Supabase's current major). 1:1 schema migrate. |
| **Auth (GoTrue)** | `auth.users`, password hashing, JWT issuance, `custom_access_token_hook`, magic-link/OTP/OAuth | **Choose one** (see §3.A). Default proposal: keep Supabase Auth (GoTrue) self-hosted alongside Postgres; do **not** roll our own. |
| **Storage** | Feedback photos, menu item images | S3-compatible (MinIO self-hosted, or Cloudflare R2 / AWS S3). Storage URLs change → migration shim. |
| **Realtime** | KDS ticket / kitchen_send_batches / daily_limits / pos_sessions subscriptions in POS PWA | **Choose one** (see §3.B). Default proposal: keep `supabase/realtime` self-hosted; FE subscription URLs flip to new host. |
| **Edge Functions** | None in active use (cron lives in pg_cron + Next.js Server Actions). Confirm via `supabase functions list` before cutover. | Drop dependency if confirmed unused. |
| **PostgREST** | Powers `supabase.from(...).select/insert/update` from the web app and POS. | Run `postgrest` container against the new DB **until** Go BE absorbs all reads + writes (US-5xx). Same JWT secret, same `anon`/`authenticated` roles. |

**100% data preservation** means: every row in `auth.users`, every row in `public.*`, every storage object, plus all triggers/sequences/RLS policies/functions/extensions, lands in the new home with identical PKs, FKs, UUIDs, hashed passwords, and timestamps. Anything less means re-login storms, broken JWT subjects, dangling FKs, or vanished photos.

---

## 2. Inventory before any move

Run this audit and capture output to `docs/runbooks/db-migration/00-inventory.md` before scheduling cutover:

```bash
# Schema + extensions
supabase db dump --linked --schema public,auth,storage,extensions --data-only=false > schema.sql
supabase db dump --linked --schema public,auth,storage --data-only=true > data.sql
psql -c "SELECT extname, extversion FROM pg_extension ORDER BY extname;"

# Roles + grants
psql -c "\du"
psql -c "SELECT table_schema, table_name, grantee, privilege_type FROM information_schema.role_table_grants WHERE grantee IN ('anon','authenticated','service_role') ORDER BY 1,2;"

# Cron jobs (pg_cron) — these are LIVE business logic
psql -c "SELECT jobid, schedule, command, nodename, username, active FROM cron.job ORDER BY jobid;"

# SECURITY DEFINER functions — auth-context-dependent, must survive intact
psql -c "SELECT n.nspname, p.proname, p.prosecdef FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE p.prosecdef AND n.nspname IN ('public','auth') ORDER BY 1,2;"

# RLS policies
psql -c "SELECT schemaname, tablename, policyname, cmd FROM pg_policies ORDER BY 1,2,3;"

# Storage buckets + object count
psql -c "SELECT name, public, file_size_limit, allowed_mime_types FROM storage.buckets ORDER BY name;"
psql -c "SELECT bucket_id, count(*) FROM storage.objects GROUP BY 1 ORDER BY 1;"

# Edge functions
supabase functions list

# Realtime publication membership — tables we actually subscribe to
psql -c "SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY 1,2;"
```

Outputs from this step gate every later decision. **Do not skip.**

---

## 3. Open decisions (owner sign-off required)

### 3.A — Auth: keep Supabase Auth (GoTrue), or replace?

| Option | Pros | Cons |
|---|---|---|
| **Keep GoTrue self-hosted** *(recommended)* | Zero migration of `auth.users` rows. JWT subjects + bcrypt password hashes unchanged. `custom_access_token_hook` keeps working. Existing FE supabase-js calls keep working until US-5xx finishes. | One more container to run. Couples us to Supabase's GoTrue release cadence. |
| **Replace with Go-side auth (e.g. `internal/auth` issues + verifies)** | Single auth surface. JWT issuance + custom claims become Go's responsibility. Removes GoTrue as a dependency. | Migrating `auth.users` requires either re-using GoTrue's bcrypt schema (effectively re-implementing it) or forcing every user to reset their password. **Breaks "100% data preserved" unless we copy `auth.users` byte-for-byte.** |

**Default recommendation:** keep GoTrue. Revisit only after the Go BE owns 100% of writes (post-US-515).

### 3.B — Realtime: keep `supabase/realtime`, or replace?

POS PWA + KDS depend on Realtime. Subscriptions today:
- `kds_tickets` (per branch)
- `kitchen_send_batches`
- `branch_menu_item_daily_limits`
- `pos_sessions`

| Option | Pros | Cons |
|---|---|---|
| **Keep `supabase/realtime` self-hosted** *(recommended)* | FE subscription code unchanged (only the URL flips). Replication-based diff stream we already depend on. | One more container; depends on `wal_level = logical` in new Postgres. |
| **Postgres LISTEN/NOTIFY via Go BE WebSockets** | One less dependency. | Have to re-implement the FE subscription contract, debounce, replay semantics, presence. Multi-week effort. |
| **Drop realtime; switch to polling** | Simplest infra. | Visible UX regression for KDS / kitchen send batches. Not acceptable for pilot. |

**Default recommendation:** keep `supabase/realtime`.

### 3.C — Storage: MinIO vs Cloudflare R2 vs AWS S3

Storage buckets in use (confirm via inventory step):
- `feedback-photos` (per-submission, retention-pruned)
- `menu-item-images` (long-lived)

Migration is identical across providers (`rclone copy` of object trees + DB pointer rewrite of `storage.objects.bucket_id`/`name`). The choice is operational, not technical:

| Provider | Notes |
|---|---|
| MinIO self-hosted | Stays under our roof. Need our own backup story. |
| Cloudflare R2 | Egress-free, cheap. Compatible S3 API. |
| AWS S3 | Most documented; egress cost. |

**Default recommendation:** Cloudflare R2 (cost) unless data-residency rules require self-hosted.

### 3.D — Cron: `pg_cron` in new Postgres, vs Go scheduler, vs external trigger

Active cron jobs (confirm via inventory step):
- `hddt-daily-summary`
- `feedback-daily-report`
- `feedback-retention`
- `telegram-flush`

`pg_cron` migrates 1:1 with the schema dump. The Go BE migration backlog already flags this as an open question; the DB migration **does not need to resolve it** — leave `pg_cron` in place and revisit when the Go BE owns these surfaces.

---

## 4. Phased migration (recommended order)

Each phase is independently reversible. **No phase is "done" until smoke tests on the new host pass with the same fixtures as on Supabase.**

### Phase 0 — Inventory + decisions (1 day)
Run §2 audit. Owner signs off on §3.A / §3.B / §3.C.

### Phase 1 — Stand up parallel infra (1 day)
- Postgres 17 with same extensions (`pgcrypto`, `pg_cron`, `pgjwt`, etc. — list from inventory)
- `wal_level = logical` + replication slot for Phase 4
- `auth`, `public`, `storage`, `realtime` schemas pre-created
- GoTrue container with same `JWT_SECRET`, same `SITE_URL`, same `EXTERNAL_*` provider keys
- `supabase/realtime` container pointed at the new Postgres
- PostgREST container with same `PGRST_DB_SCHEMA` + `PGRST_JWT_SECRET` as current
- Object storage chosen in §3.C with the buckets pre-created (empty)
- `pg_cron` jobs **disabled** (set `active = false`) — re-enabled at cutover only

### Phase 2 — Schema + roles + grants (½ day)
- Apply schema dump (`schema.sql`) to new Postgres
- Restore role grants captured in §2
- Verify: every RLS policy, every SECURITY DEFINER function, every trigger present
- Diff: `pg_dump --schema-only` from both sides → must match modulo timestamps

**Regression rule reminder:** `auth.uid()` returns NULL on plain pgxpool — Go BE callers must keep the explicit-UUID-binding pattern (see `internal/handler/notifications/handler.go:47-73`). This survives the migration unchanged.

### Phase 3 — Bulk historical data copy (overnight)
- `auth.users`, `auth.identities`, `auth.sessions` first (FK leaves) — preserves UUID `sub` claims
- `public.*` next, in FK order (use `pg_dump --data-only --disable-triggers` + restore with `--disable-triggers`)
- `storage.objects` rows (metadata) — object bodies copied separately via `rclone`
- Run referential-integrity sweep:
  ```sql
  SELECT conname, conrelid::regclass FROM pg_constraint WHERE convalidated = false;
  ```
  All FK constraints must validate clean.

### Phase 4 — Logical replication catch-up (continuous until cutover)
- Create publication on Supabase: `CREATE PUBLICATION ctmt_migrate FOR ALL TABLES IN SCHEMA public, auth, storage;`
- Create subscription on new Postgres: `CREATE SUBSCRIPTION ctmt_migrate ...`
- Verify lag stays < 1 second under normal write load
- Storage object diff sync runs every 5 minutes via `rclone sync` (R2 supports this efficiently)

### Phase 5 — Application dry-run on parallel infra (½–1 day)
- Spin up a parallel Next.js + Go BE pointed at the **new** Postgres + GoTrue + Realtime + Storage
- Run `docs/runbooks/smoke-test.sh` against it
- Run a manual /qa pass against the parallel deployment
- Diff a sample of business reports (today's revenue, KDS queue count, open orders) between Supabase and new — must be identical

### Phase 6 — Cutover (≤30 min window during low-traffic hours)
- Put Supabase into read-only via RLS deny-all on writes (or pause writes via app maintenance mode)
- Drain logical replication to < 100 ms lag
- DNS / env-var flip: `SUPABASE_URL`, `DATABASE_URL`, `STORAGE_URL`, `REALTIME_URL` → new host
- Drop subscription on new Postgres (it's now primary)
- Re-enable `pg_cron` jobs on new Postgres
- Smoke-test the live system
- Watch error rate for 1 hour

### Phase 7 — Burn-in + retention (7 days)
- Keep Supabase project alive (read-only) for 7 days as a recovery snapshot
- Daily diff: row counts on top 20 tables must match (with monotonic growth on new side only)
- After 7 days, pause Supabase project; archive a final logical backup

---

## 5. Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `custom_access_token_hook` doesn't fire on new GoTrue → JWT missing `tenant_id` → all auth-gated requests 403 | Medium | Critical | Phase 5 dry-run includes login → /auth/me round-trip explicitly. Hook is `SECURITY DEFINER` and migrates with schema. Verify `app_metadata` post-restore. |
| Logical replication slot fills up because subscriber is slow | Medium | High | Monitor `pg_replication_slots.confirmed_flush_lsn` lag. Have manual `pg_logical_emit_message` heartbeat. |
| Storage object metadata in DB diverges from actual bucket contents | High during long copy windows | Medium | `rclone check` final pass before cutover; orphan-object detection query post-cutover. |
| Realtime publication membership differs after migration (forgotten table) | Low | Medium-high (UX broken) | Audit `pg_publication_tables` on both sides as last cutover step. |
| BIGINT IDENTITY sequences drift (new INSERT lands on a PK already used in Supabase) | Low if cutover is clean; High if dual-write window | Critical | Set `SELECT setval('seq', (SELECT max(id) FROM …))` on every IDENTITY sequence post-cutover. Single-writer rule during Phase 6. |
| `pg_cron` job re-runs the same day's `feedback-daily-report` twice (once before cutover, once after) | Medium | Medium | Job has idempotency anchor (insert-or-skip by date). Verified in `tasks/regressions.md` rule for daily reports. |
| Refresh-token sessions in active POS terminals can't decode JWTs signed by old `JWT_SECRET` | Low (we keep the secret) | Medium | Carry `SUPABASE_JWT_SECRET` to new GoTrue unchanged. Forces no re-login. |
| Money in flight during cutover (MoMo IPN, VietQR confirm) | Low (≤30 min window) | High | Maintenance-mode banner + freeze new orders for cutover window. Webhook IDs are idempotent (UNIQUE on `webhook_events`), so a replayed webhook is safe. |

---

## 6. Rollback

At each phase boundary:

- **Phase 0–3:** stop and discard. No production impact.
- **Phase 4:** drop the subscription; tear down new infra. Supabase untouched.
- **Phase 5:** as above.
- **Phase 6 (the dangerous one):**
  - If the cutover fails within 30 min: flip env vars / DNS back to Supabase, re-enable Supabase writes, drop the new Postgres's cron jobs, accept up to 30 min of data loss on the new side (it's been read-only).
  - If the cutover fails after writes have landed on new Postgres: replication direction is reversed (new → Supabase) for a controlled window before re-flipping. Owner decision needed at this point.

---

## 7. Smoke test — what "100% data preserved" means in CI

Before declaring cutover successful, the following queries must return identical results on both sides (allowing for monotonic growth post-cutover on the new side):

```sql
-- Row counts on every business table
SELECT table_schema, table_name, (xpath('/row/c/text()',
  query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), true, true, '')))[1]::text::int AS row_count
FROM information_schema.tables
WHERE table_schema IN ('public','auth','storage')
ORDER BY 1,2;

-- auth.users PK + email + encrypted_password fingerprint
SELECT id, email, md5(encrypted_password) FROM auth.users ORDER BY id;

-- public.orders financial fingerprint (today's tenant scope)
SELECT tenant_id, branch_id, count(*), sum(total_amount), sum(subtotal)
FROM public.orders WHERE created_at >= current_date - INTERVAL '1 day'
GROUP BY 1,2 ORDER BY 1,2;

-- public.payments completion state
SELECT tenant_id, status, count(*), sum(amount) FROM public.payments GROUP BY 1,2 ORDER BY 1,2;

-- Storage objects vs metadata
SELECT bucket_id, count(*), sum(metadata->>'size')::bigint FROM storage.objects GROUP BY 1 ORDER BY 1;
```

Any diff is a stop-the-line event. Investigate before declaring done.

---

## 8. Dependencies + sequencing with the Go BE migration

- **DB migration does not require Go BE migration completion.** The new Postgres can sit behind PostgREST + Next.js Server Actions exactly as today; the cutover is the only invasive step.
- **Go BE migration does not require DB migration completion.** Go BE talks to Supabase Postgres via pgxpool; same DSN works for self-hosted Postgres post-cutover.
- **They share one constraint:** if Auth is replaced (option 3.A "Go-side auth"), Go BE must own the JWT issuance loop before that flip — and we lose the "100% data preserved" guarantee for `auth.users.encrypted_password`. **Default plan keeps GoTrue, decoupling the two efforts entirely.**

---

## 9. Estimated effort

- Phase 0–2 (inventory + parallel infra + schema): **2–3 days** wall time, mostly waiting on backups/restores.
- Phase 3–4 (bulk + replication): **1–2 days** wall, mostly automated.
- Phase 5 (dry-run + /qa): **1 day**.
- Phase 6 (cutover): **30 min window**, with prep + watch totalling **half a day**.
- Phase 7 (burn-in): **7 days** elapsed (no active work).

Total active engineering: **~5–7 working days**. Total elapsed: **~10–14 days** with a 7-day burn-in window.

This estimate assumes the inventory step does not surface unexpected blockers (large opaque RPC, unrecorded Edge Function, custom realtime channel). Re-estimate after Phase 0.

---

## 10. Owner-action checklist before this plan can begin

- [ ] Approve §3.A auth strategy (default: keep GoTrue self-hosted)
- [ ] Approve §3.B realtime strategy (default: keep supabase/realtime self-hosted)
- [ ] Approve §3.C storage provider (default: Cloudflare R2)
- [ ] Allocate the 30-min cutover window (Phase 6) on a low-traffic day (recommend 02:00–02:30 ICT, Monday or Tuesday)
- [ ] Confirm Supabase project pause + retention budget for the 7-day burn-in window
- [ ] Assign a watcher rotation for the 1-hour post-cutover monitoring window
