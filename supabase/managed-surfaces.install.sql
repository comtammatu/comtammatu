-- =====================================================================
-- Managed-surfaces install — companion to migrations/00000000000000_baseline.sql
--
-- The baseline is a `--schema=public` dump, which EXCLUDES Supabase-managed
-- surfaces. Apply THIS after the public baseline to provision a from-zero env.
--
-- Generated 2026-05-30 from matu-dev (extensions / storage buckets / realtime /
-- cron) and iexws (storage.objects policy DDL). Fully idempotent (re-runnable):
-- every section guards its writes (ON CONFLICT / IF NOT EXISTS / DO-block checks),
-- so Section D realtime membership and Section E cron can be re-applied safely.
-- Realtime membership (Section D) is mirrored into the baseline (V10) as the
-- replay-faithful source of truth; the 6 broken cron jobs were removed (V11).
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
CREATE POLICY "inv_attach_read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'inventory-attachments');
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
CREATE POLICY "menu_images_read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'menu-images');
DROP POLICY IF EXISTS "menu_images_update" ON storage.objects;
CREATE POLICY "menu_images_update" ON storage.objects FOR UPDATE TO authenticated
  USING ((bucket_id = 'menu-images') AND ((storage.foldername(name))[1] = (auth_tenant_id())::text))
  WITH CHECK ((bucket_id = 'menu-images') AND ((storage.foldername(name))[1] = (auth_tenant_id())::text) AND has_permission_any('menu:write'));

-- ── Section D: realtime publication membership ──
-- NOTE: membership now lives idempotently in the baseline (V10) as the
-- replay-faithful source of truth. This block stays for envs provisioned from
-- the companion alone, and is guarded so re-runs are no-ops. kitchen_send_batches
-- is intentionally EXCLUDED (no realtime subscriber; over-grant removed in V10).
DO $reltime$
DECLARE
  v_tbl text;
  v_tables text[] := ARRAY[
    'branch_menu_item_daily_limits', 'kds_tickets', 'notifications',
    'order_status_history', 'orders', 'payments', 'pos_sessions',
    'print_jobs', 'printer_agents', 'tables'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'supabase_realtime publication absent — skipping realtime membership';
    RETURN;
  END IF;
  FOREACH v_tbl IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = v_tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tbl);
    END IF;
  END LOOP;
END
$reltime$;

-- ── Section E: cron jobs (pg_cron; cron.schedule upserts by jobname) ──
-- V11: the 6 jobs whose SQL bodies referenced dropped objects are removed and
-- their function definitions are gone from the baseline. The unschedule block
-- below cleans the stale jobs on already-provisioned envs (re-runnable: guarded
-- so it no-ops when a job is absent). KEPT: the 4 jobs that still resolve.
SELECT cron.schedule('cleanup-abandoned-payments',         '0 * * * *',   'SELECT public.cleanup_abandoned_payments()');
SELECT cron.schedule('refresh_mv_grn_price_baseline',      '5 * * * *',   'REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_grn_price_baseline;');
SELECT cron.schedule('refresh_mv_inventory_stock_current', '*/5 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_inventory_stock_current;');
SELECT cron.schedule('scan-inventory-alerts-daily',        '0 23 * * *',  'SELECT public.scan_inventory_alerts();');

-- V11: unschedule the 6 removed jobs (no-op if not present on this env).
DO $unsched$
DECLARE
  v_job text;
  v_jobs text[] := ARRAY[
    'auto_close_periods', 'compute_branch_daily_waste_caps', 'refresh_abc_classification',
    'refresh-finance-views-daily', 'weekly_grn_override_report', 'weekly_waste_report'
  ];
BEGIN
  FOREACH v_job IN ARRAY v_jobs LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = v_job) THEN
      PERFORM cron.unschedule(v_job);
    END IF;
  END LOOP;
END
$unsched$;
