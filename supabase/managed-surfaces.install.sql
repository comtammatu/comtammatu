-- =====================================================================
-- Managed-surfaces install — companion to migrations/00000000000000_baseline.sql
--
-- The baseline is a `--schema=public` dump, which EXCLUDES Supabase-managed
-- surfaces. Apply THIS after the public baseline to provision a from-zero env.
--
-- Generated 2026-05-30 from matu-dev (extensions / storage buckets / realtime /
-- cron) and iexws (storage.objects policy DDL). Idempotent (re-runnable).
--
-- PRIVILEGES: the storage.objects policies require ownership of storage.objects
-- (supabase_storage_admin). A plain migration/management role may NOT create
-- them — run that section as supabase_storage_admin (or via the Dashboard SQL
-- editor) if it errors with "must be owner of table objects".
-- =====================================================================

-- ── Section A: extensions (pre-public-schema safe) ──
CREATE EXTENSION IF NOT EXISTS pgcrypto      WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"   WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS hypopg        WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS index_advisor WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;
-- pg_stat_statements + supabase_vault are Supabase-managed (pre-installed).

-- ── Section B: storage buckets ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('grn-evidence',          'grn-evidence',          false, NULL,     NULL),
  ('hddt-archive',          'hddt-archive',          false, 10485760, ARRAY['application/pdf','application/xml','text/xml']),
  ('inventory-attachments', 'inventory-attachments', true,  10485760, ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
  ('menu-images',           'menu-images',           true,  5242880,  ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- ── Section C: storage.objects RLS policies (require storage owner) ──
DROP POLICY IF EXISTS "grn_evidence_no_delete" ON storage.objects;
CREATE POLICY "grn_evidence_no_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id <> 'grn-evidence');
DROP POLICY IF EXISTS "grn_evidence_read" ON storage.objects;
CREATE POLICY "grn_evidence_read" ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = 'grn-evidence') AND (has_permission(NULL::bigint, 'inventory:grn_hardblock_override') OR has_permission(NULL::bigint, 'reports:view_branch') OR has_permission(NULL::bigint, 'reports:view_tenant')));
DROP POLICY IF EXISTS "grn_evidence_upload" ON storage.objects;
CREATE POLICY "grn_evidence_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'grn-evidence') AND has_permission(NULL::bigint, 'inventory:grn_hardblock_override'));
DROP POLICY IF EXISTS "hddt_archive_select" ON storage.objects;
CREATE POLICY "hddt_archive_select" ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = 'hddt-archive') AND ((storage.foldername(name))[1] = (auth_tenant_id())::text) AND has_permission_any('finance:view'));
DROP POLICY IF EXISTS "inv_attach_delete" ON storage.objects;
CREATE POLICY "inv_attach_delete" ON storage.objects FOR DELETE TO authenticated
  USING ((bucket_id = 'inventory-attachments') AND ((storage.foldername(name))[1] = (auth_tenant_id())::text));
DROP POLICY IF EXISTS "inv_attach_insert" ON storage.objects;
CREATE POLICY "inv_attach_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'inventory-attachments') AND ((storage.foldername(name))[1] = (auth_tenant_id())::text) AND (has_permission(NULL::bigint, 'procurement:grn_create') OR has_permission(NULL::bigint, 'supplier_return:create') OR has_permission(NULL::bigint, 'inventory:writeoff')));
DROP POLICY IF EXISTS "inv_attach_read" ON storage.objects;
-- Public bucket object URL access does not require a storage.objects SELECT
-- policy. Keep object listing closed.
DROP POLICY IF EXISTS "inv_attach_update" ON storage.objects;
CREATE POLICY "inv_attach_update" ON storage.objects FOR UPDATE TO authenticated
  USING ((bucket_id = 'inventory-attachments') AND ((storage.foldername(name))[1] = (auth_tenant_id())::text))
  WITH CHECK ((bucket_id = 'inventory-attachments') AND ((storage.foldername(name))[1] = (auth_tenant_id())::text));
DROP POLICY IF EXISTS "menu_images_delete" ON storage.objects;
CREATE POLICY "menu_images_delete" ON storage.objects FOR DELETE TO authenticated
  USING ((bucket_id = 'menu-images') AND ((storage.foldername(name))[1] = (auth_tenant_id())::text) AND has_permission_any('menu:write'));
DROP POLICY IF EXISTS "menu_images_insert" ON storage.objects;
CREATE POLICY "menu_images_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'menu-images') AND ((storage.foldername(name))[1] = (auth_tenant_id())::text) AND has_permission_any('menu:write'));
DROP POLICY IF EXISTS "menu_images_read" ON storage.objects;
-- Public bucket object URL access does not require a storage.objects SELECT
-- policy. Keep object listing closed.
DROP POLICY IF EXISTS "menu_images_update" ON storage.objects;
CREATE POLICY "menu_images_update" ON storage.objects FOR UPDATE TO authenticated
  USING ((bucket_id = 'menu-images') AND ((storage.foldername(name))[1] = (auth_tenant_id())::text))
  WITH CHECK ((bucket_id = 'menu-images') AND ((storage.foldername(name))[1] = (auth_tenant_id())::text) AND has_permission_any('menu:write'));

-- ── Section D: realtime publication membership (fresh env only — ADD errors if already a member) ──
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.branch_menu_item_daily_limits, public.kds_tickets, public.kitchen_send_batches,
  public.notifications, public.order_status_history, public.orders, public.payments,
  public.pos_sessions, public.print_jobs, public.printer_agents, public.tables;

-- ── Section E: cron jobs (pg_cron; cron.schedule upserts by jobname) ──
SELECT cron.schedule('auto_close_periods',                 '0 19 * * *',  'SELECT public.auto_close_periods();');
SELECT cron.schedule('cleanup-abandoned-payments',         '0 * * * *',   'SELECT public.cleanup_abandoned_payments()');
SELECT cron.schedule('compute_branch_daily_waste_caps',    '30 17 * * *', 'SELECT public.compute_branch_daily_waste_caps();');
SELECT cron.schedule('refresh_abc_classification',         '0 19 * * 6',  'SELECT public.refresh_abc_classification();');
SELECT cron.schedule('refresh_mv_grn_price_baseline',      '5 * * * *',   'REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_grn_price_baseline;');
SELECT cron.schedule('refresh_mv_inventory_stock_current', '*/5 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_inventory_stock_current;');
SELECT cron.schedule('refresh-finance-views-daily',        '15 23 * * *', 'SET LOCAL statement_timeout = ''5min''; SELECT public.refresh_finance_views();');
SELECT cron.schedule('scan-inventory-alerts-daily',        '0 23 * * *',  'SELECT public.scan_inventory_alerts();');
SELECT cron.schedule('weekly_grn_override_report',         '0 2 * * 5',   'SELECT public.weekly_grn_override_report();');
SELECT cron.schedule('weekly_waste_report',                '0 2 * * 1',   'SELECT public.weekly_waste_report();');
