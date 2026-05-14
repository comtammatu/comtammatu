# Local Seed Blockers — US-Q02

Date: 2026-05-14  
Script: `backend/scripts/seed-local-db.sh`  
Prelude: `backend/scripts/supabase-compat-prelude.sql`

## Result

**334/334 migrations passed. 0 blockers on plain PostgreSQL 17.**  
Public table count: 121 tables loaded.

## Supabase-isms Shimmed by Prelude

The following platform objects do not exist on vanilla Postgres and are stubbed
in `supabase-compat-prelude.sql`:

| Supabase object | Prelude stub | Notes |
|---|---|---|
| `auth` schema + `auth.users` table | Minimal stub table with `id UUID PK` | `profiles.id` FK references it |
| `auth.uid()` | Returns `NULL::UUID` | RLS policies using it return false (no session) |
| `auth.role()` | Returns `NULL::TEXT` | — |
| `auth.jwt()` | Returns `'{}'::JSONB` | `app_metadata` lookups return NULL |
| `auth.email()` | Returns `NULL::TEXT` | — |
| Role `anon` | `NOLOGIN` role stub | GRANTs and RLS `TO anon` apply cleanly |
| Role `authenticated` | `NOLOGIN` role stub | GRANTs and RLS `TO authenticated` apply cleanly |
| Role `service_role` | `NOLOGIN` role stub | GRANTs apply cleanly |
| Role `supabase_auth_admin` | `NOLOGIN` role stub | JWT hook `GRANT EXECUTE` applies cleanly |
| Role `supabase_realtime` | `NOLOGIN` role stub | — |
| `storage` schema + `storage.objects/buckets` | Minimal stub tables | Storage RLS policies on `storage.objects` apply |
| `storage.foldername()` | `string_to_array(name, '/')` | Used in storage RLS policies |
| `storage.filename()` / `storage.extension()` | String split stubs | — |
| `cron` schema + `cron.schedule/unschedule()` | Stub table + no-op functions | `PERFORM cron.schedule(...)` calls succeed silently |
| `supabase_realtime` publication | Empty `CREATE PUBLICATION` | `ALTER PUBLICATION … ADD TABLE` works; WAL level warning is harmless |

## Functional Differences on Plain Postgres

1. **RLS is inactive for the Go backend.** The Go backend connects as `postgres`
   (superuser), which bypasses RLS entirely. This is correct for server-side
   use — RLS was designed for direct PostgREST client access.

2. **`auth.uid()` returns NULL.** Any trigger or function that calls `auth.uid()`
   to set `created_by` / `bumped_by` will get NULL. The Go backend sets these
   columns explicitly via query parameters, so this is acceptable.

3. **pg_cron jobs are not scheduled.** `cron.schedule()` inserts into a stub
   table but no scheduler runs. Periodic jobs (finance view refresh,
   inventory alerts, auto-close periods) must be run manually or via
   an external scheduler when needed in local dev.

4. **Realtime subscriptions do not work.** The `supabase_realtime` publication
   exists but WAL level is not `logical` in the Docker container. The Go backend
   uses its own fan-out Hub (see `backend/internal/hub/`) and does not rely on
   Supabase Realtime.

5. **Storage objects are not served.** The `storage` schema is a stub — no
   actual file serving. Menu images, GRN evidence, etc. are not available
   locally without Supabase Storage or an alternative.

## DB-Exit-Plan Disposition

Per `docs/plan/` DB-exit decisions: the Go backend (`backend/`) bypasses
PostgREST and connects directly via pgxpool. The prelude stubs are a
development convenience only — they make migrations reproducible without
a full Supabase local stack. Production still runs on hosted Supabase until
the exit migration is complete.

The `public.staff` table referenced in the US-Q02 task spec does not exist —
the equivalent tables are `public.users` (Go-native auth, added in
`20260511000000_go_backend_users.sql`) and `public.profiles` (Supabase auth
legacy). The Go backend uses `public.users`.
