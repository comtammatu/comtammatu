-- Allow consumption default rows to be keyed on position_task_id without a
-- legacy template_item_id. The position-task redesign writes defaults directly
-- onto position tasks; template_item_id stays for legacy rows until Phase 6.

BEGIN;

ALTER TABLE public.shift_checklist_consumption_default_items
  ALTER COLUMN template_item_id DROP NOT NULL;

-- Every active row must be anchored to exactly one parent (template item OR
-- position task), never neither.
ALTER TABLE public.shift_checklist_consumption_default_items
  DROP CONSTRAINT IF EXISTS shift_checklist_consumption_default_items_parent_present;
ALTER TABLE public.shift_checklist_consumption_default_items
  ADD CONSTRAINT shift_checklist_consumption_default_items_parent_present
  CHECK (template_item_id IS NOT NULL OR position_task_id IS NOT NULL);

COMMIT;
