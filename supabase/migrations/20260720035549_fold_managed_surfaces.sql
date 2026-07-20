-- Fold managed surfaces into the migration chain (D047).
-- Supabase Branching applies only migrations + seed (not the standalone
-- supabase/managed-surfaces.install.sql), so a preview branch needs these here
-- to be self-contained: extensions, storage buckets + storage.objects RLS,
-- supabase_realtime publication membership, and pg_cron jobs.
-- Idempotent / re-runnable: safe to apply to prod where these already exist.
-- Section C (storage.objects policies) requires ownership of storage.objects
-- (the Supabase migration role / postgres has it; a less-privileged manual apply
-- path must run that section as supabase_storage_admin).

-- ── Section A: extensions ──
CREATE EXTENSION IF NOT EXISTS pgcrypto      WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"   WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS hypopg        WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS index_advisor WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── Section B: storage buckets ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('attendance-photos',     'attendance-photos',     false, 5242880,  ARRAY['image/jpeg','image/png','image/webp']),
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

-- ── Section D: realtime publication membership (idempotent — add each table only if not already a member) ──
DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'branch_menu_item_daily_limits', 'kds_tickets', 'notifications',
    'order_status_history', 'orders', 'payments', 'pos_sessions',
    'print_jobs', 'tables', 'webhook_events'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = v_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    END IF;
  END LOOP;
END$$;

-- ── Section E: cron jobs (pg_cron; cron.schedule upserts by jobname) ──
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('refresh_mv_grn_price_baseline', 'refresh-finance-views-daily');

SELECT cron.schedule('auto_close_periods',                 '0 19 * * *',  'SELECT public.auto_close_periods();');
SELECT cron.schedule('check_cron_jobs_health_job',          '*/30 * * * *', 'SELECT public.check_cron_jobs_health();');
SELECT cron.schedule('cleanup-abandoned-payments',         '0 * * * *',   'SELECT public.cleanup_abandoned_payments()');
SELECT cron.schedule('compute_branch_daily_waste_caps',    '30 17 * * *', 'SELECT public.compute_branch_daily_waste_caps();');
SELECT cron.schedule('refresh_abc_classification',         '0 19 * * 6',  'SELECT public.refresh_abc_classification();');
SELECT cron.schedule('refresh_mv_inventory_stock_current', '*/15 * * * *', 'SET LOCAL statement_timeout = ''2min''; SELECT public.refresh_inventory_dashboard();');
SELECT cron.schedule('scan-inventory-alerts-daily',        '0 23 * * *',  'SELECT public.scan_inventory_alerts();');
SELECT cron.schedule('weekly_grn_override_report',         '0 2 * * 5',   'SELECT public.weekly_grn_override_report();');
SELECT cron.schedule('weekly_waste_report',                '0 2 * * 1',   'SELECT public.weekly_waste_report();');
