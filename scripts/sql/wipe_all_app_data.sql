-- =============================================================================
-- Wipe ALL application data in the same Supabase project — keeps schema/RLS.
--
-- Use: Supabase Dashboard → SQL Editor → Run (postgres / service role).
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
--   branches) and recreate users (e.g. scripts/sql/seed_dev_auth_users.sql).
--
-- PRODUCTION: backup / export first. Irreversible data loss.
-- =============================================================================

BEGIN;

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
