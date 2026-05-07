-- =========================================================================
-- HR Phase 3a — Shift Request permission keys + role template seeds
--
-- Adds 2 permission keys for the upcoming "đăng ký ca làm" (employee
-- shift registration) workflow. The actual `shift_requests` table + RLS
-- + RPCs land in PR2 (h3b_shift_requests_table.sql); this PR ships only
-- the catalog rows + role_template grants so the UI gating layer can be
-- wired before any new schema lands.
--
-- Permission design:
--   hr:register_shift          — employee submits availability/preference
--                                for a future date+shift (Mode A)
--   hr:approve_shift_request   — branch_manager+ converts a pending
--                                request into a shift_assignments row
--
-- Role assignments (additive — existing templates unaffected for other keys):
--   register_shift:
--     waiter, cashier, chef, phu_bep, thu_kho, kho_truong, bep_truong,
--     quan_ly_CN, quan_ly_vung, ke_toan, ke_toan_truong, office,
--     tro_ly_giam_doc, super_manager, owner
--     (everyone except non-position roles — owner inherits via owner template
--      below; super_manager added explicitly for clarity)
--   approve_shift_request:
--     quan_ly_CN, quan_ly_vung, super_manager, owner
-- =========================================================================

-- ─── 1. Seed permission_keys catalog ────────────────────────────────────

INSERT INTO public.permission_keys (key, module, description, scope) VALUES
  ('hr:register_shift',        'hr', 'Đăng ký ca làm (gửi nguyện vọng cho tuần)', 'branch'),
  ('hr:approve_shift_request', 'hr', 'Duyệt đăng ký ca và tạo phân ca',          'branch')
ON CONFLICT (key) DO NOTHING;

-- ─── 2. Back-fill role_templates for existing tenants ───────────────────
--
-- APPEND new keys to existing permission_keys arrays so this migration is
-- safe to re-run even if templates have been customised post-seeding.

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP

    -- ─ register_shift: every shift-working position ─

    UPDATE public.role_templates
    SET permission_keys = ARRAY(
      SELECT DISTINCT unnest(permission_keys || ARRAY['hr:register_shift']) ORDER BY 1
    )
    WHERE tenant_id = t.id
      AND position_code IN (
        'waiter', 'cashier', 'chef', 'phu_bep',
        'thu_kho', 'kho_truong', 'bep_truong',
        'quan_ly_CN', 'quan_ly_vung',
        'ke_toan', 'ke_toan_truong', 'office', 'tro_ly_giam_doc',
        'super_manager', 'owner'
      );

    -- ─ approve_shift_request: management positions only ─

    UPDATE public.role_templates
    SET permission_keys = ARRAY(
      SELECT DISTINCT unnest(permission_keys || ARRAY['hr:approve_shift_request']) ORDER BY 1
    )
    WHERE tenant_id = t.id
      AND position_code IN ('quan_ly_CN', 'quan_ly_vung', 'super_manager', 'owner');

  END LOOP;
END $$;
