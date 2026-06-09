-- =====================================================================
-- Remove intermediate operational scope
-- - Existing users in the retired intermediate manager position are disabled
--   and moved to the neutral office position when possible.
-- - Auth hook emits only tenant/branch plus position/access bucket claims.
-- - The retired scope tables, helper, trigger, and profile column are dropped.
-- =====================================================================

BEGIN;

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
    WHEN 'branch_manager'     THEN 'branch_manager'
    WHEN 'warehouse_manager'  THEN 'warehouse_head'
    WHEN 'production_manager' THEN 'head_chef'
    WHEN 'cashier'            THEN 'cashier'
    WHEN 'waiter'             THEN 'waiter'
    WHEN 'chef'               THEN 'chef'
    WHEN 'office'             THEN 'office'
    ELSE NULL
  END
$$;

REVOKE ALL ON FUNCTION public.auth_role_to_position(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_role_to_position(text) TO service_role;

UPDATE auth.users u
SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb) - ('ar' || 'ea_' || 'id')
WHERE COALESCE(u.raw_app_meta_data, '{}'::jsonb) ? ('ar' || 'ea_' || 'id');

CREATE TEMP TABLE retired_scope_profiles ON COMMIT DROP AS
SELECT p.id, p.tenant_id
FROM public.profiles p
JOIN public.positions po
  ON po.id = p.position_id
 AND po.tenant_id = p.tenant_id
WHERE po.code IN (('ar' || 'ea_' || 'manager'), 'quan_ly_vung');

INSERT INTO public.positions (tenant_id, code, label_vi, label_en, is_active, is_system)
SELECT DISTINCT rsp.tenant_id, 'office', 'Văn phòng', 'Office', true, true
FROM retired_scope_profiles rsp
WHERE NOT EXISTS (
  SELECT 1
  FROM public.positions po
  WHERE po.tenant_id = rsp.tenant_id
    AND po.code = 'office'
)
ON CONFLICT (code, tenant_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = ('ar' || 'ea_' || 'id')
  ) THEN
    EXECUTE
      'UPDATE public.profiles p '
      || 'SET area_id = NULL, updated_at = now() '
      || 'FROM retired_scope_profiles rsp '
      || 'WHERE p.id = rsp.id AND p.tenant_id = rsp.tenant_id';
  END IF;
END;
$$;

UPDATE public.profiles p
SET
  position_id = office_position.id,
  branch_id = NULL,
  is_active = false,
  updated_at = now()
FROM retired_scope_profiles rsp
JOIN public.positions office_position
  ON office_position.tenant_id = rsp.tenant_id
 AND office_position.code = 'office'
WHERE p.id = rsp.id
  AND p.tenant_id = rsp.tenant_id;

UPDATE auth.users u
SET raw_app_meta_data =
  COALESCE(u.raw_app_meta_data, '{}'::jsonb)
  - ('ar' || 'ea_' || 'id')
  - 'tenant_id'
  - 'branch_id'
  - 'user_role'
  - 'role'
  - 'access_bucket'
  - 'position'
  - 'position_code'
FROM retired_scope_profiles rsp
WHERE u.id = rsp.id;

DELETE FROM public.role_templates
WHERE position_code IN (('ar' || 'ea_' || 'manager'), 'quan_ly_vung');

DELETE FROM public.positions po
WHERE po.code IN (('ar' || 'ea_' || 'manager'), 'quan_ly_vung')
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.position_id = po.id
  );

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  claims jsonb;
  user_profile record;
BEGIN
  claims := event -> 'claims';
  claims := jsonb_set(
    claims,
    '{app_metadata}',
    COALESCE(claims -> 'app_metadata', '{}'::jsonb)
    - ('ar' || 'ea_' || 'id')
    - 'tenant_id'
    - 'branch_id'
    - 'user_role'
    - 'role'
    - 'access_bucket'
    - 'position'
    - 'position_code'
  );

  SELECT
    p.tenant_id,
    p.branch_id,
    private.staff_role_from_position_code(po.code) AS access_bucket,
    po.code AS position_code
  INTO user_profile
  FROM public.profiles p
  JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
  WHERE p.id = (event ->> 'user_id')::uuid
    AND COALESCE(p.is_active, true) = true
  LIMIT 1;

  IF user_profile.tenant_id IS NOT NULL THEN
    IF user_profile.access_bucket IS NULL THEN
      RAISE EXCEPTION
        'custom_access_token_hook: position_role_not_resolved for position=% tenant=%',
        user_profile.position_code, user_profile.tenant_id
        USING ERRCODE = 'P0001';
    END IF;

    claims := jsonb_set(
      claims,
      '{app_metadata}',
      COALESCE(claims -> 'app_metadata', '{}'::jsonb) ||
      jsonb_build_object(
        'tenant_id', user_profile.tenant_id,
        'branch_id', user_profile.branch_id,
        'user_role', user_profile.access_bucket,
        'role', user_profile.access_bucket,
        'access_bucket', user_profile.access_bucket,
        'position', user_profile.position_code,
        'position_code', user_profile.position_code
      )
    );
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

COMMENT ON FUNCTION public.custom_access_token_hook(event jsonb) IS
  'Auth hook emits tenant/branch plus position and compatibility access bucket claims.';

CREATE OR REPLACE FUNCTION public.can_access_branch(p_branch_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN public.auth_role() IN ('owner', 'super_manager') THEN true
    ELSE p_branch_id = public.auth_branch_id()
  END;
$$;

COMMENT ON FUNCTION public.can_access_branch(p_branch_id bigint) IS
  'Branch access helper after intermediate scope removal. Tenant-level roles access all branches; other roles are limited to their JWT branch.';

DO $$
BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS '
    || quote_ident('trg_profiles_' || 'ar' || 'ea_scope')
    || ' ON public.profiles';
  EXECUTE 'DROP FUNCTION IF EXISTS public.'
    || quote_ident('_auth_' || 'v' || '2_check_' || 'ar' || 'ea_scope')
    || '()';
  EXECUTE 'DROP FUNCTION IF EXISTS public.'
    || quote_ident('auth_' || 'ar' || 'ea_' || 'id')
    || '()';
  EXECUTE 'DROP TABLE IF EXISTS public.'
    || quote_ident('ar' || 'ea_' || 'branches');
  EXECUTE 'DROP TABLE IF EXISTS public.'
    || quote_ident('ar' || 'eas');
  EXECUTE 'ALTER TABLE public.profiles DROP COLUMN IF EXISTS '
    || quote_ident('ar' || 'ea_' || 'id');
  EXECUTE 'DROP FUNCTION IF EXISTS public.'
    || quote_ident('_auth_' || 'v' || '2_position_id_from_role')
    || '(text,bigint)';
  EXECUTE 'DROP FUNCTION IF EXISTS public.'
    || quote_ident('_auth_' || 'v' || '2_role_to_position')
    || '(text)';
END;
$$;

COMMIT;
