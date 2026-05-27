-- =============================================================
-- Greenfield PBAC cleanup: canonical position codes.
--
-- Runtime code reads positions.code as English lower_snake_case. Vietnamese
-- labels belong in label_vi; authorization buckets are derived separately.
-- =============================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._auth_v2_role_to_position(p_role TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE p_role
    WHEN 'owner'              THEN 'owner'
    WHEN 'super_manager'      THEN 'super_manager'
    WHEN 'area_manager'       THEN 'area_manager'
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

REVOKE EXECUTE ON FUNCTION public._auth_v2_role_to_position(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._auth_v2_role_to_position(TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION private.staff_role_from_position_code(
  p_position_code TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_position_code
    WHEN 'owner'               THEN 'owner'
    WHEN 'super_manager'       THEN 'super_manager'
    WHEN 'executive_assistant' THEN 'super_manager'
    WHEN 'area_manager'        THEN 'area_manager'
    WHEN 'branch_manager'      THEN 'branch_manager'
    WHEN 'chief_accountant'    THEN 'office'
    WHEN 'accountant'          THEN 'office'
    WHEN 'office'              THEN 'office'
    WHEN 'warehouse_head'      THEN 'warehouse_manager'
    WHEN 'warehouse_keeper'    THEN 'warehouse_manager'
    WHEN 'head_chef'           THEN 'production_manager'
    WHEN 'chef'                THEN 'chef'
    WHEN 'kitchen_helper'      THEN 'chef'
    WHEN 'cashier'             THEN 'cashier'
    WHEN 'waiter'              THEN 'waiter'
    WHEN 'warehouse_manager'   THEN 'warehouse_manager'
    WHEN 'production_manager'  THEN 'production_manager'
    ELSE NULL
  END
$$;

REVOKE ALL ON FUNCTION private.staff_role_from_position_code(TEXT)
  FROM PUBLIC, anon, authenticated;

CREATE TEMP TABLE canonical_position_code_map (
  old_code TEXT PRIMARY KEY,
  new_code TEXT NOT NULL UNIQUE
);

INSERT INTO pg_temp.canonical_position_code_map (old_code, new_code)
VALUES
  ('tro_ly_giam_doc', 'executive_assistant'),
  ('quan_ly_vung', 'area_manager'),
  ('quan_ly_CN', 'branch_manager'),
  ('ke_toan_truong', 'chief_accountant'),
  ('ke_toan', 'accountant'),
  ('kho_truong', 'warehouse_head'),
  ('thu_kho', 'warehouse_keeper'),
  ('bep_truong', 'head_chef'),
  ('phu_bep', 'kitchen_helper');

DO $$
DECLARE
  v_position_collisions INT;
  v_template_collisions INT;
BEGIN
  SELECT COUNT(*)
    INTO v_position_collisions
    FROM public.positions old_position
    JOIN pg_temp.canonical_position_code_map m ON m.old_code = old_position.code
    JOIN public.positions new_position
      ON new_position.tenant_id = old_position.tenant_id
     AND new_position.code = m.new_code
     AND new_position.id <> old_position.id;

  IF v_position_collisions > 0 THEN
    RAISE EXCEPTION
      'canonical_position_codes: % tenant position code collision(s) found. Merge duplicate positions before applying.',
      v_position_collisions
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*)
    INTO v_template_collisions
    FROM public.role_templates old_template
    JOIN pg_temp.canonical_position_code_map m ON m.old_code = old_template.name
    JOIN public.role_templates new_template
      ON new_template.tenant_id = old_template.tenant_id
     AND new_template.name = m.new_code
     AND new_template.id <> old_template.id;

  IF v_template_collisions > 0 THEN
    RAISE EXCEPTION
      'canonical_position_codes: % tenant role template collision(s) found. Merge duplicate templates before applying.',
      v_template_collisions
      USING ERRCODE = 'P0001';
  END IF;
END$$;

UPDATE public.role_templates rt
   SET position_code = m.new_code,
       name = CASE WHEN rt.name = m.old_code THEN m.new_code ELSE rt.name END,
       updated_at = now()
  FROM pg_temp.canonical_position_code_map m
 WHERE rt.position_code = m.old_code
    OR rt.name = m.old_code;

UPDATE public.positions p
   SET code = m.new_code
  FROM pg_temp.canonical_position_code_map m
 WHERE p.code = m.old_code;

UPDATE auth.users u
   SET raw_app_meta_data = jsonb_set(
         COALESCE(u.raw_app_meta_data, '{}'::jsonb),
         '{position}',
         to_jsonb(m.new_code),
         true
       )
  FROM pg_temp.canonical_position_code_map m
 WHERE u.raw_app_meta_data ->> 'position' = m.old_code;

COMMENT ON COLUMN public.positions.code IS
  'Canonical English lower_snake_case HR position code. Vietnamese display names live in label_vi.';

COMMENT ON COLUMN public.role_templates.position_code IS
  'Canonical English lower_snake_case HR position code for template lookup.';

DROP TABLE pg_temp.canonical_position_code_map;
