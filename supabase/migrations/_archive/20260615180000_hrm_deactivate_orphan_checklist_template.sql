-- D027 follow-up (B): deactivate the orphan "Tạp vụ - Chi nhánh" checklist template.
--
-- The 20260615160000 seed created the 7 canonical templates but did not remove a
-- pre-existing duplicate ("Tạp vụ - Chi nhánh", created 2026-06-10), leaving prod at
-- 8 templates / 105 items instead of the intended 7 / 95. Verified on prod
-- 2026-06-15: this template is referenced by 0 employees, 0 positions, and 0
-- attendance snapshots, so deactivating it removes it from the template UI and
-- clock-in resolution with no dependency impact.
--
-- Deactivate (not delete) — reversible, and keeps the row available if it turns out
-- to be intentional. Re-enable with: UPDATE ... SET is_active = true WHERE id = <id>.

BEGIN;

UPDATE public.shift_checklist_templates
SET is_active = false,
    updated_at = now()
WHERE name = 'Tạp vụ - Chi nhánh'
  AND branch_id IS NULL
  AND is_active = true;

COMMIT;
