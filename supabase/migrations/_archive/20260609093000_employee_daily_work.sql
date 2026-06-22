-- =====================================================================
-- Employee Daily Work
-- - Photo-only clock-in.
-- - Checklist snapshot per attendance record.
-- - Checklist completion is required before checkout handoff.
-- - Harden attendance_records so Employee writes go through Server Actions +
--   service-role RPCs only.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Attendance record columns
-- ---------------------------------------------------------------------

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS check_in_photo_path text,
  ADD COLUMN IF NOT EXISTS check_out_code_verified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.attendance_records.check_in_photo_path IS
  'Private Storage path in attendance-photos bucket for the employee clock-in photo.';

COMMENT ON COLUMN public.attendance_records.check_out_code_verified IS
  'Legacy checkout-code flag retained for old attendance rows. Current Employee checkout uses manager approval.';

-- ---------------------------------------------------------------------
-- Private Storage bucket
-- ---------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attendance-photos',
  'attendance-photos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- No authenticated storage.objects policy is created for this bucket.
-- Employee upload and future admin review/download must go through checked
-- Server Actions using the service role or short-lived signed URLs.

-- ---------------------------------------------------------------------
-- Checklist template + attendance snapshot tables
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.shift_checklist_templates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id bigint NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Checklist ca làm',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shift_checklist_templates_name_not_blank CHECK (btrim(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_checklist_templates_active_branch
  ON public.shift_checklist_templates (tenant_id, branch_id)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_shift_checklist_templates_tenant_branch
  ON public.shift_checklist_templates (tenant_id, branch_id);

DROP TRIGGER IF EXISTS trg_shift_checklist_templates_updated_at
  ON public.shift_checklist_templates;
CREATE TRIGGER trg_shift_checklist_templates_updated_at
  BEFORE UPDATE ON public.shift_checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.shift_checklist_template_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_id bigint NOT NULL REFERENCES public.shift_checklist_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shift_checklist_template_items_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT shift_checklist_template_items_sort_positive CHECK (sort_order > 0),
  CONSTRAINT shift_checklist_template_items_title_length CHECK (char_length(title) <= 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_checklist_template_items_order
  ON public.shift_checklist_template_items (template_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_shift_checklist_template_items_tenant_template
  ON public.shift_checklist_template_items (tenant_id, template_id);

CREATE TABLE IF NOT EXISTS public.attendance_checklist_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  attendance_record_id bigint NOT NULL REFERENCES public.attendance_records(id) ON DELETE CASCADE,
  template_item_id bigint REFERENCES public.shift_checklist_template_items(id) ON DELETE SET NULL,
  title text NOT NULL,
  sort_order integer NOT NULL,
  is_done boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_checklist_items_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT attendance_checklist_items_sort_positive CHECK (sort_order > 0),
  CONSTRAINT attendance_checklist_items_title_length CHECK (char_length(title) <= 120),
  CONSTRAINT attendance_checklist_items_completed_consistent CHECK (
    (is_done AND completed_at IS NOT NULL)
    OR ((NOT is_done) AND completed_at IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_checklist_items_order
  ON public.attendance_checklist_items (attendance_record_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_attendance_checklist_items_tenant_attendance
  ON public.attendance_checklist_items (tenant_id, attendance_record_id);

DROP TRIGGER IF EXISTS trg_attendance_checklist_items_updated_at
  ON public.attendance_checklist_items;
CREATE TRIGGER trg_attendance_checklist_items_updated_at
  BEFORE UPDATE ON public.attendance_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------

ALTER TABLE public.shift_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_checklist_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_checklist_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.shift_checklist_templates FROM anon, authenticated;
REVOKE ALL ON TABLE public.shift_checklist_template_items FROM anon, authenticated;
REVOKE ALL ON TABLE public.attendance_checklist_items FROM anon, authenticated;

GRANT SELECT ON TABLE public.shift_checklist_templates TO authenticated;
GRANT SELECT ON TABLE public.shift_checklist_template_items TO authenticated;
GRANT SELECT ON TABLE public.attendance_checklist_items TO authenticated;

GRANT ALL ON TABLE public.shift_checklist_templates TO service_role;
GRANT ALL ON TABLE public.shift_checklist_template_items TO service_role;
GRANT ALL ON TABLE public.attendance_checklist_items TO service_role;

GRANT ALL ON SEQUENCE public.shift_checklist_templates_id_seq TO service_role;
GRANT ALL ON SEQUENCE public.shift_checklist_template_items_id_seq TO service_role;
GRANT ALL ON SEQUENCE public.attendance_checklist_items_id_seq TO service_role;

DROP POLICY IF EXISTS shift_checklist_templates_select
  ON public.shift_checklist_templates;
CREATE POLICY shift_checklist_templates_select
  ON public.shift_checklist_templates
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission(branch_id, 'settings:branch')
      OR public.has_permission_any('settings:tenant')
    )
  );

DROP POLICY IF EXISTS shift_checklist_template_items_select
  ON public.shift_checklist_template_items;
CREATE POLICY shift_checklist_template_items_select
  ON public.shift_checklist_template_items
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.shift_checklist_templates t
      WHERE t.id = shift_checklist_template_items.template_id
        AND t.tenant_id = shift_checklist_template_items.tenant_id
        AND (
          public.has_permission(t.branch_id, 'settings:branch')
          OR public.has_permission_any('settings:tenant')
        )
    )
  );

DROP POLICY IF EXISTS attendance_checklist_items_select
  ON public.attendance_checklist_items;
CREATE POLICY attendance_checklist_items_select
  ON public.attendance_checklist_items
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.attendance_records ar
      WHERE ar.id = attendance_checklist_items.attendance_record_id
        AND ar.tenant_id = attendance_checklist_items.tenant_id
        AND (
          EXISTS (
            SELECT 1
            FROM public.employees e
            WHERE e.id = ar.employee_id
              AND e.profile_id = auth.uid()
          )
          OR public.has_permission(ar.branch_id, 'staff:view')
          OR public.has_permission(ar.branch_id, 'hr:view_employee')
          OR public.has_permission(ar.branch_id, 'staff:manage')
        )
    )
  );

-- Harden attendance_records direct writes. Server Actions/RPCs use service_role.
DROP POLICY IF EXISTS attendance_self_checkin ON public.attendance_records;
DROP POLICY IF EXISTS attendance_self_checkout ON public.attendance_records;
DROP POLICY IF EXISTS attendance_write ON public.attendance_records;
DROP POLICY IF EXISTS attendance_employee_self_select ON public.attendance_records;
DROP POLICY IF EXISTS attendance_select ON public.attendance_records;

CREATE POLICY attendance_select
  ON public.attendance_records
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      EXISTS (
        SELECT 1
        FROM public.employees e
        WHERE e.id = attendance_records.employee_id
          AND e.profile_id = auth.uid()
      )
      OR public.has_permission(branch_id, 'staff:view')
      OR public.has_permission(branch_id, 'hr:view_employee')
      OR public.has_permission(branch_id, 'staff:manage')
    )
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLE public.attendance_records
  FROM anon, authenticated;
GRANT SELECT ON TABLE public.attendance_records TO authenticated;
GRANT ALL ON TABLE public.attendance_records TO service_role;
REVOKE ALL ON SEQUENCE public.attendance_records_id_seq FROM anon, authenticated;
GRANT ALL ON SEQUENCE public.attendance_records_id_seq TO service_role;

-- ---------------------------------------------------------------------
-- RPCs used by checked Server Actions
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.employee_clock_in_with_checklist(
  p_tenant_id bigint,
  p_employee_id bigint,
  p_branch_id bigint,
  p_shift_id bigint,
  p_business_date date,
  p_photo_path text
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_attendance_id bigint;
  v_shift_id bigint;
BEGIN
  IF p_photo_path IS NULL OR btrim(p_photo_path) = '' THEN
    RAISE EXCEPTION 'photo_required' USING ERRCODE = '23514';
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
      AND t.is_active = true
    ORDER BY i.sort_order, i.id
  ),
  fallback_items AS (
    SELECT NULL::bigint AS template_item_id, title, sort_order
    FROM unnest(ARRAY[
      'Chuẩn bị khu vực làm việc',
      'Kiểm tra công cụ cần dùng',
      'Hoàn tất việc được giao',
      'Vệ sinh và bàn giao cuối ca'
    ]::text[]) WITH ORDINALITY AS fallback(title, sort_order)
  ),
  source_items AS (
    SELECT template_item_id, title, sort_order FROM template_items
    UNION ALL
    SELECT template_item_id, title, sort_order
    FROM fallback_items
    WHERE NOT EXISTS (SELECT 1 FROM template_items)
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
  FROM source_items
  ORDER BY sort_order;

  RETURN v_attendance_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.employee_clock_out_with_code(
  p_tenant_id bigint,
  p_employee_id bigint,
  p_attendance_id bigint
)
RETURNS timestamptz
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_check_out timestamptz;
  v_remaining integer;
BEGIN
  PERFORM 1
  FROM public.attendance_records ar
  WHERE ar.id = p_attendance_id
    AND ar.tenant_id = p_tenant_id
    AND ar.employee_id = p_employee_id
    AND ar.check_out IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'open_attendance_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*)::integer
  INTO v_remaining
  FROM public.attendance_checklist_items i
  WHERE i.tenant_id = p_tenant_id
    AND i.attendance_record_id = p_attendance_id
    AND i.is_done = false;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'checklist_incomplete' USING ERRCODE = '23514';
  END IF;

  UPDATE public.attendance_records
  SET
    check_out = now(),
    check_out_code_verified = true
  WHERE id = p_attendance_id
    AND tenant_id = p_tenant_id
    AND employee_id = p_employee_id
    AND check_out IS NULL
  RETURNING check_out INTO v_check_out;

  RETURN v_check_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_shift_checklist_template(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_items text[]
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_template_id bigint;
  v_item text;
  v_sort integer := 0;
BEGIN
  IF p_items IS NULL OR cardinality(p_items) = 0 THEN
    RAISE EXCEPTION 'checklist_empty' USING ERRCODE = '23514';
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
    AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.shift_checklist_templates (tenant_id, branch_id, name)
    VALUES (p_tenant_id, p_branch_id, 'Checklist ca làm')
    RETURNING id INTO v_template_id;
  ELSE
    UPDATE public.shift_checklist_templates
    SET name = 'Checklist ca làm'
    WHERE id = v_template_id;
  END IF;

  DELETE FROM public.shift_checklist_template_items
  WHERE tenant_id = p_tenant_id
    AND template_id = v_template_id;

  FOREACH v_item IN ARRAY p_items LOOP
    v_item := btrim(v_item);
    IF v_item = '' THEN
      CONTINUE;
    END IF;
    IF char_length(v_item) > 120 THEN
      RAISE EXCEPTION 'checklist_item_too_long' USING ERRCODE = '23514';
    END IF;

    v_sort := v_sort + 1;
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

  IF v_sort = 0 THEN
    RAISE EXCEPTION 'checklist_empty' USING ERRCODE = '23514';
  END IF;

  RETURN v_template_id;
END;
$$;

REVOKE ALL ON FUNCTION public.employee_clock_in_with_checklist(
  bigint, bigint, bigint, bigint, date, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.employee_clock_out_with_code(
  bigint, bigint, bigint
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_shift_checklist_template(
  bigint, bigint, text[]
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.employee_clock_in_with_checklist(
  bigint, bigint, bigint, bigint, date, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.employee_clock_out_with_code(
  bigint, bigint, bigint
) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_shift_checklist_template(
  bigint, bigint, text[]
) TO service_role;
