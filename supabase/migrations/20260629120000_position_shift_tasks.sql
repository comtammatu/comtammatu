-- 20260629120000_position_shift_tasks.sql
-- Direct per-position shift tasks (replaces template+assignment indirection).
-- Additive only; legacy template tables dropped in a later migration after cutover.

BEGIN;

-- 1. Explicit shift open/close flags (replace MIN/MAX start_time guessing).
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS is_opening boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_closing boolean NOT NULL DEFAULT false;

-- Backfill from current implicit behavior: earliest active shift = opening,
-- latest = closing, per (tenant, branch-or-global). Single-shift tenants get both.
WITH bounds AS (
  SELECT tenant_id, COALESCE(branch_id, -1) AS bkey,
         min(start_time) AS min_start, max(start_time) AS max_start
  FROM public.shifts WHERE is_active GROUP BY tenant_id, COALESCE(branch_id, -1)
)
UPDATE public.shifts s SET
  is_opening = (s.start_time = b.min_start),
  is_closing = (s.start_time = b.max_start)
FROM bounds b
WHERE s.tenant_id = b.tenant_id AND COALESCE(s.branch_id, -1) = b.bkey AND s.is_active;

-- 2. Per-position task table.
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
  CONSTRAINT position_shift_tasks_done_definition_length CHECK (char_length(done_definition) <= 240),
  CONSTRAINT position_shift_tasks_sort_positive CHECK (sort_order > 0),
  CONSTRAINT position_shift_tasks_kind_valid CHECK (kind = ANY (ARRAY['standard','consumption_report']::text[])),
  CONSTRAINT position_shift_tasks_phase_valid CHECK (phase = ANY (ARRAY['start_of_shift','end_of_shift']::text[])),
  CONSTRAINT position_shift_tasks_applicability_valid CHECK (applicability = ANY (ARRAY['every_shift','opening','closing']::text[]))
);
CREATE INDEX IF NOT EXISTS idx_position_shift_tasks_tenant_position
  ON public.position_shift_tasks (tenant_id, position_id, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS uq_position_shift_tasks_order
  ON public.position_shift_tasks (position_id, sort_order);

DROP TRIGGER IF EXISTS trg_position_shift_tasks_updated_at ON public.position_shift_tasks;
CREATE TRIGGER trg_position_shift_tasks_updated_at BEFORE UPDATE ON public.position_shift_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

GRANT SELECT ON TABLE public.position_shift_tasks TO authenticated;
GRANT ALL ON TABLE public.position_shift_tasks TO service_role;
ALTER TABLE public.position_shift_tasks ENABLE ROW LEVEL SECURITY;

-- SELECT policy mirrors template read scope (tenant + staff:manage / hr:view_employee / settings:tenant).
DROP POLICY IF EXISTS position_shift_tasks_select ON public.position_shift_tasks;
CREATE POLICY position_shift_tasks_select ON public.position_shift_tasks
  FOR SELECT TO authenticated USING (
    tenant_id = public.auth_tenant_id()
    AND (
      (SELECT public.has_permission_any('settings:tenant')) OR
      (SELECT public.has_permission_any('staff:manage')) OR
      (SELECT public.has_permission_any('hr:view_employee'))
    )
  );

-- 3. Allow the runtime count task kind on the snapshot table (additive — historical rows unaffected).
ALTER TABLE public.attendance_checklist_items DROP CONSTRAINT IF EXISTS attendance_checklist_items_task_kind_valid;
ALTER TABLE public.attendance_checklist_items ADD CONSTRAINT attendance_checklist_items_task_kind_valid
  CHECK (task_kind = ANY (ARRAY['standard','consumption_report','inventory_count']::text[]));

-- 4. Re-key consumption defaults onto position tasks (nullable new FK; old template_item_id kept until Phase 6).
ALTER TABLE public.shift_checklist_consumption_default_items
  ADD COLUMN IF NOT EXISTS position_task_id bigint
    REFERENCES public.position_shift_tasks(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_consumption_default_items_position_task_active
  ON public.shift_checklist_consumption_default_items (tenant_id, position_task_id, ingredient_id)
  WHERE is_active AND position_task_id IS NOT NULL;

-- 5. Data migration: positions' assigned template items -> position_shift_tasks.
-- Map: scope -> applicability (drop 'weekly' rows); phase during_shift -> start_of_shift.
INSERT INTO public.position_shift_tasks
  (tenant_id, position_id, title, kind, applicability, phase, is_required, done_definition, sort_order)
SELECT
  po.tenant_id, po.id, i.title,
  CASE WHEN i.task_kind = 'consumption_report' THEN 'consumption_report' ELSE 'standard' END,
  CASE WHEN i.scope IN ('opening','closing') THEN i.scope ELSE 'every_shift' END,
  CASE WHEN i.phase = 'end_of_shift' THEN 'end_of_shift' ELSE 'start_of_shift' END,
  i.is_required, i.done_definition,
  row_number() OVER (PARTITION BY po.id ORDER BY i.sort_order, i.id)::integer
FROM public.positions po
JOIN public.shift_checklist_template_items i
  ON i.template_id = po.default_checklist_template_id AND i.tenant_id = po.tenant_id AND i.is_active
WHERE po.default_checklist_template_id IS NOT NULL
  AND i.scope <> 'weekly'
  AND NOT EXISTS (SELECT 1 FROM public.position_shift_tasks p WHERE p.position_id = po.id);

-- 6. Re-point consumption defaults to the migrated position tasks (match by title within position).
UPDATE public.shift_checklist_consumption_default_items d
SET position_task_id = pst.id
FROM public.shift_checklist_template_items i
JOIN public.positions po ON po.default_checklist_template_id = i.template_id AND po.tenant_id = i.tenant_id
JOIN public.position_shift_tasks pst
  ON pst.position_id = po.id AND pst.tenant_id = po.tenant_id AND pst.title = i.title AND pst.kind = 'consumption_report'
WHERE d.template_item_id = i.id AND d.position_task_id IS NULL AND d.is_active;

COMMIT;
