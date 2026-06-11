-- DOWN cho 20260610230000_canonical_position_codes_lean.sql.
-- Áp dụng như một forward migration mới nếu owner cần đảo.
--
-- Giới hạn chủ đích (không khôi phục):
-- * role_templates đã xóa (thu_kho/ke_toan/ke_toan_truong/tro_ly_giam_doc):
--   grant đã cấp KHÔNG mất (nằm ở staff_permissions); tạo lại preset bằng tay
--   nếu thật sự cần tuyển vị trí đó.
-- * Rác notifications.target_roles (area_manager/quan_ly_vung/...) — giữ bucket.
-- * Policy notifications_select đã bỏ 'area_manager' — mapper không bao giờ
--   phát ra giá trị này nên khôi phục là vô nghĩa.
-- JWT tự lành 2 chiều khi refresh (≤1h); user_role/grants không đổi cả 2 chiều.

BEGIN;

-- Đảo rename positions
UPDATE public.positions SET code = 'quan_ly_CN' WHERE code = 'branch_manager';
UPDATE public.positions SET code = 'kho_truong' WHERE code = 'warehouse_manager';
UPDATE public.positions SET code = 'bep_truong' WHERE code = 'head_chef';
UPDATE public.positions SET code = 'phu_bep'    WHERE code = 'kitchen_helper';

-- Đảo rename role_templates
UPDATE public.role_templates SET position_code = 'quan_ly_CN', updated_at = now() WHERE position_code = 'branch_manager';
UPDATE public.role_templates SET position_code = 'kho_truong', updated_at = now() WHERE position_code = 'warehouse_manager';
UPDATE public.role_templates SET position_code = 'bep_truong', updated_at = now() WHERE position_code = 'head_chef';
UPDATE public.role_templates SET position_code = 'phu_bep',    updated_at = now() WHERE position_code = 'kitchen_helper';

-- Tạo lại 4 position đã xóa (label_vi như prod trước cleanup)
INSERT INTO public.positions (tenant_id, code, label_vi, label_en, is_active, is_system)
SELECT t.id, v.code, v.label_vi, v.label_en, true, true
FROM public.tenants t
CROSS JOIN (VALUES
  ('thu_kho',         'Thủ kho',           'Warehouse Keeper'),
  ('ke_toan',         'Kế toán',           'Accountant'),
  ('ke_toan_truong',  'Kế toán trưởng',    'Chief Accountant'),
  ('tro_ly_giam_doc', 'Trợ lý giám đốc',   'Executive Assistant')
) AS v(code, label_vi, label_en)
ON CONFLICT (code, tenant_id) DO NOTHING;

-- Đảo backfill auth.users metadata
UPDATE auth.users u
SET raw_app_meta_data = u.raw_app_meta_data
  || jsonb_build_object('position', 'quan_ly_CN', 'position_code', 'quan_ly_CN')
WHERE u.raw_app_meta_data->>'position' = 'branch_manager'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.positions po ON po.id = p.position_id
    WHERE p.id = u.id AND po.code = 'quan_ly_CN'
  );

-- Khôi phục 3 thân hàm alias song ngữ (verbatim từ 20260609103000 + 20260609131000)

CREATE OR REPLACE FUNCTION private.staff_role_from_position_code(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE p_code
    WHEN 'owner'              THEN 'owner'
    WHEN 'super_manager'      THEN 'super_manager'
    WHEN 'executive_assistant' THEN 'super_manager'
    WHEN 'tro_ly_giam_doc'    THEN 'super_manager'
    WHEN 'branch_manager'     THEN 'branch_manager'
    WHEN 'quan_ly_CN'         THEN 'branch_manager'
    WHEN 'warehouse_head'     THEN 'warehouse_manager'
    WHEN 'kho_truong'         THEN 'warehouse_manager'
    WHEN 'warehouse_keeper'   THEN 'warehouse_manager'
    WHEN 'thu_kho'            THEN 'warehouse_manager'
    WHEN 'warehouse_manager'  THEN 'warehouse_manager'
    WHEN 'head_chef'          THEN 'production_manager'
    WHEN 'bep_truong'         THEN 'production_manager'
    WHEN 'production_manager' THEN 'production_manager'
    WHEN 'chef'               THEN 'chef'
    WHEN 'kitchen_helper'     THEN 'chef'
    WHEN 'phu_bep'            THEN 'chef'
    WHEN 'cashier'            THEN 'cashier'
    WHEN 'waiter'             THEN 'waiter'
    WHEN 'chief_accountant'   THEN 'office'
    WHEN 'ke_toan_truong'     THEN 'office'
    WHEN 'accountant'         THEN 'office'
    WHEN 'ke_toan'            THEN 'office'
    WHEN 'office'             THEN 'office'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.auth_role_to_position(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE p_role
    WHEN 'owner'              THEN 'owner'
    WHEN 'super_manager'      THEN 'super_manager'
    WHEN 'executive_assistant' THEN 'tro_ly_giam_doc'
    WHEN 'tro_ly_giam_doc'    THEN 'tro_ly_giam_doc'
    WHEN 'branch_manager'     THEN 'quan_ly_CN'
    WHEN 'quan_ly_CN'         THEN 'quan_ly_CN'
    WHEN 'warehouse_manager'  THEN 'kho_truong'
    WHEN 'warehouse_head'     THEN 'kho_truong'
    WHEN 'warehouse_keeper'   THEN 'thu_kho'
    WHEN 'kho_truong'         THEN 'kho_truong'
    WHEN 'thu_kho'            THEN 'thu_kho'
    WHEN 'production_manager' THEN 'bep_truong'
    WHEN 'head_chef'          THEN 'bep_truong'
    WHEN 'bep_truong'         THEN 'bep_truong'
    WHEN 'kitchen_helper'     THEN 'phu_bep'
    WHEN 'phu_bep'            THEN 'phu_bep'
    WHEN 'cashier'            THEN 'cashier'
    WHEN 'waiter'             THEN 'waiter'
    WHEN 'chef'               THEN 'chef'
    WHEN 'chief_accountant'   THEN 'ke_toan_truong'
    WHEN 'ke_toan_truong'     THEN 'ke_toan_truong'
    WHEN 'accountant'         THEN 'ke_toan'
    WHEN 'ke_toan'            THEN 'ke_toan'
    WHEN 'office'             THEN 'office'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.position_id_from_access_bucket(
  p_access_bucket text,
  p_tenant bigint
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH resolved AS (
    SELECT
      public.auth_role_to_position(p_access_bucket) AS preferred_position_code,
      COALESCE(
        private.staff_role_from_position_code(public.auth_role_to_position(p_access_bucket)),
        p_access_bucket
      ) AS access_bucket
  )
  SELECT po.id
  FROM public.positions po
  CROSS JOIN resolved r
  WHERE po.tenant_id = p_tenant
    AND COALESCE(po.is_active, true) = true
    AND private.staff_role_from_position_code(po.code) = r.access_bucket
  ORDER BY
    CASE WHEN po.code = r.preferred_position_code THEN -1 ELSE 0 END,
    CASE po.code
      WHEN 'owner' THEN 0
      WHEN 'super_manager' THEN 0
      WHEN 'tro_ly_giam_doc' THEN 1
      WHEN 'branch_manager' THEN 0
      WHEN 'quan_ly_CN' THEN 1
      WHEN 'warehouse_head' THEN 0
      WHEN 'kho_truong' THEN 1
      WHEN 'warehouse_keeper' THEN 2
      WHEN 'thu_kho' THEN 3
      WHEN 'head_chef' THEN 0
      WHEN 'bep_truong' THEN 1
      WHEN 'chef' THEN 0
      WHEN 'phu_bep' THEN 1
      WHEN 'cashier' THEN 0
      WHEN 'waiter' THEN 0
      WHEN 'office' THEN 0
      WHEN 'ke_toan' THEN 1
      WHEN 'ke_toan_truong' THEN 2
      ELSE 9
    END,
    po.id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.staff_role_from_position_code(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.staff_role_from_position_code(text)
  TO service_role;
REVOKE ALL ON FUNCTION public.auth_role_to_position(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_role_to_position(text)
  TO service_role;
REVOKE ALL ON FUNCTION public.position_id_from_access_bucket(text, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.position_id_from_access_bucket(text, bigint)
  TO service_role;

COMMIT;
