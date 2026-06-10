-- =====================================================================
-- Employee Checklist Templates By Role
-- - Replace the single active branch checklist template with one active
--   template per branch + role.
-- - Preserve existing branch checklist content by copying the old list into
--   every configurable staff role once.
-- - Stop generating hidden hardcoded checklist items at clock-in.
-- =====================================================================

ALTER TABLE public.shift_checklist_templates
  ADD COLUMN IF NOT EXISTS role_code text;

UPDATE public.shift_checklist_templates
SET role_code = 'cashier'
WHERE role_code IS NULL;

ALTER TABLE public.shift_checklist_templates
  ALTER COLUMN role_code SET DEFAULT 'cashier',
  ALTER COLUMN role_code SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.shift_checklist_templates
    ADD CONSTRAINT shift_checklist_templates_role_code_valid
    CHECK (
      role_code = ANY (
        ARRAY[
          'owner',
          'super_manager',
          'branch_manager',
          'warehouse_manager',
          'production_manager',
          'cashier',
          'waiter',
          'chef',
          'office'
        ]::text[]
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

COMMENT ON COLUMN public.shift_checklist_templates.role_code IS
  'Access bucket / staff role this shift checklist template applies to.';

DROP INDEX IF EXISTS public.uq_shift_checklist_templates_active_branch;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_checklist_templates_active_branch_role
  ON public.shift_checklist_templates (tenant_id, branch_id, role_code)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_shift_checklist_templates_tenant_branch_role
  ON public.shift_checklist_templates (tenant_id, branch_id, role_code);

WITH checklist_roles(role_code) AS (
  VALUES
    ('branch_manager'),
    ('warehouse_manager'),
    ('production_manager'),
    ('waiter'),
    ('chef'),
    ('office')
),
source_templates AS (
  SELECT
    t.id,
    t.tenant_id,
    t.branch_id,
    t.name,
    t.is_active
  FROM public.shift_checklist_templates t
  WHERE t.role_code = 'cashier'
    AND t.is_active = true
)
INSERT INTO public.shift_checklist_templates (
  tenant_id,
  branch_id,
  role_code,
  name,
  is_active
)
SELECT
  source_templates.tenant_id,
  source_templates.branch_id,
  checklist_roles.role_code,
  source_templates.name,
  source_templates.is_active
FROM source_templates
CROSS JOIN checklist_roles
WHERE NOT EXISTS (
  SELECT 1
  FROM public.shift_checklist_templates existing
  WHERE existing.tenant_id = source_templates.tenant_id
    AND existing.branch_id = source_templates.branch_id
    AND existing.role_code = checklist_roles.role_code
    AND existing.is_active = true
);

WITH checklist_roles(role_code) AS (
  VALUES
    ('branch_manager'),
    ('warehouse_manager'),
    ('production_manager'),
    ('waiter'),
    ('chef'),
    ('office')
),
source_templates AS (
  SELECT
    t.id AS source_template_id,
    t.tenant_id,
    t.branch_id
  FROM public.shift_checklist_templates t
  WHERE t.role_code = 'cashier'
    AND t.is_active = true
),
target_templates AS (
  SELECT
    source_templates.source_template_id,
    target.id AS target_template_id,
    target.tenant_id
  FROM source_templates
  JOIN checklist_roles ON true
  JOIN public.shift_checklist_templates target
    ON target.tenant_id = source_templates.tenant_id
   AND target.branch_id = source_templates.branch_id
   AND target.role_code = checklist_roles.role_code
   AND target.is_active = true
)
INSERT INTO public.shift_checklist_template_items (
  tenant_id,
  template_id,
  title,
  sort_order,
  is_active
)
SELECT
  target_templates.tenant_id,
  target_templates.target_template_id,
  source_items.title,
  source_items.sort_order,
  source_items.is_active
FROM target_templates
JOIN public.shift_checklist_template_items source_items
  ON source_items.template_id = target_templates.source_template_id
 AND source_items.tenant_id = target_templates.tenant_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.shift_checklist_template_items existing
  WHERE existing.tenant_id = target_templates.tenant_id
    AND existing.template_id = target_templates.target_template_id
);

DROP FUNCTION IF EXISTS public.employee_clock_in_with_checklist(
  bigint, bigint, bigint, bigint, date, text
);

CREATE OR REPLACE FUNCTION public.employee_clock_in_with_checklist(
  p_tenant_id bigint,
  p_employee_id bigint,
  p_branch_id bigint,
  p_shift_id bigint,
  p_business_date date,
  p_photo_path text,
  p_role_code text
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_attendance_id bigint;
  v_shift_id bigint;
  v_role_code text := btrim(COALESCE(p_role_code, ''));
BEGIN
  IF p_photo_path IS NULL OR btrim(p_photo_path) = '' THEN
    RAISE EXCEPTION 'photo_required' USING ERRCODE = '23514';
  END IF;

  IF v_role_code = '' THEN
    RAISE EXCEPTION 'role_required' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = p_employee_id
      AND e.tenant_id = p_tenant_id
      AND e.is_active = true
  ) THEN
    RAISE EXCEPTION 'employee_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.tenant_id = p_tenant_id
      AND COALESCE(b.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_shift_id IS NOT NULL AND p_shift_id <> 0 THEN
    SELECT s.id
    INTO v_shift_id
    FROM public.shifts s
    WHERE s.id = p_shift_id
      AND s.tenant_id = p_tenant_id
      AND s.branch_id = p_branch_id
      AND COALESCE(s.is_active, true) = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.attendance_records ar
    WHERE ar.tenant_id = p_tenant_id
      AND ar.employee_id = p_employee_id
      AND ar.date = p_business_date
  ) THEN
    RAISE EXCEPTION 'duplicate_clock_in' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.attendance_records (
    tenant_id,
    branch_id,
    employee_id,
    shift_id,
    date,
    check_in,
    status,
    method,
    code_verified,
    check_in_photo_path
  )
  VALUES (
    p_tenant_id,
    p_branch_id,
    p_employee_id,
    v_shift_id,
    p_business_date,
    now(),
    'present',
    'pwa',
    false,
    p_photo_path
  )
  RETURNING id INTO v_attendance_id;

  WITH template_items AS (
    SELECT
      i.id AS template_item_id,
      i.title,
      row_number() OVER (ORDER BY i.sort_order, i.id)::integer AS sort_order
    FROM public.shift_checklist_templates t
    JOIN public.shift_checklist_template_items i
      ON i.template_id = t.id
     AND i.tenant_id = t.tenant_id
     AND i.is_active = true
    WHERE t.tenant_id = p_tenant_id
      AND t.branch_id = p_branch_id
      AND t.role_code = v_role_code
      AND t.is_active = true
    ORDER BY i.sort_order, i.id
  )
  INSERT INTO public.attendance_checklist_items (
    tenant_id,
    attendance_record_id,
    template_item_id,
    title,
    sort_order
  )
  SELECT
    p_tenant_id,
    v_attendance_id,
    template_item_id,
    title,
    sort_order
  FROM template_items
  ORDER BY sort_order;

  RETURN v_attendance_id;
END;
$$;

DROP FUNCTION IF EXISTS public.upsert_shift_checklist_template(
  bigint, bigint, text[]
);

CREATE OR REPLACE FUNCTION public.upsert_shift_checklist_template(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_role_code text,
  p_items text[]
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_template_id bigint;
  v_item text;
  v_items text[] := COALESCE(p_items, ARRAY[]::text[]);
  v_role_code text := btrim(COALESCE(p_role_code, ''));
  v_sort integer := 0;
BEGIN
  IF v_role_code = '' OR v_role_code <> ALL (
    ARRAY[
      'owner',
      'super_manager',
      'branch_manager',
      'warehouse_manager',
      'production_manager',
      'cashier',
      'waiter',
      'chef',
      'office'
    ]::text[]
  ) THEN
    RAISE EXCEPTION 'role_not_supported' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT id
  INTO v_template_id
  FROM public.shift_checklist_templates
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND role_code = v_role_code
    AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.shift_checklist_templates (
      tenant_id,
      branch_id,
      role_code,
      name
    )
    VALUES (p_tenant_id, p_branch_id, v_role_code, 'Checklist ca làm')
    RETURNING id INTO v_template_id;
  ELSE
    UPDATE public.shift_checklist_templates
    SET name = 'Checklist ca làm'
    WHERE id = v_template_id;
  END IF;

  DELETE FROM public.shift_checklist_template_items
  WHERE tenant_id = p_tenant_id
    AND template_id = v_template_id;

  FOREACH v_item IN ARRAY v_items LOOP
    v_item := btrim(v_item);
    IF v_item = '' THEN
      CONTINUE;
    END IF;
    IF char_length(v_item) > 120 THEN
      RAISE EXCEPTION 'checklist_item_too_long' USING ERRCODE = '23514';
    END IF;

    v_sort := v_sort + 1;
    IF v_sort > 20 THEN
      RAISE EXCEPTION 'checklist_too_many_items' USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.shift_checklist_template_items (
      tenant_id,
      template_id,
      title,
      sort_order
    )
    VALUES (
      p_tenant_id,
      v_template_id,
      v_item,
      v_sort
    );
  END LOOP;

  RETURN v_template_id;
END;
$$;

REVOKE ALL ON FUNCTION public.employee_clock_in_with_checklist(
  bigint, bigint, bigint, bigint, date, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_shift_checklist_template(
  bigint, bigint, text, text[]
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.employee_clock_in_with_checklist(
  bigint, bigint, bigint, bigint, date, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_shift_checklist_template(
  bigint, bigint, text, text[]
) TO service_role;
