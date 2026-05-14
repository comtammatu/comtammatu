# DB Migration Plan — Supabase → Self-hosted Postgres (100% production data preserved)

**Owner:** comtammatu  
**Drafted:** 2026-05-14  
**§3 decisions locked:** 2026-05-14 (see §3 — auth, realtime, storage all decided).  
**Status:** Plan. §3 decisions made; inventory (§2) + realtime rebuild (§3.B) are the gating workstreams before any cutover.

> **Owner intent (2026-05-14): fully exit Supabase as a vendor.** Self-hosted open-source components (Postgres, GoTrue) on our own infra are acceptable; the Supabase *hosted platform* is not. The realtime decision (§3.B → Go-native LISTEN/NOTIFY, not the `supabase/realtime` container) reflects this — we minimise even self-hosted Supabase components.
>
> **Consequence — the two efforts are now COUPLED.** Originally the Go BE migration and the DB cutover were independent. Choosing Go-native realtime means the FE realtime subscriptions must move onto the Go BE *before* cutover, and "fully exit Supabase" means every `supabase.from(...)` read path must also move to Go BE (no `postgrest` container kept long-term). The DB cutover can still happen first for the *data layer*, but Supabase is not fully severed until the Go BE owns 100% of reads + writes + realtime.

---

## 1. Why this is non-trivial

Supabase is not just hosted Postgres. The current stack uses six distinct Supabase products that all need a story before cutover:

| Supabase product | What we use it for today | Replacement — DECIDED 2026-05-14 |
|---|---|---|
| **Postgres** | Source of truth for all business data, ~150 tables, RLS policies, SECURITY DEFINER RPCs | Vanilla Postgres 17 (matches Supabase's current major). 1:1 schema migrate. |
| **Auth (GoTrue)** | `auth.users`, password hashing, JWT issuance, `custom_access_token_hook`, magic-link/OTP/OAuth | **§3.A → Keep GoTrue self-hosted** on our own infra (open-source, not the Supabase SaaS). Zero `auth.users` migration; JWT subjects + bcrypt hashes preserved. |
| **Storage** | Feedback photos, menu item images | **§3.C → Cloudflare R2.** S3-compatible; `rclone copy` of object trees + `storage.objects` pointer rewrite. |
| **Realtime** | KDS ticket / kitchen_send_batches / daily_limits / pos_sessions subscriptions in POS PWA | **§3.B → Go-native: Postgres `LISTEN/NOTIFY` fanned out over Go WebSockets.** The `supabase/realtime` container is NOT used. This is a multi-week build (see §3.B) and is a **hard prerequisite for cutover**. |
| **Edge Functions** | None in active use (cron lives in pg_cron + Next.js Server Actions). Confirm via `supabase functions list` before cutover. | Drop dependency if confirmed unused. |
| **PostgREST** | Powers `supabase.from(...).select/insert/update` from the web app and POS. | **No `postgrest` container kept long-term** — owner intent is full Supabase exit. Short-lived bridge only: `postgrest` MAY run during the data cutover window so unmigrated read paths keep working, but every `supabase.from(...)` call must move to the Go BE for Supabase to be fully severed (this is the Go BE migration backlog, US-5xx + whole-module ports). |

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

## 3. Decisions — LOCKED 2026-05-14

### 3.A — Auth → **DECIDED: Keep GoTrue self-hosted**

GoTrue runs as an open-source container on our own infra (not the Supabase SaaS). Rationale: zero migration of `auth.users` rows — JWT subjects (`sub` UUIDs) and bcrypt password hashes are preserved byte-for-byte, which is what makes the "100% data preserved" guarantee hold. `custom_access_token_hook` continues to fire (it's a `SECURITY DEFINER` function that migrates with the schema).

**Implication:** the JWT issuance loop is unchanged. The Go BE keeps validating tokens against the same `SUPABASE_JWT_SECRET`. No re-login storm at cutover.

**Future option (not now):** once the Go BE owns 100% of writes, auth issuance *could* move into Go — but only by copying `auth.users` byte-for-byte, so it's a post-cutover optimisation, never a cutover-blocking step.

### 3.B — Realtime → **DECIDED: Go-native (Postgres `LISTEN/NOTIFY` → Go WebSockets)**

The `supabase/realtime` container is **not** used. The Go BE becomes the realtime authority. This is a deliberate choice to minimise even self-hosted Supabase components, consistent with the owner intent to fully exit Supabase.

Subscriptions to replace (confirm exact set via §2 `pg_publication_tables` audit):
- `kds_tickets` (per branch)
- `kitchen_send_batches`
- `branch_menu_item_daily_limits`
- `pos_sessions`

**This is a multi-week build and a hard cutover prerequisite.** Scope:
1. **DB side:** `AFTER INSERT/UPDATE/DELETE` triggers on the 4 tables emitting `pg_notify('realtime_<table>', json_payload)`. Payload carries `tenant_id`, `branch_id`, the row id, and the operation. Keep payloads < 8 KB (Postgres `NOTIFY` limit).
2. **Go side:** one dedicated `pgx` connection per Go BE instance running `LISTEN` on each channel; an in-process fan-out hub that maps `(tenant_id, branch_id)` → set of subscribed WebSocket clients.
3. **WebSocket endpoint:** `GET /realtime` (JWT-gated, same claims path as the rest of the Go BE). Client subscribes to topics it's authorised for; the hub filters by `tenant_id`/`branch_id` from claims so a client never receives another tenant's events.
4. **FE side:** replace `supabase.channel(...).on('postgres_changes', …)` in the POS PWA + KDS with a thin WebSocket client. Must preserve: reconnect-with-backoff, the "refetch on reconnect" gap-recovery (NOTIFY is fire-and-forget — a dropped connection misses events, so the client re-pulls state on reconnect), and per-topic debounce.
5. **Multi-instance caveat:** if the Go BE runs >1 replica, every replica `LISTEN`s and every replica fans out to its own WebSocket clients — that works because `NOTIFY` broadcasts to all listeners. No extra message bus needed at pilot scale. Document this; revisit if horizontal scale demands it.

**Risk:** `LISTEN/NOTIFY` has no replay/persistence. Mitigation is the reconnect-refetch in step 4 — the client treats realtime as a "something changed, go look" hint, never as the source of truth. This matches how the POS already uses Supabase Realtime (it refetches, doesn't trust the diff payload blindly), so the UX contract is preserved.

### 3.C — Storage → **DECIDED: Cloudflare R2**

Buckets to migrate (confirm via §2 audit):
- `feedback-photos` (per-submission, retention-pruned)
- `menu-item-images` (long-lived)

Migration: `rclone copy` the object trees into R2 buckets, then rewrite `storage.objects` pointers (or replace the storage-access layer entirely — see below). R2 is egress-free and S3-API-compatible.

**Implication for "fully exit Supabase":** the Supabase Storage *service* (which wraps `storage.objects` + RLS) goes away too. The Go BE needs a small storage handler that issues presigned R2 URLs for upload/download, replacing `supabase.storage.from(...)`. Feedback photo upload + menu image upload are the two call sites. This is tracked as a Go BE workstream, not a pure infra `rclone` job.

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

### Phase 0 — Inventory (1 day)
Run §2 audit. §3 decisions are already locked (2026-05-14). Capture the audit output to `docs/runbooks/db-migration/00-inventory.md`.

### Phase 0.5 — Go-native realtime rebuild (multi-week — runs in parallel, gates Phase 6)
Per §3.B, the `supabase/realtime` container is not used, so its replacement must exist before cutover. This is the longest single workstream in the plan and should start immediately, in parallel with everything else:
- DB triggers emitting `pg_notify` on the 4 realtime tables
- Go BE `LISTEN` connection + fan-out hub + `GET /realtime` WebSocket endpoint
- FE POS PWA + KDS subscription clients swapped off `supabase.channel(...)`
- Smoke + manual /qa of every realtime surface against the Go WebSocket path
**This phase, not the data copy, is the critical path to cutover.**

### Phase 1 — Stand up parallel infra (1 day)
- Postgres 17 with same extensions (`pgcrypto`, `pg_cron`, `pgjwt`, etc. — list from inventory)
- `wal_level = logical` + replication slot for Phase 4
- `auth`, `public`, `storage` schemas pre-created (no `realtime` schema — that was Supabase's; Go owns realtime now)
- GoTrue container with same `JWT_SECRET`, same `SITE_URL`, same `EXTERNAL_*` provider keys
- **No `supabase/realtime` container** — the Go BE `/realtime` WebSocket endpoint from Phase 0.5 is the replacement
- PostgREST container with same `PGRST_DB_SCHEMA` + `PGRST_JWT_SECRET` — **short-lived bridge only**, kept just for read paths the Go BE hasn't absorbed yet; the goal is to retire it
- Cloudflare R2 buckets (`feedback-photos`, `menu-item-images`) pre-created empty + Go BE storage handler for presigned URLs
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
- Spin up a parallel Next.js + Go BE pointed at the **new** Postgres + self-hosted GoTrue + **Go-native `/realtime`** + R2 storage
- Run `docs/runbooks/smoke-test.sh` against it
- Run a manual /qa pass against the parallel deployment — **explicitly exercise every realtime surface** (KDS bump, kitchen send batch, daily-limit change, pos_session open/close) through the Go WebSocket path, including a forced reconnect to verify gap-recovery
- Diff a sample of business reports (today's revenue, KDS queue count, open orders) between Supabase and new — must be identical

### Phase 6 — Cutover (≤30 min window during low-traffic hours)
- **Precondition:** Phase 0.5 (Go-native realtime) is complete and passed Phase 5 /qa. Cutover does not start otherwise.
- Put Supabase into read-only via RLS deny-all on writes (or pause writes via app maintenance mode)
- Drain logical replication to < 100 ms lag
- DNS / env-var flip: `SUPABASE_URL`, `DATABASE_URL`, `STORAGE_URL` → new host; `REALTIME_URL` → Go BE `/realtime`
- Drop subscription on new Postgres (it's now primary)
- Re-enable `pg_cron` jobs on new Postgres
- Smoke-test the live system, including a live realtime event round-trip
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
| Go-native realtime misses an event (NOTIFY is fire-and-forget; dropped WebSocket connection loses events) | Medium | Medium-high (stale KDS/POS UI) | FE treats realtime as a "go refetch" hint, never source of truth; reconnect-with-backoff + refetch-on-reconnect closes the gap. Exercised explicitly in Phase 5 /qa with a forced reconnect. |
| `pg_notify` payload exceeds the 8 KB limit | Low | Medium (trigger errors, write fails) | Triggers emit only `{tenant_id, branch_id, id, op}` — never the full row. Payload-size assertion in the trigger test. |
| Realtime trigger adds write latency to KDS/POS hot-path tables | Low | Medium | `pg_notify` is cheap (no disk I/O); benchmark the 4 triggers under load in Phase 0.5. Triggers are `AFTER` so they don't block the row write. |
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

The §3.B decision (Go-native realtime) **couples** the two efforts — they are no longer independent:

- **Cutover now depends on the Go BE.** The `supabase/realtime` container is not used, so Phase 0.5 (Go `/realtime` WebSocket endpoint + FE subscription swap) must ship before Phase 6. The Go BE migration is now on the cutover critical path for the realtime surfaces.
- **Full Supabase exit depends on the Go BE owning every read path.** PostgREST is kept only as a short-lived cutover bridge. "Supabase fully severed" = the entire US-5xx backlog + whole-module ports done, so `supabase.from(...)` and `supabase.storage.from(...)` have zero call sites.
- **The data-layer cutover can still go first.** Postgres + GoTrue + R2 can be cut over while some FE reads still hit PostgREST — that's a valid intermediate state. But Supabase isn't *gone* until the Go BE is complete.
- **Auth stays decoupled.** §3.A keeps GoTrue, so JWT issuance is unchanged and never blocks cutover. `auth.users` migrates byte-for-byte.

Recommended track order: **(1)** start Phase 0.5 realtime rebuild immediately (longest pole); **(2)** continue the Go BE US-5xx slices in parallel; **(3)** run Phases 0–4 data prep whenever; **(4)** Phase 6 cutover once Phase 0.5 is green; **(5)** keep grinding Go BE slices post-cutover until PostgREST can be removed.

---

## 9. Estimated effort

- **Phase 0.5 (Go-native realtime rebuild): ~2–4 weeks** — DB triggers + Go LISTEN/fan-out hub + WebSocket endpoint + FE subscription swap on POS PWA & KDS + /qa. This is the dominant cost and the cutover critical path.
- Phase 0–2 (inventory + parallel infra + schema): **2–3 days** wall time, mostly waiting on backups/restores.
- Phase 3–4 (bulk + replication): **1–2 days** wall, mostly automated.
- Phase 5 (dry-run + /qa): **1 day**.
- Phase 6 (cutover): **30 min window**, with prep + watch totalling **half a day**.
- Phase 7 (burn-in): **7 days** elapsed (no active work).

**Data-layer cutover alone** (if realtime weren't in scope): ~5–7 working days active, ~10–14 elapsed.  
**With the §3.B Go-native realtime rebuild on the critical path: ~4–6 weeks elapsed** to a clean cutover.  
**Full Supabase exit** (all `supabase.from`/`storage` call sites gone — the whole Go BE backlog including Inventory/Finance/HĐĐT/Payroll/Feedback/Reports): **multi-month**, tracked separately in `tasks/todo.md`.

Re-estimate after Phase 0 inventory surfaces the exact realtime publication membership + any opaque RPCs.

---

## 10. Owner-action checklist

**Decisions — DONE (2026-05-14):**
- [x] §3.A auth strategy → **keep GoTrue self-hosted**
- [x] §3.B realtime strategy → **Go-native LISTEN/NOTIFY over WebSockets** (no `supabase/realtime` container)
- [x] §3.C storage provider → **Cloudflare R2**

**Still needed from owner before cutover:**
- [ ] Allocate the 30-min cutover window (Phase 6) on a low-traffic day (recommend 02:00–02:30 ICT, Monday or Tuesday)
- [ ] Confirm Supabase project pause + retention budget for the 7-day burn-in window
- [ ] Acknowledge the §3.B consequence: cutover is now ~4–6 weeks out (realtime rebuild is the critical path), not ~2 weeks
- [ ] Approve starting Phase 0.5 (realtime rebuild) as the next active workstream
- [ ] Assign a watcher rotation for the 1-hour post-cutover monitoring window
