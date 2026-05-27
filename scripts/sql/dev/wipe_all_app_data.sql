-- =============================================================================
-- ⚠️  DEV / STAGING ONLY — DO NOT RUN ON PRODUCTION ⚠️
-- =============================================================================
-- Wipe ALL application data in the same Supabase project — keeps schema/RLS.
--
-- Use: Supabase Dashboard → SQL Editor → Run (postgres / service role) AGAINST
-- A DEV OR STAGING PROJECT. Verify project_ref in the dashboard URL first.
--
-- Safety gate: the operator MUST first execute the sentinel `SET LOCAL` line
-- below in the same session; otherwise the TRUNCATE block raises and aborts.
-- This is a friction step, not a real prod safeguard — confirm the project
-- before connecting.
--
-- What it does
--   1) TRUNCATE every `public.*` app table (listed below) with RESTART IDENTITY.
--   2) Optional: delete Auth users + identities (comment block at bottom).
--
-- What it does NOT do
--   - storage.objects (uploads) — delete in Dashboard → Storage if needed
--   - vault / realtime — not touched
--
-- After run: re-seed tenant (e.g. re-run migration seed SQL or insert tenant +
--   branches) and recreate users (e.g. scripts/sql/dev/seed_dev_auth_users.sql).
--
-- PRODUCTION: backup / export first. Irreversible data loss.
-- =============================================================================

-- Required confirmation. Run this line FIRST in the same session, then run
-- the BEGIN/TRUNCATE/COMMIT block below:
--
--   SET LOCAL app.allow_destructive_wipe = 'YES_I_KNOW_THIS_DELETES_ALL_DATA';

BEGIN;

DO $$
BEGIN
  IF current_setting('app.allow_destructive_wipe', true) IS DISTINCT FROM
     'YES_I_KNOW_THIS_DELETES_ALL_DATA' THEN
    RAISE EXCEPTION
      'Wipe blocked. Set the confirmation flag in the same session first: '
      'SET LOCAL app.allow_destructive_wipe = ''YES_I_KNOW_THIS_DELETES_ALL_DATA'';';
  END IF;
END $$;

SET LOCAL statement_timeout = '10min';

TRUNCATE TABLE
  public.attendance_records,
  public.shift_assignments,
  public.shifts,
  public.employees,
  public.order_status_history,
  public.order_items,
  public.orders,
  public.payments,
  public.kds_tickets,
  public.kds_station_categories,
  public.kds_stations,
  public.tax_invoices,
  public.stock_movements,
  public.stock_levels,
  public.ingredients,
  public.pos_sessions,
  public.pos_terminals,
  public.printer_configs,
  public.order_daily_counters,
  public.tables,
  public.branch_zones,
  public.menu_item_available_sides,
  public.menu_item_modifiers,
  public.menu_item_variants,
  public.menu_items,
  public.menu_categories,
  public.area_branches,
  public.areas,
  public.profiles,
  public.branches,
  public.system_settings,
  public.tenants
RESTART IDENTITY CASCADE;

COMMIT;

-- -----------------------------------------------------------------------------
-- OPTIONAL: remove Auth users (Dashboard → Authentication).
-- Uncomment ONLY if you want to delete login accounts (not just `profiles`).
-- Minimal sequence; if a table does not exist on your GoTrue version, drop that line.
-- -----------------------------------------------------------------------------
/*
BEGIN;

DELETE FROM auth.identities;
DELETE FROM auth.users;

COMMIT;
*/
