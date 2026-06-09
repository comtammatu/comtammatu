-- Keep Auth user creation helpers on access buckets and positions.code.
-- New profiles resolve HR display positions without relying on retired role columns.

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

REVOKE ALL ON FUNCTION public.auth_role_to_position(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_role_to_position(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_role_to_position(text) TO service_role;

REVOKE ALL ON FUNCTION public.position_id_from_access_bucket(text, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.position_id_from_access_bucket(text, bigint)
  TO service_role;

COMMENT ON FUNCTION public.auth_role_to_position(text) IS
  'Maps access buckets and active position-code aliases to canonical HR position codes for Auth user creation.';
COMMENT ON FUNCTION public.position_id_from_access_bucket(text, bigint) IS
  'Resolves an access bucket or position-code alias to the tenant HR position used when Auth creates a profile.';
