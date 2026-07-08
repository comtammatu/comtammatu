# "Việc trong ca" Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the template-based shift-checklist with a direct **per-position "Việc trong ca"** model — one concept, clearly-typed tasks (standard / consumption / auto-surfaced count), explicit shift open/close flags, 2 phases (start/end of shift) — reusing the existing Tiêu hao and Kiểm kê engines.

**Architecture:** A new `position_shift_tasks` table holds tasks directly on a position (no templates, no per-employee override). Clock-in snapshots a position's tasks into the existing `attendance_checklist_items` (audit-frozen) using explicit `shifts.is_opening/is_closing` flags, and auto-inserts an `inventory_count` task when the employee has active Inventory count assignments. HR config collapses from 6 surfaces to 2 (Ca làm + Vị trí→Việc trong ca). The Inventory blind-count engine and the consumption approval/WAC engine are untouched.

**Tech Stack:** Next.js App Router (RSC + Server Actions), supabase-js (PostgREST + SECURITY DEFINER RPCs), Postgres (text columns + CHECK constraints, no enums), Zod, RHF + Má Tư DS Field (D010), `tsx --test` static tests.

**Source docs:** Design `docs/plan/viec-trong-ca-redesign-2026-06-29.md`; decision **D050** (`docs/plan/decisions.md`); current-state evidence in this plan's task bodies.

## Global Constraints

- TypeScript strict mode; `noUncheckedIndexedAccess: true`. All queries via supabase-js (NEVER Prisma).
- All Server Action inputs validated with Zod. NEVER return raw Postgres `error.message` to clients.
- Run `pnpm typecheck && pnpm lint && pnpm build` before marking any task complete. Tests: `pnpm --filter @comtammatu/web test` (static `tsx --test`).
- **Migrations: file → PR → owner applies to prod. Agents NEVER apply to prod.** There is NO dev DB. After the migration is applied to prod, owner/agent runs `pnpm db:types`. Until types regen, new tables are typed via `as unknown as` casts (existing pattern for count/consumption tables).
- Migration files: `supabase/migrations/YYYYMMDDHHMMSS_<slug>.sql`. Baseline-first model; baseline replay gate (`pnpm db:baseline:local-check`) must stay green → reflect every new object into `00000000000000_baseline.sql` per repo `supabase/migrations/README.md`.
- DB conventions: money `NUMERIC(15,2)`, time `TIMESTAMPTZ`, PK `BIGINT GENERATED ALWAYS AS IDENTITY`, text `TEXT`. New tables: explicit `GRANT SELECT ... TO authenticated` + `GRANT ALL ... TO service_role`; UNIQUE includes tenant scope; CHECK uses `... = ANY (ARRAY[...]::text[])`. Keep the TS literal-union twin in sync with each CHECK.
- i18n: no inline Vietnamese in JSX (`i18n/no-inline-vietnamese`); copy lives in `apps/web/lib/messages/*` + `packages/shared/src/labels/vi.ts`. After moving/renaming copy, run `pnpm lint:i18n:baseline`; `pnpm lint:i18n:no-grow` must pass (count must not grow).
- No tombstones / no provenance comments / no Vietnamese narrative comments in code (D-rule). Comments state only non-obvious constraints.
- Communication: agent-to-agent + code/identifiers/commits English; owner replies Vietnamese.

## New / changed type vocabulary (single source of truth for the whole plan)

```
position_shift_tasks.kind          ∈ { 'standard', 'consumption_report' }     -- count is NOT configured here
position_shift_tasks.phase         ∈ { 'start_of_shift', 'end_of_shift' }     -- 'during_shift' dropped
position_shift_tasks.applicability ∈ { 'every_shift', 'opening', 'closing' }  -- 'weekly' dropped
attendance_checklist_items.task_kind ∈ { 'standard', 'consumption_report', 'inventory_count' }  -- '+inventory_count' (runtime only)
```

TS twin (Task 11, `checklist-types.ts` successor): `POSITION_TASK_KINDS`, `POSITION_TASK_PHASES`, `POSITION_TASK_APPLICABILITY` literal unions + Vietnamese label maps.

---

## Phase 1 — DB foundation (additive migration, no drops)

> One migration file, fully additive + backfill. Old objects (`shift_checklist_templates*`, `*.default_checklist_template_id`) stay dormant until Phase 6. Owner applies to prod, then `pnpm db:types`.

### Task 1: Additive migration — shifts flags, `position_shift_tasks`, attendance kind extension, consumption re-key, backfill

**Files:**

- Create: `supabase/migrations/20260629120500_position_shift_tasks.sql`
- Modify: `supabase/migrations/00000000000000_baseline.sql` (reflect new objects so baseline replay stays authoritative)

**Interfaces:**

- Produces: table `public.position_shift_tasks` (cols below); `shifts.is_opening`, `shifts.is_closing`; `attendance_checklist_items.task_kind` CHECK incl. `inventory_count`; `shift_checklist_consumption_default_items.position_task_id` (new nullable FK to re-key consumption defaults onto position tasks).

- [ ] **Step 1: Write the migration SQL**

```sql
-- 20260629120500_position_shift_tasks.sql
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
```

- [ ] **Step 2: Reflect into baseline + verify replay**

Add the same `CREATE TABLE position_shift_tasks`, the two `shifts` columns, the relaxed attendance CHECK, the new consumption column/index, the RLS policy + grants into `00000000000000_baseline.sql` in the matching sections (tables near line 26224–26378; policies near 36611; grants near 39841). Do NOT add the backfill/data-migration steps to baseline (those are forward-only).

Run: `pnpm db:baseline:local-check`
Expected: PASS (baseline replays clean from empty).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260629120500_position_shift_tasks.sql supabase/migrations/00000000000000_baseline.sql
git commit -m "feat(db): add position_shift_tasks + shift open/close flags (D050 phase 1)"
```

> **Owner gate:** open PR → owner applies migration to prod → run `pnpm db:types` → commit regenerated `packages/database/src/types/database.types.ts`. Phases 2–4 depend on the applied schema; until then use `as unknown as` casts for `position_shift_tasks` reads/writes (existing repo pattern).

### Task 2: Writer RPC `upsert_position_shift_tasks`

**Files:**

- Create: `supabase/migrations/20260629121000_upsert_position_shift_tasks.sql` (+ reflect into baseline)

**Interfaces:**

- Produces: `public.upsert_position_shift_tasks(p_position_id bigint, p_tasks jsonb) RETURNS bigint` — SECURITY DEFINER, derives tenant via `public.auth_tenant_id()`, full delete-and-reinsert of that position's tasks, validates enums + lengths + max 40, returns `p_position_id`. Permission: requires `staff:manage` (owner / authorized manager).

- [ ] **Step 1: Write the RPC** (mirror `upsert_shift_checklist_template` validation; new enums; keyed on position; accepts camelCase JSON `title/kind/applicability/phase/isRequired/doneDefinition`)

```sql
CREATE OR REPLACE FUNCTION public.upsert_position_shift_tasks(p_position_id bigint, p_tasks jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_tasks jsonb := COALESCE(p_tasks, '[]'::jsonb);
  v_item jsonb; v_title text; v_kind text; v_appl text; v_phase text;
  v_done text; v_req boolean; v_sort integer := 0;
BEGIN
  IF NOT (SELECT public.has_permission_any('staff:manage')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.positions WHERE id = p_position_id AND tenant_id = v_tenant_id) THEN
    RAISE EXCEPTION 'position_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(v_tasks) <> 'array' THEN RAISE EXCEPTION 'tasks_invalid' USING ERRCODE='23514'; END IF;
  IF jsonb_array_length(v_tasks) > 40 THEN RAISE EXCEPTION 'too_many_tasks' USING ERRCODE='23514'; END IF;

  DELETE FROM public.position_shift_tasks WHERE tenant_id = v_tenant_id AND position_id = p_position_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_tasks) LOOP
    v_title := btrim(COALESCE(v_item->>'title',''));
    v_kind  := COALESCE(NULLIF(v_item->>'kind',''),'standard');
    v_appl  := COALESCE(NULLIF(v_item->>'applicability',''),'every_shift');
    v_phase := COALESCE(NULLIF(v_item->>'phase',''),'start_of_shift');
    v_done  := btrim(COALESCE(v_item->>'doneDefinition',''));
    v_req   := COALESCE(NULLIF(v_item->>'isRequired','')::boolean, true);
    IF v_title = '' THEN CONTINUE; END IF;
    IF char_length(v_title) > 120 THEN RAISE EXCEPTION 'task_title_too_long' USING ERRCODE='23514'; END IF;
    IF v_kind  <> ALL (ARRAY['standard','consumption_report']::text[]) THEN RAISE EXCEPTION 'task_kind_invalid' USING ERRCODE='23514'; END IF;
    IF v_appl  <> ALL (ARRAY['every_shift','opening','closing']::text[]) THEN RAISE EXCEPTION 'task_applicability_invalid' USING ERRCODE='23514'; END IF;
    IF v_phase <> ALL (ARRAY['start_of_shift','end_of_shift']::text[]) THEN RAISE EXCEPTION 'task_phase_invalid' USING ERRCODE='23514'; END IF;
    IF char_length(v_done) > 240 THEN RAISE EXCEPTION 'done_definition_too_long' USING ERRCODE='23514'; END IF;
    v_sort := v_sort + 1;
    INSERT INTO public.position_shift_tasks
      (tenant_id, position_id, title, kind, applicability, phase, is_required, done_definition, sort_order)
    VALUES (v_tenant_id, p_position_id, v_title, v_kind, v_appl, v_phase, v_req, v_done, v_sort);
  END LOOP;

  RETURN p_position_id;
END; $$;
REVOKE ALL ON FUNCTION public.upsert_position_shift_tasks(bigint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_position_shift_tasks(bigint, jsonb) TO authenticated;
```

- [ ] **Step 2:** Reflect into baseline; `pnpm db:baseline:local-check` → PASS.
- [ ] **Step 3: Commit** `feat(db): upsert_position_shift_tasks RPC (D050 phase 1)`.

> Note: a separate writer for consumption defaults already exists conceptually as `setConsumptionDefaultIngredients`'s RPC path; in this model it re-targets `position_task_id`. If that path is an inline table write (not an RPC), the Server Action (Task 8) writes `shift_checklist_consumption_default_items` directly via service client keyed on `position_task_id`.

---

## Phase 2 — Clock-in RPC rewrite + checkout gate (runtime SQL)

### Task 3: Rewrite `employee_clock_in_with_checklist` (resolve position, explicit flags, count auto-surface)

**Files:**

- Create: `supabase/migrations/20260629122000_clock_in_position_tasks.sql` (CREATE OR REPLACE; + reflect into baseline)

**Interfaces:**

- Consumes: `position_shift_tasks` (Task 1), `shifts.is_opening/is_closing` (Task 1), `inventory_count_assignments` (forward migration 20260627201823).
- Produces: same signature `employee_clock_in_with_checklist(p_tenant_id, p_employee_id, p_branch_id, p_shift_id, p_business_date, p_photo_path) RETURNS bigint` — snapshots the employee's **position** tasks (filtered by the picked shift's `is_opening/is_closing`) into `attendance_checklist_items`, then inserts one `inventory_count` item if the employee has ≥1 active count assignment in this branch.

- [ ] **Step 1: Write the replacement** (key deltas vs current body at baseline.sql:8204 — keep photo check, branch check, dup check, the `attendance_records` insert with `checklist_template_id = NULL`):

```sql
-- Resolve POSITION (not template).
SELECT p.position_id INTO v_position_id
FROM public.employees e
JOIN public.profiles p ON p.id = e.profile_id AND p.tenant_id = e.tenant_id
WHERE e.id = p_employee_id AND e.tenant_id = p_tenant_id AND e.is_active AND p.branch_id = p_branch_id;
IF NOT FOUND THEN RAISE EXCEPTION 'employee_not_found' USING ERRCODE='P0002'; END IF;

-- Read EXPLICIT open/close flags of the picked shift (no MIN/MAX).
SELECT s.is_opening, s.is_closing INTO v_is_open, v_is_close
FROM public.shifts s
WHERE s.id = p_shift_id AND s.tenant_id = p_tenant_id
  AND (s.branch_id IS NULL OR s.branch_id = p_branch_id) AND COALESCE(s.is_active,true);
IF NOT FOUND THEN RAISE EXCEPTION 'shift_not_found' USING ERRCODE='P0002'; END IF;

-- ... (unchanged: dup-clock-in guard, INSERT attendance_records ... checklist_template_id = NULL) ...

-- Snapshot the position's tasks for this shift kind.
INSERT INTO public.attendance_checklist_items
  (tenant_id, attendance_record_id, template_item_id, title, phase, done_definition, is_required, scope, task_kind, sort_order)
SELECT p_tenant_id, v_attendance_id, NULL, t.title, t.phase, t.done_definition, t.is_required,
       t.applicability, t.kind, row_number() OVER (ORDER BY t.sort_order, t.id)::integer
FROM public.position_shift_tasks t
WHERE t.tenant_id = p_tenant_id AND t.position_id = v_position_id AND t.is_active
  AND ( t.applicability = 'every_shift'
        OR (t.applicability = 'opening' AND v_is_open)
        OR (t.applicability = 'closing' AND v_is_close) );

-- Auto-surface ONE count task if the employee has active count assignments in this branch.
IF EXISTS (
  SELECT 1 FROM public.inventory_count_assignments a
  WHERE a.tenant_id = p_tenant_id AND a.branch_id = p_branch_id
    AND a.employee_id = p_employee_id AND a.is_active
) THEN
  INSERT INTO public.attendance_checklist_items
    (tenant_id, attendance_record_id, template_item_id, title, phase, done_definition, is_required, scope, task_kind, sort_order)
  VALUES (p_tenant_id, v_attendance_id, NULL, 'Kiểm kê tồn', 'end_of_shift',
          'Nộp phiếu đếm tại màn Kiểm kê tồn.', false, 'every_shift', 'inventory_count',
          COALESCE((SELECT max(sort_order) FROM public.attendance_checklist_items WHERE attendance_record_id = v_attendance_id), 0) + 1);
END IF;
```

> `template_item_id` is now always NULL (the FK to template_items remains but is unused; Phase 6 may repurpose/drop). `scope` column on the snapshot keeps the applicability value for backward shape; phase only ever `start_of_shift`/`end_of_shift` for new rows. The count item is `is_required = false` in v1 (non-blocking) — **ponytail: count item is informational in v1; to make it gate checkout, set is_required=true and sync is_done from the count-slip submit RPC (Task 3a, deferred).** Empty position config → zero snapshot rows → checkout naturally ungated (legitimate "no tasks" position; surfaced to owner in coverage, Task 9).

- [ ] **Step 2:** Reflect into baseline (replace the function body in place); `pnpm db:baseline:local-check` → PASS.
- [ ] **Step 3:** `employee_request_clock_out` (baseline.sql:8390) needs **no change** — it already gates on `is_required AND NOT is_done`, which now includes any required position tasks. Confirm by reading it; do not edit.
- [ ] **Step 4: Commit** `feat(db): clock-in snapshots position tasks + auto count task (D050 phase 2)`.

---

## Phase 3 — HR config UI: 6 surfaces → 2

> Replace `ChecklistTemplatesTable`, `ConsumptionDefaultItemsTable`, `PositionDefaultsTable`, and the employee-override select with: **(A)** open/close toggles on the existing shifts table, and **(B)** a per-position "Việc trong ca" editor. Remove the now-dead Server Actions.

### Task 4: Shifts open/close toggles

**Files:**

- Modify: `apps/web/app/(protected)/hr/shifts-table.tsx` (add two switches per row), the shifts Server Action file (add `setShiftShiftKind` or extend the existing update action with `isOpening`/`isClosing`).

**Interfaces:**

- Produces: Server Action `setShiftBoundaries({ shiftId, isOpening, isClosing })` (Zod-validated) → `UPDATE public.shifts SET is_opening, is_closing` via service client (tenant + `staff:manage` gate).

- [ ] **Step 1:** Add Zod schema + Server Action (follow existing shift update action shape). Validate booleans; tenant + permission check; return `{ success }` discriminated union (repo pattern).
- [ ] **Step 2:** Add two Má Tư DS `Switch`/`Checkbox` columns ("Ca mở", "Ca đóng") to the shifts table; copy via `messages.hr`. No inline Vietnamese.
- [ ] **Step 3:** Commit `feat(hr): shift open/close flags UI (D050 phase 3)`.

### Task 5: "Vị trí → Việc trong ca" editor

**Files:**

- Create: `apps/web/app/(protected)/hr/position-tasks/position-tasks-client.tsx` (per-position task list editor)
- Create: `apps/web/app/(protected)/hr/position-tasks-actions.ts` (`"use server"` leaf — see `reference_use_server_no_reexport`)
- Modify: `apps/web/app/(protected)/hr/page.tsx` (render the new section; remove the 3 old config sections + employee override)

**Interfaces:**

- Consumes: `upsert_position_shift_tasks` RPC (Task 2); consumption defaults table (Task 1 col `position_task_id`).
- Produces: Server Action `savePositionTasks({ positionId, tasks: PositionTaskInput[] })` where `PositionTaskInput = { title; kind: 'standard'|'consumption_report'; applicability: 'every_shift'|'opening'|'closing'; phase: 'start_of_shift'|'end_of_shift'; isRequired: boolean; doneDefinition: string }`; and `setPositionTaskConsumptionIngredients({ positionTaskId, ingredientIds, notes })`.

- [ ] **Step 1: Write the Server Actions** (Zod schemas mirroring the vocabulary block; call the RPC; consumption defaults written to `shift_checklist_consumption_default_items` keyed on `position_task_id` via service client — delete-and-reinsert active rows, same as the old `setConsumptionDefaultIngredients`). Return discriminated `{ success: true } | { success: false; error }`. Never leak raw PG errors — map known ERRCODE/`error.message` codes (`position_not_found`, `too_many_tasks`, `*_invalid`) to friendly `messages.hr` strings.
- [ ] **Step 2: Write the editor client** — RHF + `useFieldArray` for the task rows (D010 stack), one row per việc with: title input, kind select, applicability select, phase select, required switch, done-definition input; consumption rows reveal an ingredient multi-select inline when `kind === 'consumption_report'`. Position picker at top. Save → `savePositionTasks`. Follow the existing `ChecklistTemplatesTable` interaction patterns for add/remove/reorder.
- [ ] **Step 3: Rewire `hr/page.tsx`** — the setup tab now renders only **Ca làm** (Task 4) + **Vị trí → Việc trong ca** (this task) + the **coverage** panel (Task 9). Delete the JSX + imports for `ChecklistTemplatesTable`, `ConsumptionDefaultItemsTable`, `PositionDefaultsTable`, and the employee-table checklist-override column.
- [ ] **Step 4:** `pnpm typecheck && pnpm lint` → PASS. Commit `feat(hr): per-position Việc trong ca editor (D050 phase 3)`.

### Task 6: Remove dead config Server Actions + template UI

**Files:**

- Delete: `apps/web/app/(protected)/hr/checklist-templates-table.tsx`, `consumption-default-items-table.tsx`, `position-defaults-table.tsx`.
- Modify: `apps/web/app/(protected)/hr/checklist-actions.ts` — remove `saveChecklistTemplate`, `setConsumptionDefaultIngredients`, `setPositionDefaultChecklist`, `setEmployeeDefaultChecklist`, `archiveChecklistTemplate`. Keep nothing template-related (the file may be deleted if empty; repoint any remaining callers).

- [ ] **Step 1:** Grep for every import of the deleted symbols/components; remove or repoint. Run: `rg "saveChecklistTemplate|setConsumptionDefaultIngredients|setPositionDefaultChecklist|setEmployeeDefaultChecklist|archiveChecklistTemplate|ChecklistTemplatesTable|ConsumptionDefaultItemsTable|PositionDefaultsTable"` → expect zero hits after edits.
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm build` → PASS. Commit `refactor(hr): drop template-based checklist config (D050 phase 3)`.

---

## Phase 4 — Staff runtime UI: unified "Việc trong ca"

### Task 7: `today-work-state.ts` — 2 phases + virtual count item

**Files:**

- Modify: `apps/web/lib/staff-runtime/_lib/today-work-state.ts`

**Interfaces:**

- Produces: `TodayChecklistTaskKind = 'standard' | 'consumption_report' | 'inventory_count'`; `TodayChecklistItem.phase: 'start_of_shift' | 'end_of_shift'`; the checklist now may include a synthesized `inventory_count` item (id negative sentinel, `templateItemId: null`) whose `done` = (all of today's assigned-location count slips for this employee are submitted/approved). Keep `requiredTotal/requiredRemaining` driven by real DB rows only (the virtual count item is non-required in v1).

- [ ] **Step 1: Write the failing test** `apps/web/tests/employee-today-checklist-phases.test.ts` (static; feed a fake checklist-items array into a pure helper):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupChecklistByPhase } from "../lib/staff-runtime/_lib/today-work-state";

test("groups items into start/end only, count item lands in end", () => {
  const items = [
    { id: 1, phase: "start_of_shift", taskKind: "standard", done: false },
    { id: 2, phase: "end_of_shift", taskKind: "standard", done: true },
    { id: -1, phase: "end_of_shift", taskKind: "inventory_count", done: false },
  ] as any;
  const groups = groupChecklistByPhase(items);
  assert.equal(groups.start_of_shift.length, 1);
  assert.equal(groups.end_of_shift.length, 2);
});
```

- [ ] **Step 2:** Run `pnpm --filter @comtammatu/web test -- tests/employee-today-checklist-phases.test.ts` → FAIL (helper not exported).
- [ ] **Step 3:** Extract a pure `export function groupChecklistByPhase(items)` over phases `['start_of_shift','end_of_shift']`; update `normalizeTaskKind` to pass through `inventory_count`; after loading DB items, compute and append the virtual count item when the employee has active assignments with remaining un-submitted slips today (query `inventory_count_assignments` + `inventory_count_slips`).
- [ ] **Step 4:** Run test → PASS. `pnpm typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(employee): 2-phase grouping + virtual count task (D050 phase 4)`.

### Task 8: `tasks-client.tsx` + `tasks/page.tsx` — render 2 phases, count row

**Files:**

- Modify: `apps/web/lib/staff-runtime/tasks/tasks-client.tsx`, `apps/web/lib/staff-runtime/tasks/page.tsx`

- [ ] **Step 1:** Change `CHECKLIST_PHASES` to `['start_of_shift','end_of_shift']`; render the `inventory_count` item as a row that links to `/br/[branchId]/stock/count` (no checkbox; status from `done`); keep the consumption inline panel (gated on a `consumption_report` item being present, unchanged logic). Phase headings from `messages.employee.tasks.phaseLabels` (now 2 keys).
- [ ] **Step 2:** `pnpm typecheck && pnpm lint` → PASS. Commit `feat(employee): unified Việc trong ca surface (D050 phase 4)`.

### Task 9: Coverage panel — position-based

**Files:**

- Modify: `apps/web/app/(protected)/hr/checklist-coverage.ts` + its panel component.

**Interfaces:**

- Produces: coverage status per **position** ∈ `{ ok, no_tasks, missing_consumption_defaults }` (drop `custom_checklist` — no more per-employee override) + a Kiểm kê line showing how many employees have active count assignments per branch (read-only, links to `/inventory/count-assignments`).

- [ ] **Step 1: Update the failing test** `apps/web/tests/hr-checklist-coverage.test.ts` to the new status union (it currently asserts `missing_checklist`/`custom_checklist`). Write assertions for `no_tasks` (position with zero `position_shift_tasks`) and `missing_consumption_defaults` (a `consumption_report` task with no active `position_task_id` defaults).
- [ ] **Step 2:** Run → FAIL. Rewrite `checklist-coverage.ts` computation over positions + `position_shift_tasks` + consumption defaults. Run → PASS.
- [ ] **Step 3:** Commit `feat(hr): position-based checklist coverage (D050 phase 4)`.

---

## Phase 5 — Naming canon + i18n baseline

### Task 10: Rename to "Việc trong ca" across copy + nav

**Files:**

- Modify: `apps/web/lib/messages/employee.ts`, `hr.ts`, `inventory.ts`; `packages/shared/src/labels/vi.ts`; employee `bottom-nav.tsx` (`copy.tasks`); `packages/shared/src/auth/nav-config.ts` / `app/lib/office-nav.ts` entries.

- [ ] **Step 1:** Replace every "Checklist" / "Mẫu checklist" / standalone "Việc" label for this concept with **"Việc trong ca"**; phase labels → `{ start_of_shift: 'Đầu ca', end_of_shift: 'Cuối ca' }`; kind labels → `Việc thường` / `Tiêu hao` / `Kiểm kê tồn`. Keep one canonical key; delete duplicates. No string left in JSX.
- [ ] **Step 2:** `pnpm lint:i18n:baseline` then `pnpm lint:i18n:no-grow` → PASS (count must not grow). `pnpm lint && pnpm test` → PASS.
- [ ] **Step 3:** Commit `feat(i18n): canonical 'Việc trong ca' naming (D050 phase 5)`.

### Task 11: TS vocabulary twin + types

**Files:**

- Modify/Create: the `checklist-types.ts` successor (e.g. `position-task-types.ts`) exporting `POSITION_TASK_KINDS`, `POSITION_TASK_PHASES`, `POSITION_TASK_APPLICABILITY` unions + label maps; update `employee-consumption-task-kind.test.ts` for the `inventory_count` addition.

- [ ] **Step 1:** Define the literal unions to match the CHECKs (vocabulary block). Update the consumption-task-kind test. `pnpm --filter @comtammatu/web test` → PASS.
- [ ] **Step 2:** Commit `refactor(hr): position-task TS vocabulary (D050 phase 5)`.

---

## Phase 6 — Drop dead schema (AFTER prod-verified)

### Task 12: Removal migration

**Files:**

- Create: `supabase/migrations/20260629130000_drop_checklist_templates.sql` (+ reflect into baseline by deleting those objects there).

- [ ] **Step 1:** Only after Phases 1–5 are merged and verified in prod: `DROP TABLE shift_checklist_template_items, shift_checklist_templates CASCADE;` drop `positions.default_checklist_template_id`, `employees.default_checklist_template_id`, `shift_checklist_templates.role_code`, `shift_checklist_consumption_default_items.template_item_id`; `DROP FUNCTION upsert_shift_checklist_template`; `apply_checklist_template_to_role` (legacy, unused). Verify no code references remain (`rg default_checklist_template_id`).
- [ ] **Step 2:** Reflect into baseline; `pnpm db:baseline:local-check` → PASS. Owner applies to prod → `pnpm db:types`.
- [ ] **Step 3:** Commit `chore(db): drop legacy checklist templates (D050 phase 6)`.

---

## Self-Review

**Spec coverage:** §1 model → Tasks 1,2,7,11. §2 config flow (6→2) → Tasks 4,5,6,9. §3 employee surface → Tasks 7,8. §4 Kiểm kê auto-surface → Tasks 1(kind),3(insert),7(virtual done). §5 bẫy ẩn: P7→Task1/3 flags; P6→Task3 note (dissolves under direct model)+Task9 coverage; P4 weekly→Task1 migration drops it; P8→Task3 Step3 (single gate, no TS dup — Task 8 keeps consumption inline but removes the redundant TS checkout-status gate: **add to Task 8** verifying `approveCheckoutRequest` no longer double-gates). §6 naming → Tasks 10,11. §7 schema/migration → Tasks 1,2,12. §8 untouched cores → respected (no edits to count blind RPCs or consumption approval/WAC).

**Gap found + fixed:** P8 (remove redundant TS consumption checkout gate in `approveCheckoutRequest`) was implicit — **explicitly add as Task 8 Step 1b:** locate the consumption-status check in `checkout-approvals` / `approveCheckoutRequest` and remove it, relying solely on the SQL `is_required/is_done` gate. Add a static test asserting a submitted-but-unapproved consumption report no longer blocks the approver beyond the checklist item state.

**Placeholder scan:** none — every SQL block is complete; UI tasks reference exact files + interfaces + existing patterns.

**Type consistency:** `kind`/`phase`/`applicability` unions identical across vocabulary block, Task 1 CHECKs, Task 2 RPC validation, Task 7 TS, Task 11 twin. `inventory_count` appears only in `attendance_checklist_items` CHECK (Task 1) + runtime (Tasks 3,7,8), never in `position_shift_tasks`.

## Open dependencies / risks

1. **Owner prod-apply gates Phases 2–4** (types must regen after Task 1). Sequence: Task 1 PR → owner apply → `db:types` → resume.
2. **Count→checklist done sync** is v1-virtual (TS-computed, non-blocking). Upgrade path (required + RPC sync) documented in Task 3 Step 1.
3. **Position is tenant-level** → tasks shared across both branches (confirmed design §3 / D050). If a branch ever needs different tasks, add `branch_id` nullable to `position_shift_tasks` later (not in scope).
