# Greenfield prod cutover (Option B) — runbook

**Status:** prepared, **owner-gated**. The agent prepares + dry-runs; the **owner
runs the production cutover**. The agent **never mutates prod** — prod is read
SELECT-only through a read-only FDW role. Rollback is trivial because the old
prod project is left **fully intact**.

**What this does:** stand up a **new lean Supabase project** (HKD 59-table
baseline), copy the KEEP-set data from the current CTCP prod into it, reconcile
to the cent, then repoint the app and retire prod (big-bang).

**Artifacts (in `supabase/greenfield/`):**
- `migrate-data.sql` — intersection-based data copy (preserves PKs, auto-drops
  prod's removed columns, reshapes branch_kind / staff_permissions / orders).
- `reconcile.sql` — fail-loud parity gate (counts + money sums + invariants).
- `migrate-data.sh` — runner (migrate + reconcile, `ON_ERROR_STOP`).

Related: [[project_greenfield_rebuild_state]] (Option B), `supabase/greenfield/README.md`,
`supabase/greenfield/lean-cutover.sql` (the schema-side prod→lean diff).

---

## 0. Safety contract
- Prod (`iexwsuaqqenyjiskawoj`) is **SELECT-only**. The lean DB reads it via
  `postgres_fdw` using a **read-only role** — never the service role.
- The ETL writes **only the new lean project**. The runner asks for explicit
  `yes` confirmation and prints both endpoints first.
- HĐĐT (`tax_invoices*`) are **legally immutable** (NĐ70/2025): copied verbatim
  with original ids + `provider_ref` + `invoice_number`. Never re-number.
- **Rollback = do nothing to prod.** If anything fails, the app stays pointed at
  prod and the half-filled lean project is discarded/recreated.

---

## 1. Provision the lean target
1. Create a new Supabase project (same region/org as prod).
2. Apply, in order:
   - `supabase/migrations/00000000000000_baseline.sql`
   - `supabase/managed-surfaces.install.sql` (extensions, buckets, storage
     policies, realtime publication, cron)
   - Seed **`permission_keys` ONLY** — the `staff_permissions` ETL filter
     depends on the lean key catalog existing. Do **not** seed the demo
     tenant/branches/owner: the ETL brings real tenants/branches/profiles from
     prod, and the migrate guard **refuses to run if those tables are non-empty**
     (so a stray demo seed = fail-loud, not silent count drift).
3. Enable the **Custom Access Token hook** → `custom_access_token_hook`
   (Auth → Hooks).
4. Verify the baseline boots: `SELECT count(*) FROM permission_keys;` → 50.

> ⚠️ `seed.sql` inserts a demo tenant/branches/owner + `system_settings`. For a
> real cutover, run baseline + companion, then insert **only** the
> `permission_keys` block (copy it out, or run the full seed then
> `DELETE FROM tenants` cascade). The migrate guard enforces this — it aborts if
> `tenants/branches/profiles/orders/payments/tax_invoices/suppliers/ingredients/
> system_settings` already hold rows.

## 2. auth.users for profiles (FK prerequisite)
`profiles.id` → `auth.users(id)`. Copy the prod `auth.users` rows for every
profile you migrate **before** the ETL, or `profiles` will fail its FK.
- Preferred: Supabase **project migration / auth export-import** for `auth.users`
  (keeps ids + identities + hashed passwords so staff log in unchanged).
- The data ETL here covers `public.*` only; `auth.*` is a separate, owner-run
  step. Confirm `SELECT count(*) FROM auth.users` on lean == prod profile count
  before proceeding.

## 3. Read-only prod role
On **prod**, create a least-privilege role for the FDW:
```sql
CREATE ROLE etl_ro LOGIN PASSWORD '<strong>';
GRANT USAGE ON SCHEMA public TO etl_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO etl_ro;
```
Use this role's credentials as `PROD_USER`/`PROD_PASSWORD`. Drop it after cutover.

## 4. Freeze window
- Announce maintenance. **Close all POS sessions** and stop new
  orders/payments/HĐĐT issuance. The ETL leaves `pos_sessions`, `kds_tickets`,
  `print_jobs`, `kitchen_send_batches`, `webhook_events`, `notifications` and the
  job logs **empty** — there must be no in-flight work to lose.
- Snapshot prod (PITR/backup) as the rollback anchor.

## 5. Dry-run on a clone (do this BEFORE the real window)
1. Clone prod to a scratch project (or restore the snapshot elsewhere).
2. Point `PROD_*` at the clone, `LEAN_DB_URL` at a throwaway lean project.
3. `./migrate-data.sh` → must end with **RECONCILE OK**.
4. Resolve the two prod-specific TODOs surfaced here (see §9) and re-run until
   clean. Only then schedule the real window.

## 6. Run the ETL (real window)
```bash
cd supabase/greenfield
export LEAN_DB_URL='postgresql://postgres:...@<lean-pooler>:5432/postgres'
export PROD_HOST='<prod-host>' PROD_DB='postgres' PROD_PORT='5432'
export PROD_USER='etl_ro' PROD_PASSWORD='<strong>'
./migrate-data.sh
```
The runner copies in FK order inside one transaction (all-or-nothing),
re-syncs identity sequences, refreshes materialized views, then runs
`reconcile.sql`. **Stop immediately if reconcile RAISEs.**

> Requires **psql ≥ 16** — the runner passes `PROD_*` via the environment and
> the SQL reads them with `\getenv` (keeps the password out of argv/ps/history).
> The migrate guard fails loud on a non-empty target, missing `auth.users`, an
> open `pos_session` on prod, or an unexpected `branch_kind`. The ETL is **not
> idempotent**: after any failure, reset the lean target before retrying
> (`DROP SCHEMA public CASCADE` → re-apply baseline + companion + permission_keys
> seed), then run again.

## 7. Manual spot-checks (in addition to reconcile)
- HĐĐT: pick 3 recent issued invoices — `invoice_number`, `provider_ref`,
  `status`, totals identical to prod; `tax_invoice_events` chain intact.
- Orders↔payments: 3 paid orders — `total_amount` == sum of their `payments`.
- Login as the owner on the lean app; open POS, Finance (revenue + cash-book),
  Inventory (stock + a GRN), KDS. Create one test order end-to-end → KDS →
  print job → pay → (optionally) issue HĐĐT, then delete the test order.
- `supplier_invoices` balances (`total_amount − paid_amount`) match prod.

## 8. Cut over
1. Repoint the app env (Vercel + local `.env.local`) to the lean project:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_ID`.
2. Set a **fresh** `CRON_SECRET` (old value leaked in git history) + `UPSTASH_*`.
3. Redeploy. Smoke test the §7 flows on production traffic.
4. Confirm cron is scheduled on the lean project (HĐĐT summary/reconcile/archive,
   KDS maintenance, payment cleanup, MV refresh).
5. Monitor logs + `/api/health` for 24h. Keep prod **read-only, not deleted**
   for at least one accounting cycle.

## 9. Prod-specific items to finalize during the dry-run
These are deliberately left as reviewable points because they depend on prod's
actual data (not knowable from the lean schema alone):
1. **`branches.branch_kind` domain** — the ETL excludes `('tenant','area')`
   container rows and sets the rest to `'branch'`. Confirm prod's real
   `branch_kind` values; adjust the WHERE in `migrate-data.sql` if containers
   use other kinds (or don't exist).
2. **Column deltas** — intersection-copy auto-handles drift, but eyeball the
   `NOTICE` row counts: a table copying 0 rows when prod has data signals a
   name mismatch worth checking.
3. **`auth.users` migration** (§2) — must precede the data ETL.
4. **Seed rows vs real data** (§1 note) — ensure the lean project isn't carrying
   demo seed rows that would skew reconcile counts.

## 10. Rollback
At any failure: **stop, change nothing on prod, keep the app pointed at prod.**
Discard (or `DROP SCHEMA public CASCADE` + re-apply baseline on) the lean
project and retry after fixing. Because prod was only ever read, there is no
prod state to undo.
