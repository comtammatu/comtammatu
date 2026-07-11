-- Restore production schema objects that were applied live but missing from the
-- local migration chain.

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS is_opening boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_closing boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.position_shift_tasks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  position_id bigint NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'standard',
  applicability text NOT NULL DEFAULT 'every_shift',
  phase text NOT NULL DEFAULT 'start_of_shift',
  is_required boolean NOT NULL DEFAULT true,
  done_definition text NOT NULL DEFAULT '',
  sort_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT position_shift_tasks_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT position_shift_tasks_title_length CHECK (char_length(title) <= 120),
  CONSTRAINT position_shift_tasks_kind_valid CHECK (kind = ANY (ARRAY['standard', 'consumption_report']::text[])),
  CONSTRAINT position_shift_tasks_applicability_valid CHECK (applicability = ANY (ARRAY['every_shift', 'opening', 'closing']::text[])),
  CONSTRAINT position_shift_tasks_phase_valid CHECK (phase = ANY (ARRAY['start_of_shift', 'end_of_shift']::text[])),
  CONSTRAINT position_shift_tasks_done_definition_length CHECK (char_length(done_definition) <= 240),
  CONSTRAINT position_shift_tasks_sort_positive CHECK (sort_order > 0)
);

CREATE INDEX IF NOT EXISTS idx_position_shift_tasks_tenant_position
  ON public.position_shift_tasks (tenant_id, position_id, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS uq_position_shift_tasks_order
  ON public.position_shift_tasks (position_id, sort_order);

ALTER TABLE public.position_shift_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS position_shift_tasks_select ON public.position_shift_tasks;
CREATE POLICY position_shift_tasks_select ON public.position_shift_tasks
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      (SELECT public.has_permission_any('settings:tenant'))
      OR (SELECT public.has_permission_any('staff:manage'))
      OR (SELECT public.has_permission_any('hr:view_employee'))
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.position_shift_tasks TO authenticated;
GRANT ALL ON public.position_shift_tasks TO service_role;

DROP TRIGGER IF EXISTS trg_position_shift_tasks_updated_at ON public.position_shift_tasks;
CREATE TRIGGER trg_position_shift_tasks_updated_at
  BEFORE UPDATE ON public.position_shift_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.shift_checklist_consumption_default_items
  ADD COLUMN IF NOT EXISTS position_task_id bigint;

ALTER TABLE public.shift_checklist_consumption_default_items
  ALTER COLUMN template_item_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shift_checklist_consumption_default_items_position_task_id_fkey'
      AND conrelid = 'public.shift_checklist_consumption_default_items'::regclass
  ) THEN
    ALTER TABLE public.shift_checklist_consumption_default_items
      ADD CONSTRAINT shift_checklist_consumption_default_items_position_task_id_fkey
      FOREIGN KEY (position_task_id) REFERENCES public.position_shift_tasks(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shift_checklist_consumption_default_items_parent_present'
      AND conrelid = 'public.shift_checklist_consumption_default_items'::regclass
  ) THEN
    ALTER TABLE public.shift_checklist_consumption_default_items
      ADD CONSTRAINT shift_checklist_consumption_default_items_parent_present
      CHECK (template_item_id IS NOT NULL OR position_task_id IS NOT NULL);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.upsert_position_shift_tasks(
  p_position_id bigint,
  p_tasks jsonb
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_tasks jsonb := COALESCE(p_tasks, '[]'::jsonb);
  v_item jsonb;
  v_title text;
  v_kind text;
  v_appl text;
  v_phase text;
  v_done text;
  v_req boolean;
  v_sort integer := 0;
BEGIN
  IF NOT (SELECT public.has_permission_any('staff:manage')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.positions WHERE id = p_position_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'position_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF jsonb_typeof(v_tasks) <> 'array' THEN
    RAISE EXCEPTION 'tasks_invalid' USING ERRCODE = '23514';
  END IF;

  IF jsonb_array_length(v_tasks) > 40 THEN
    RAISE EXCEPTION 'too_many_tasks' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.position_shift_tasks
  WHERE tenant_id = v_tenant_id AND position_id = p_position_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_tasks) LOOP
    v_title := btrim(COALESCE(v_item->>'title', ''));
    v_kind := COALESCE(NULLIF(v_item->>'kind', ''), 'standard');
    v_appl := COALESCE(NULLIF(v_item->>'applicability', ''), 'every_shift');
    v_phase := COALESCE(NULLIF(v_item->>'phase', ''), 'start_of_shift');
    v_done := btrim(COALESCE(v_item->>'doneDefinition', ''));
    v_req := COALESCE(NULLIF(v_item->>'isRequired', '')::boolean, true);

    IF v_title = '' THEN
      CONTINUE;
    END IF;

    IF char_length(v_title) > 120 THEN
      RAISE EXCEPTION 'task_title_too_long' USING ERRCODE = '23514';
    END IF;
    IF v_kind <> ALL (ARRAY['standard', 'consumption_report']::text[]) THEN
      RAISE EXCEPTION 'task_kind_invalid' USING ERRCODE = '23514';
    END IF;
    IF v_appl <> ALL (ARRAY['every_shift', 'opening', 'closing']::text[]) THEN
      RAISE EXCEPTION 'task_applicability_invalid' USING ERRCODE = '23514';
    END IF;
    IF v_phase <> ALL (ARRAY['start_of_shift', 'end_of_shift']::text[]) THEN
      RAISE EXCEPTION 'task_phase_invalid' USING ERRCODE = '23514';
    END IF;
    IF char_length(v_done) > 240 THEN
      RAISE EXCEPTION 'done_definition_too_long' USING ERRCODE = '23514';
    END IF;

    v_sort := v_sort + 1;

    INSERT INTO public.position_shift_tasks (
      tenant_id,
      position_id,
      title,
      kind,
      applicability,
      phase,
      is_required,
      done_definition,
      sort_order
    ) VALUES (
      v_tenant_id,
      p_position_id,
      v_title,
      v_kind,
      v_appl,
      v_phase,
      v_req,
      v_done,
      v_sort
    );
  END LOOP;

  RETURN p_position_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_position_shift_tasks(bigint, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_position_shift_tasks(bigint, jsonb) TO authenticated, service_role;
