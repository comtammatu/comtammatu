-- =========================================================================
-- feedback module — Slice 1: permission keys + role template updates
--
-- Adds 6 permission keys to the global catalog and back-fills them into
-- the relevant role_templates for all existing tenants.
--
-- Permission design:
--   feedback:view           — read feedback list (branch-scoped)
--   feedback:view_phone     — see unmasked phone (sensitive, restricted roles)
--   feedback:view_report    — aggregate/trend reports (Slice 3)
--   feedback:manage_qr      — create/rotate/deactivate QR codes
--   feedback:manage_telegram — configure Telegram alert destinations
--   feedback:manage_settings — module config (thresholds, routing, Slice 3)
--
-- Role assignments (additive — existing templates unaffected for other keys):
--   owner, super_manager      → all 6 keys
--   quan_ly_CN (branch mgr)   → view + manage_qr + manage_telegram
--   quan_ly_vung (area mgr)   → view + view_phone + manage_qr + manage_telegram
--   tro_ly_giam_doc           → view + view_report
--   ke_toan_truong            → view_report
--   ke_toan                   → view_report
-- =========================================================================

-- ─── 1. Seed permission_keys catalog ────────────────────────────────────

INSERT INTO public.permission_keys (key, module, description, scope) VALUES
  ('feedback:view',             'feedback', 'Xem danh sách phản ánh khách hàng',   'branch'),
  ('feedback:view_phone',       'feedback', 'Xem số điện thoại thực của khách',    'branch'),
  ('feedback:view_report',      'feedback', 'Xem báo cáo & xu hướng phản ánh',    'either'),
  ('feedback:manage_qr',        'feedback', 'Tạo/xoay/vô hiệu hoá mã QR phản ánh', 'branch'),
  ('feedback:manage_telegram',  'feedback', 'Cấu hình đích nhận alert Telegram',   'either'),
  ('feedback:manage_settings',  'feedback', 'Cấu hình module phản ánh (ngưỡng, định tuyến)', 'either')
ON CONFLICT (key) DO NOTHING;

-- ─── 2. Back-fill role_templates for existing tenants ───────────────────
--
-- We APPEND the new keys to existing permission_keys arrays rather than
-- replacing them, so this migration is safe to run even if templates have
-- been customised post-seeding.

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP

    -- owner: all feedback keys (owner template tracks all keys via SELECT subquery;
    -- safer to upsert the full key list rather than append to avoid drift)
    UPDATE public.role_templates
    SET permission_keys = ARRAY(
      SELECT DISTINCT unnest(permission_keys || ARRAY[
        'feedback:view',
        'feedback:view_phone',
        'feedback:view_report',
        'feedback:manage_qr',
        'feedback:manage_telegram',
        'feedback:manage_settings'
      ]) ORDER BY 1
    )
    WHERE tenant_id = t.id AND position_code = 'owner';

    -- super_manager: all feedback keys
    UPDATE public.role_templates
    SET permission_keys = ARRAY(
      SELECT DISTINCT unnest(permission_keys || ARRAY[
        'feedback:view',
        'feedback:view_phone',
        'feedback:view_report',
        'feedback:manage_qr',
        'feedback:manage_telegram',
        'feedback:manage_settings'
      ]) ORDER BY 1
    )
    WHERE tenant_id = t.id AND position_code = 'super_manager';

    -- quan_ly_CN (branch manager): view + manage_qr + manage_telegram
    UPDATE public.role_templates
    SET permission_keys = ARRAY(
      SELECT DISTINCT unnest(permission_keys || ARRAY[
        'feedback:view',
        'feedback:manage_qr',
        'feedback:manage_telegram'
      ]) ORDER BY 1
    )
    WHERE tenant_id = t.id AND position_code = 'quan_ly_CN';

    -- quan_ly_vung (area manager): view + view_phone + manage_qr + manage_telegram
    UPDATE public.role_templates
    SET permission_keys = ARRAY(
      SELECT DISTINCT unnest(permission_keys || ARRAY[
        'feedback:view',
        'feedback:view_phone',
        'feedback:manage_qr',
        'feedback:manage_telegram'
      ]) ORDER BY 1
    )
    WHERE tenant_id = t.id AND position_code = 'quan_ly_vung';

    -- tro_ly_giam_doc: view + view_report (read-only analytics access)
    UPDATE public.role_templates
    SET permission_keys = ARRAY(
      SELECT DISTINCT unnest(permission_keys || ARRAY[
        'feedback:view',
        'feedback:view_report'
      ]) ORDER BY 1
    )
    WHERE tenant_id = t.id AND position_code = 'tro_ly_giam_doc';

    -- ke_toan_truong: view_report only
    UPDATE public.role_templates
    SET permission_keys = ARRAY(
      SELECT DISTINCT unnest(permission_keys || ARRAY[
        'feedback:view_report'
      ]) ORDER BY 1
    )
    WHERE tenant_id = t.id AND position_code = 'ke_toan_truong';

    -- ke_toan: view_report only
    UPDATE public.role_templates
    SET permission_keys = ARRAY(
      SELECT DISTINCT unnest(permission_keys || ARRAY[
        'feedback:view_report'
      ]) ORDER BY 1
    )
    WHERE tenant_id = t.id AND position_code = 'ke_toan';

  END LOOP;
END $$;
