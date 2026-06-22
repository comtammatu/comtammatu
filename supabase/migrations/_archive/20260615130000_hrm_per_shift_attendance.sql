-- D027: per-shift attendance. Má Tư staff work 2 shifts/day (morning 06:00–13:00,
-- evening 16:00–21:00). The old one-row-per-day model could not record both.
-- This migration: makes shifts global (one set shared across branches), seeds the
-- two shifts, backfills legacy attendance.shift_id, then re-keys attendance from
-- (employee, date) to (employee, date, shift) so each shift is its own record.
-- Clock-in RPC reworked to validate global shifts and dedupe per shift.
-- Also adds a checklist `scope` column (every_shift/opening/closing/weekly) so the
-- snapshot injects open-only/close-only items into the right shift, and a
-- positions.default_checklist_template_id so clock-in falls back to the position
-- default (D026 §2: position default + per-employee override).

BEGIN;

-- 1. Allow global shifts (branch_id NULL = applies to every branch).
ALTER TABLE public.shifts ALTER COLUMN branch_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shifts_global_name_tenant_key
  ON public.shifts (tenant_id, name)
  WHERE branch_id IS NULL;

-- 2. Seed the two canonical global shifts per tenant (idempotent).
INSERT INTO public.shifts (tenant_id, branch_id, name, start_time, end_time, is_active)
SELECT t.id, NULL, v.name, v.start_time, v.end_time, true
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('Ca sáng', TIME '06:00', TIME '13:00'),
    ('Ca chiều', TIME '16:00', TIME '21:00')
) AS v(name, start_time, end_time)
WHERE NOT EXISTS (
  SELECT 1 FROM public.shifts s
  WHERE s.tenant_id = t.id AND s.branch_id IS NULL AND s.name = v.name
);

-- 3. Retire legacy per-branch shifts; the global set is now the single source.
UPDATE public.shifts
SET is_active = false, updated_at = now()
WHERE branch_id IS NOT NULL AND is_active = true;

-- 4. Backfill shift_id for legacy rows so shift_id can become NOT NULL. Map by
-- check-in VN hour: before 15:00 → morning, otherwise evening (NULL check-in
-- defaults to morning).
UPDATE public.attendance_records ar
SET shift_id = g.id
FROM public.shifts g
WHERE ar.shift_id IS NULL
  AND g.tenant_id = ar.tenant_id
  AND g.branch_id IS NULL
  AND g.name = CASE
    WHEN ar.check_in IS NULL THEN 'Ca sáng'
    WHEN EXTRACT(HOUR FROM (ar.check_in AT TIME ZONE 'Asia/Ho_Chi_Minh')) < 15
      THEN 'Ca sáng'
    ELSE 'Ca chiều'
  END;

-- 5. Re-key attendance: one row per (employee, date, shift) instead of per day.
ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_employee_id_date_tenant_id_key;

ALTER TABLE public.attendance_records
  ALTER COLUMN shift_id SET NOT NULL;

ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_employee_id_date_shift_id_tenant_id_key
  UNIQUE (employee_id, date, shift_id, tenant_id);

-- 6. shift_id is now mandatory; a referenced shift must not vanish. Switch the
-- FK from SET NULL to RESTRICT (shifts are deactivated, never deleted).
ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_shift_id_fkey;
ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_shift_id_fkey
  FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE RESTRICT;

-- 7. Checklist scope: which shift(s) a checklist item applies to under the
-- 2-shift model. every_shift = both shifts; opening = opening shift only; closing
-- = closing shift only; weekly = weekly task (handled outside per-shift snapshot).
ALTER TABLE public.shift_checklist_template_items
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'every_shift';
ALTER TABLE public.shift_checklist_template_items
  DROP CONSTRAINT IF EXISTS shift_checklist_template_items_scope_valid;
ALTER TABLE public.shift_checklist_template_items
  ADD CONSTRAINT shift_checklist_template_items_scope_valid
  CHECK (scope IN ('every_shift', 'opening', 'closing', 'weekly'));

ALTER TABLE public.attendance_checklist_items
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'every_shift';
ALTER TABLE public.attendance_checklist_items
  DROP CONSTRAINT IF EXISTS attendance_checklist_items_scope_valid;
ALTER TABLE public.attendance_checklist_items
  ADD CONSTRAINT attendance_checklist_items_scope_valid
  CHECK (scope IN ('every_shift', 'opening', 'closing', 'weekly'));

-- 8. Position-level default checklist template (D026 §2): clock-in resolves
-- COALESCE(employee override, position default). Mapping seeded after templates
-- exist (migration 20260615160000+). New staff inherit the position default.
ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS default_checklist_template_id bigint;
ALTER TABLE public.positions
  DROP CONSTRAINT IF EXISTS positions_default_checklist_template_id_fkey;
ALTER TABLE public.positions
  ADD CONSTRAINT positions_default_checklist_template_id_fkey
  FOREIGN KEY (default_checklist_template_id)
  REFERENCES public.shift_checklist_templates(id) ON DELETE SET NULL;

-- 9. Clock-in RPC: validate a global-or-branch shift, dedupe per shift, and
-- snapshot only the checklist items in scope for this shift. Opening shift =
-- earliest active start_time, closing shift = latest; weekly scope excluded.
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
  v_shift_start time;
  v_is_open boolean;
  v_is_close boolean;
  v_template_id bigint;
BEGIN
  IF p_photo_path IS NULL OR btrim(p_photo_path) = '' THEN
    RAISE EXCEPTION 'photo_required' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(e.default_checklist_template_id, po.default_checklist_template_id)
  INTO v_template_id
  FROM public.employees e
  JOIN public.profiles p
    ON p.id = e.profile_id
   AND p.tenant_id = e.tenant_id
  LEFT JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
  WHERE e.id = p_employee_id
    AND e.tenant_id = p_tenant_id
    AND e.is_active = true
    AND p.branch_id = p_branch_id;

  IF NOT FOUND THEN
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

  IF p_shift_id IS NULL OR p_shift_id = 0 THEN
    RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT s.id, s.start_time
  INTO v_shift_id, v_shift_start
  FROM public.shifts s
  WHERE s.id = p_shift_id
    AND s.tenant_id = p_tenant_id
    AND (s.branch_id IS NULL OR s.branch_id = p_branch_id)
    AND COALESCE(s.is_active, true) = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Opening shift = earliest start among active shifts; closing = latest.
  -- A single-shift branch is both opening and closing.
  SELECT v_shift_start = min(s.start_time), v_shift_start = max(s.start_time)
  INTO v_is_open, v_is_close
  FROM public.shifts s
  WHERE s.tenant_id = p_tenant_id
    AND (s.branch_id IS NULL OR s.branch_id = p_branch_id)
    AND COALESCE(s.is_active, true) = true;

  IF v_template_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.shift_checklist_templates t
      WHERE t.id = v_template_id
        AND t.tenant_id = p_tenant_id
        AND t.is_active = true
        AND (t.branch_id IS NULL OR t.branch_id = p_branch_id)
    ) THEN
    v_template_id := NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.attendance_records ar
    WHERE ar.tenant_id = p_tenant_id
      AND ar.employee_id = p_employee_id
      AND ar.date = p_business_date
      AND ar.shift_id = v_shift_id
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
    check_in_photo_path,
    checklist_template_id
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
    p_photo_path,
    v_template_id
  )
  RETURNING id INTO v_attendance_id;

  INSERT INTO public.attendance_checklist_items (
    tenant_id,
    attendance_record_id,
    template_item_id,
    title,
    phase,
    done_definition,
    is_required,
    scope,
    sort_order
  )
  SELECT
    p_tenant_id,
    v_attendance_id,
    i.id,
    i.title,
    i.phase,
    i.done_definition,
    i.is_required,
    i.scope,
    row_number() OVER (ORDER BY i.sort_order, i.id)::integer
  FROM public.shift_checklist_template_items i
  WHERE i.tenant_id = p_tenant_id
    AND i.template_id = v_template_id
    AND i.is_active = true
    AND (
      i.scope = 'every_shift'
      OR (i.scope = 'opening' AND v_is_open)
      OR (i.scope = 'closing' AND v_is_close)
    )
  ORDER BY i.sort_order, i.id;

  RETURN v_attendance_id;
END;
$$;

REVOKE ALL ON FUNCTION public.employee_clock_in_with_checklist(
  bigint, bigint, bigint, bigint, date, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employee_clock_in_with_checklist(
  bigint, bigint, bigint, bigint, date, text
) TO service_role;

COMMENT ON FUNCTION public.employee_clock_in_with_checklist(
  bigint, bigint, bigint, bigint, date, text
) IS 'Per-shift employee clock-in: validates a global-or-branch shift, dedupes per (employee, date, shift), snapshots the employee default checklist filtered by item scope for this shift (opening shift gets every_shift+opening, closing gets every_shift+closing; weekly excluded).';

-- 10. Phase tokens → English (were Vietnamese dau_ca/trong_ca/cuoi_ca). Drop the
-- old CHECK first (it would reject the English values), migrate data, re-add the
-- CHECK + default, then replace the template upsert validator.
ALTER TABLE public.shift_checklist_template_items
  DROP CONSTRAINT IF EXISTS shift_checklist_template_items_phase_valid;
ALTER TABLE public.attendance_checklist_items
  DROP CONSTRAINT IF EXISTS attendance_checklist_items_phase_valid;

UPDATE public.shift_checklist_template_items
SET phase = CASE phase
  WHEN 'dau_ca' THEN 'start_of_shift'
  WHEN 'trong_ca' THEN 'during_shift'
  WHEN 'cuoi_ca' THEN 'end_of_shift'
  ELSE phase
END
WHERE phase IN ('dau_ca', 'trong_ca', 'cuoi_ca');

UPDATE public.attendance_checklist_items
SET phase = CASE phase
  WHEN 'dau_ca' THEN 'start_of_shift'
  WHEN 'trong_ca' THEN 'during_shift'
  WHEN 'cuoi_ca' THEN 'end_of_shift'
  ELSE phase
END
WHERE phase IN ('dau_ca', 'trong_ca', 'cuoi_ca');

ALTER TABLE public.shift_checklist_template_items
  ALTER COLUMN phase SET DEFAULT 'during_shift';
ALTER TABLE public.shift_checklist_template_items
  ADD CONSTRAINT shift_checklist_template_items_phase_valid
  CHECK (phase = ANY (ARRAY['start_of_shift', 'during_shift', 'end_of_shift']::text[]));

ALTER TABLE public.attendance_checklist_items
  ALTER COLUMN phase SET DEFAULT 'during_shift';
ALTER TABLE public.attendance_checklist_items
  ADD CONSTRAINT attendance_checklist_items_phase_valid
  CHECK (phase = ANY (ARRAY['start_of_shift', 'during_shift', 'end_of_shift']::text[]));

COMMENT ON COLUMN public.shift_checklist_template_items.phase IS
  'Checklist phase: start_of_shift, during_shift, or end_of_shift.';
COMMENT ON COLUMN public.attendance_checklist_items.phase IS
  'Checklist phase: start_of_shift, during_shift, or end_of_shift.';

-- Template upsert: same body, phase tokens/default in English.
CREATE OR REPLACE FUNCTION public.upsert_shift_checklist_template(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_template_id bigint,
  p_name text,
  p_items jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_template_id bigint;
  v_items jsonb := COALESCE(p_items, '[]'::jsonb);
  v_item jsonb;
  v_title text;
  v_phase text;
  v_done_definition text;
  v_is_required boolean;
  v_scope text;
  v_sort integer := 0;
  v_name text := btrim(COALESCE(p_name, ''));
BEGIN
  IF v_name = '' THEN
    RAISE EXCEPTION 'template_name_required' USING ERRCODE = '23514';
  END IF;

  IF char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'template_name_too_long' USING ERRCODE = '23514';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.tenant_id = p_tenant_id
      AND COALESCE(b.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF jsonb_typeof(v_items) <> 'array' THEN
    RAISE EXCEPTION 'checklist_items_invalid' USING ERRCODE = '23514';
  END IF;

  IF jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'checklist_empty' USING ERRCODE = '23514';
  END IF;

  IF jsonb_array_length(v_items) > 40 THEN
    RAISE EXCEPTION 'checklist_too_many_items' USING ERRCODE = '23514';
  END IF;

  IF p_template_id IS NULL THEN
    INSERT INTO public.shift_checklist_templates (
      tenant_id,
      branch_id,
      role_code,
      name,
      is_active
    )
    VALUES (
      p_tenant_id,
      p_branch_id,
      NULL,
      v_name,
      true
    )
    RETURNING id INTO v_template_id;
  ELSE
    SELECT id
    INTO v_template_id
    FROM public.shift_checklist_templates
    WHERE id = p_template_id
      AND tenant_id = p_tenant_id
      AND branch_id IS NOT DISTINCT FROM p_branch_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'template_not_found' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.shift_checklist_templates
    SET
      name = v_name,
      is_active = true
    WHERE id = v_template_id;
  END IF;

  DELETE FROM public.shift_checklist_template_items
  WHERE tenant_id = p_tenant_id
    AND template_id = v_template_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items)
  LOOP
    v_title := btrim(COALESCE(v_item ->> 'title', ''));
    v_phase := COALESCE(NULLIF(v_item ->> 'phase', ''), 'during_shift');
    v_done_definition := btrim(
      COALESCE(
        v_item ->> 'doneDefinition',
        v_item ->> 'done_definition',
        ''
      )
    );
    v_is_required := COALESCE(
      NULLIF(v_item ->> 'isRequired', '')::boolean,
      NULLIF(v_item ->> 'is_required', '')::boolean,
      true
    );
    v_scope := COALESCE(NULLIF(v_item ->> 'scope', ''), 'every_shift');

    IF v_title = '' THEN
      CONTINUE;
    END IF;

    IF char_length(v_title) > 120 THEN
      RAISE EXCEPTION 'checklist_item_too_long' USING ERRCODE = '23514';
    END IF;

    IF v_phase <> ALL (ARRAY['start_of_shift', 'during_shift', 'end_of_shift']::text[]) THEN
      RAISE EXCEPTION 'checklist_phase_invalid' USING ERRCODE = '23514';
    END IF;

    IF v_scope <> ALL (ARRAY['every_shift', 'opening', 'closing', 'weekly']::text[]) THEN
      RAISE EXCEPTION 'checklist_scope_invalid' USING ERRCODE = '23514';
    END IF;

    IF char_length(v_done_definition) > 240 THEN
      RAISE EXCEPTION 'done_definition_too_long' USING ERRCODE = '23514';
    END IF;

    v_sort := v_sort + 1;

    INSERT INTO public.shift_checklist_template_items (
      tenant_id,
      template_id,
      title,
      phase,
      done_definition,
      is_required,
      scope,
      sort_order,
      is_active
    )
    VALUES (
      p_tenant_id,
      v_template_id,
      v_title,
      v_phase,
      v_done_definition,
      v_is_required,
      v_scope,
      v_sort,
      true
    );
  END LOOP;

  IF v_sort = 0 THEN
    RAISE EXCEPTION 'checklist_empty' USING ERRCODE = '23514';
  END IF;

  RETURN v_template_id;
END;
$$;

COMMIT;
