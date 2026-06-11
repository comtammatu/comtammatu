-- Canonical position codes — lean set, dọn tận gốc alias 2 thứ tiếng.
--
-- Trước migration này `positions.code` còn 8 mã tiếng Việt legacy và 3 hàm SQL
-- phải gánh bảng alias song ngữ; cron push còn so position code thô với
-- `notifications.target_roles` (chứa access bucket) nên Quản lý chi nhánh
-- (`quan_ly_CN`) không bao giờ nhận push.
--
-- Sau migration: bộ mã canonical CHỈ còn 11 mã English
--   owner, super_manager, branch_manager, warehouse_manager,
--   production_manager, head_chef, kitchen_helper, chef, cashier, waiter, office
-- Các mã warehouse_head / warehouse_keeper / executive_assistant /
-- chief_accountant / accountant bị LOẠI HẲN (quyết định owner 2026-06-10,
-- hướng HKD lean). `label_vi` giữ nguyên — UI vẫn hiển thị tiếng Việt.
-- Twin TypeScript của mapper: POSITION_CODE_TO_STAFF_ROLE
-- (packages/shared/src/auth/types.ts) — sửa đồng bộ trong cùng PR.
--
-- Data-only + function bodies; không DDL schema → không cần `pnpm db:types`.
-- Replayable: mọi bước data no-op trên DB rỗng; DO block cuối tự kiểm và
-- RAISE (rollback nguyên transaction) nếu còn mã rác hoặc profile nào map ra
-- bucket NULL (điều kiện làm hỏng đăng nhập qua auth hook).

BEGIN;

-- ─── S1. Bảng map (1 nguồn sự thật trong migration) ─────────────────────────

CREATE TEMP TABLE legacy_code_map (
  old_code text PRIMARY KEY,
  action text NOT NULL CHECK (action IN ('rename', 'delete')),
  new_position_code text,      -- đích rename (NULL với nhóm delete)
  fallback_position_code text, -- đích repoint hờ trước khi delete
  bucket text NOT NULL
) ON COMMIT DROP;

INSERT INTO legacy_code_map
  (old_code, action, new_position_code, fallback_position_code, bucket)
VALUES
  ('quan_ly_CN',      'rename', 'branch_manager',    NULL,                'branch_manager'),
  ('kho_truong',      'rename', 'warehouse_manager', NULL,                'warehouse_manager'),
  ('bep_truong',      'rename', 'head_chef',         NULL,                'production_manager'),
  ('phu_bep',         'rename', 'kitchen_helper',    NULL,                'chef'),
  ('thu_kho',         'delete', NULL,                'warehouse_manager', 'warehouse_manager'),
  ('ke_toan',         'delete', NULL,                'office',            'office'),
  ('ke_toan_truong',  'delete', NULL,                'office',            'office'),
  ('tro_ly_giam_doc', 'delete', NULL,                'super_manager',     'super_manager');

-- target_roles của notifications mang access BUCKET (RLS notifications_select
-- so bằng auth_role()); chuẩn hóa mọi position code / mã chết còn sót về bucket.
CREATE TEMP TABLE notif_role_map (
  old_value text PRIMARY KEY,
  new_value text NOT NULL
) ON COMMIT DROP;

INSERT INTO notif_role_map (old_value, new_value)
SELECT old_code, bucket FROM legacy_code_map
UNION ALL
VALUES
  -- vai trò vùng đã loại bỏ (token viết nối chuỗi theo guard
  -- auth-intermediate-scope-static.test.ts)
  (('ar' || 'ea_manager'),  'super_manager'),
  ('quan_ly_vung',         'super_manager'),
  ('warehouse_head',       'warehouse_manager'),
  ('warehouse_keeper',     'warehouse_manager'),
  ('executive_assistant',  'super_manager'),
  ('chief_accountant',     'office'),
  ('accountant',           'office'),
  ('head_chef',            'production_manager'),
  ('kitchen_helper',       'chef');

-- Tenant thực sự bị đụng — dùng cho assertion bucket-resolution cuối file
-- (tránh chặn oan môi trường replay không có dữ liệu legacy).
CREATE TEMP TABLE touched_tenants ON COMMIT DROP AS
SELECT DISTINCT tenant_id
FROM public.positions
WHERE code IN (SELECT old_code FROM legacy_code_map);

-- ─── S2. Nhóm rename: guard twin (no-op trên prod — đã xác minh 0 va chạm) ──

UPDATE public.profiles p
SET position_id = eng.id, updated_at = now()
FROM public.positions legacy
JOIN legacy_code_map m
  ON m.old_code = legacy.code AND m.action = 'rename'
JOIN public.positions eng
  ON eng.tenant_id = legacy.tenant_id AND eng.code = m.new_position_code
WHERE p.position_id = legacy.id
  AND p.tenant_id = legacy.tenant_id;

DELETE FROM public.positions legacy
USING legacy_code_map m, public.positions eng
WHERE legacy.code = m.old_code
  AND m.action = 'rename'
  AND eng.tenant_id = legacy.tenant_id
  AND eng.code = m.new_position_code;

-- ─── S3. Rename (positions không có cột updated_at) ────────────────────────

UPDATE public.positions po
SET code = m.new_position_code
FROM legacy_code_map m
WHERE po.code = m.old_code
  AND m.action = 'rename';

-- ─── S4. Nhóm delete: repoint hờ rồi xóa ───────────────────────────────────
-- Prod đã xác minh 0 profile (kể cả inactive) trên 4 mã này; repoint chỉ là
-- guard cho môi trường replay. Nếu fallback thiếu mà vẫn còn profile, FK
-- profiles.position_id ON DELETE RESTRICT sẽ nổ → rollback nguyên transaction.

UPDATE public.profiles p
SET position_id = fb.id, updated_at = now()
FROM public.positions legacy
JOIN legacy_code_map m
  ON m.old_code = legacy.code AND m.action = 'delete'
JOIN public.positions fb
  ON fb.tenant_id = legacy.tenant_id AND fb.code = m.fallback_position_code
WHERE p.position_id = legacy.id
  AND p.tenant_id = legacy.tenant_id;

DELETE FROM public.positions po
USING legacy_code_map m
WHERE po.code = m.old_code
  AND m.action = 'delete';

-- ─── S5. role_templates: dedupe guard → rename nhóm rename, xóa nhóm loại ──
-- Xóa template an toàn: grant đã cấp nằm ở staff_permissions
-- (FK source_template ON DELETE SET NULL); template chỉ là preset lúc tạo user.

DELETE FROM public.role_templates legacy
USING legacy_code_map m
WHERE legacy.position_code = m.old_code
  AND m.action = 'rename'
  AND EXISTS (
    SELECT 1 FROM public.role_templates eng
    WHERE eng.tenant_id = legacy.tenant_id
      AND eng.position_code = m.new_position_code
  );

UPDATE public.role_templates rt
SET position_code = m.new_position_code, updated_at = now()
FROM legacy_code_map m
WHERE rt.position_code = m.old_code
  AND m.action = 'rename';

DELETE FROM public.role_templates rt
USING legacy_code_map m
WHERE rt.position_code = m.old_code
  AND m.action = 'delete';

DELETE FROM public.role_templates
WHERE position_code IN (
  'warehouse_head', 'warehouse_keeper', 'executive_assistant',
  'chief_accountant', 'accountant'
);

-- ─── S6. notifications.target_roles: chuẩn hóa về bucket ───────────────────
-- array_agg(DISTINCT COALESCE(...)) total trên input không rỗng → không thể
-- vi phạm CHECK (array_length(target_roles, 1) >= 1).

UPDATE public.notifications n
SET target_roles = sub.new_roles
FROM (
  SELECT n2.id,
         array_agg(DISTINCT COALESCE(nm.new_value, r.role)) AS new_roles
  FROM public.notifications n2
  CROSS JOIN LATERAL unnest(n2.target_roles) AS r(role)
  LEFT JOIN notif_role_map nm ON nm.old_value = r.role
  WHERE n2.target_roles && (SELECT array_agg(old_value) FROM notif_role_map)
  GROUP BY n2.id
) sub
WHERE n.id = sub.id;

-- ─── S7. auth.users.raw_app_meta_data: backfill mã mới ─────────────────────
-- Thứ yếu (custom_access_token_hook tính lại claim từ profiles → positions ở
-- mỗi lần phát token) nhưng admin_update_profile ghi trực tiếp vào đây nên
-- giữ cho dữ liệu trung thực.

UPDATE auth.users u
SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
       'position', COALESCE(m.new_position_code, m.fallback_position_code),
       'position_code', COALESCE(m.new_position_code, m.fallback_position_code)
     )
FROM legacy_code_map m
WHERE u.raw_app_meta_data->>'position' = m.old_code
   OR u.raw_app_meta_data->>'position_code' = m.old_code;

UPDATE auth.users u
SET raw_app_meta_data = u.raw_app_meta_data || jsonb_build_object('role', m.bucket)
FROM legacy_code_map m
WHERE u.raw_app_meta_data->>'role' = m.old_code;

UPDATE auth.users u
SET raw_app_meta_data = u.raw_app_meta_data || jsonb_build_object('user_role', m.bucket)
FROM legacy_code_map m
WHERE u.raw_app_meta_data->>'user_role' = m.old_code;

UPDATE auth.users u
SET raw_app_meta_data = u.raw_app_meta_data || jsonb_build_object('access_bucket', m.bucket)
FROM legacy_code_map m
WHERE u.raw_app_meta_data->>'access_bucket' = m.old_code;

-- ─── S8. Ba hàm mapper: English-only, đúng 11 mã ───────────────────────────

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
    WHEN 'branch_manager'     THEN 'branch_manager'
    WHEN 'warehouse_manager'  THEN 'warehouse_manager'
    WHEN 'production_manager' THEN 'production_manager'
    WHEN 'head_chef'          THEN 'production_manager'
    WHEN 'kitchen_helper'     THEN 'chef'
    WHEN 'chef'               THEN 'chef'
    WHEN 'cashier'            THEN 'cashier'
    WHEN 'waiter'             THEN 'waiter'
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
    WHEN 'branch_manager'     THEN 'branch_manager'
    WHEN 'warehouse_manager'  THEN 'warehouse_manager'
    WHEN 'production_manager' THEN 'head_chef'
    WHEN 'head_chef'          THEN 'head_chef'
    WHEN 'kitchen_helper'     THEN 'kitchen_helper'
    WHEN 'chef'               THEN 'chef'
    WHEN 'cashier'            THEN 'cashier'
    WHEN 'waiter'             THEN 'waiter'
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
      WHEN 'owner'              THEN 0
      WHEN 'super_manager'      THEN 0
      WHEN 'branch_manager'     THEN 0
      WHEN 'warehouse_manager'  THEN 0
      WHEN 'head_chef'          THEN 0
      WHEN 'chef'               THEN 0
      WHEN 'cashier'            THEN 0
      WHEN 'waiter'             THEN 0
      WHEN 'office'             THEN 0
      WHEN 'kitchen_helper'     THEN 1
      WHEN 'production_manager' THEN 1
      ELSE 9
    END,
    po.id
  LIMIT 1;
$$;

-- ACL/owner được Postgres giữ qua CREATE OR REPLACE; re-assert theo convention.
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

COMMENT ON FUNCTION private.staff_role_from_position_code(text) IS
  'SQL twin of POSITION_CODE_TO_STAFF_ROLE (packages/shared/src/auth/types.ts). Canonical English codes only (11) — no aliases. ELSE NULL is fail-closed: auth hook RAISEs on unknown codes.';
COMMENT ON FUNCTION public.auth_role_to_position(text) IS
  'Maps access buckets to the canonical HR position code used at Auth user creation. English-only since 20260610230000.';
COMMENT ON FUNCTION public.position_id_from_access_bucket(text, bigint) IS
  'Resolves an access bucket to the tenant HR position used when Auth creates a profile. Canonical English codes only.';

-- ─── S9. notifications_select: bỏ vai trò vùng đã loại khỏi nhánh tenant-wide ──

ALTER POLICY notifications_select ON public.notifications
USING (
  tenant_id = public.auth_tenant_id()
  AND public.auth_role() = ANY (target_roles)
  AND (
    target_branch_id IS NULL
    OR target_branch_id = public.auth_branch_id()
    OR public.auth_role() = ANY (ARRAY['owner'::text, 'super_manager'::text])
  )
);

-- ─── S10. Tự kiểm — fail là rollback nguyên transaction ────────────────────

DO $$
DECLARE
  v_count integer;
  v_detail text;
  v_retired text[] := ARRAY[
    'quan_ly_CN', 'kho_truong', 'thu_kho', 'bep_truong', 'phu_bep',
    'ke_toan', 'ke_toan_truong', 'tro_ly_giam_doc',
    'quan_ly_vung', ('ar' || 'ea_manager'),
    'warehouse_head', 'warehouse_keeper', 'executive_assistant',
    'chief_accountant', 'accountant'
  ];
  v_bucket text;
  v_tenant bigint;
BEGIN
  SELECT count(*), string_agg(DISTINCT code, ', ')
    INTO v_count, v_detail
  FROM public.positions
  WHERE code = ANY (v_retired);
  IF v_count > 0 THEN
    RAISE EXCEPTION 'positions still carry retired codes (%): %', v_count, v_detail;
  END IF;

  SELECT count(*), string_agg(DISTINCT position_code, ', ')
    INTO v_count, v_detail
  FROM public.role_templates
  WHERE position_code = ANY (v_retired);
  IF v_count > 0 THEN
    RAISE EXCEPTION 'role_templates still carry retired codes (%): %', v_count, v_detail;
  END IF;

  SELECT count(*) INTO v_count
  FROM (
    SELECT tenant_id, position_code
    FROM public.role_templates
    WHERE position_code IS NOT NULL
    GROUP BY tenant_id, position_code
    HAVING count(*) > 1
  ) dup;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'role_templates has % duplicate (tenant_id, position_code) keys', v_count;
  END IF;

  -- Bất biến lõi: mọi profile (kể cả inactive) phải map ra bucket khác NULL,
  -- nếu không auth hook sẽ RAISE và chặn đăng nhập.
  SELECT count(*) INTO v_count
  FROM public.profiles p
  JOIN public.positions po ON po.id = p.position_id
  WHERE private.staff_role_from_position_code(po.code) IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION '% profiles map to NULL access bucket — would brick logins', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.notifications
  WHERE target_roles && v_retired;
  IF v_count > 0 THEN
    RAISE EXCEPTION '% notifications still carry retired values in target_roles', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM auth.users u
  WHERE u.raw_app_meta_data->>'position' = ANY (v_retired)
     OR u.raw_app_meta_data->>'position_code' = ANY (v_retired)
     OR u.raw_app_meta_data->>'role' = ANY (v_retired)
     OR u.raw_app_meta_data->>'user_role' = ANY (v_retired)
     OR u.raw_app_meta_data->>'access_bucket' = ANY (v_retired);
  IF v_count > 0 THEN
    RAISE EXCEPTION '% auth.users rows still carry retired codes in app metadata', v_count;
  END IF;

  -- Mỗi bucket vận hành phải resolve được position trên các tenant bị đụng
  -- bởi migration này (đường tạo user mới không được gãy).
  FOR v_tenant IN SELECT tenant_id FROM touched_tenants LOOP
    FOREACH v_bucket IN ARRAY ARRAY[
      'owner', 'super_manager', 'branch_manager', 'warehouse_manager',
      'production_manager', 'chef', 'cashier', 'waiter', 'office'
    ] LOOP
      IF public.position_id_from_access_bucket(v_bucket, v_tenant) IS NULL THEN
        RAISE EXCEPTION 'bucket % cannot resolve a position for tenant %', v_bucket, v_tenant;
      END IF;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
