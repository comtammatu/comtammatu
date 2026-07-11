-- D027 follow-up (C): re-map legacy attendance rows that still point at the
-- deactivated per-branch shifts ("Ca ngày"/"Ca tối") onto the global shifts.
--
-- The 20260615130000 backfill only set shift_id for rows where it was NULL (to make
-- the column NOT NULL); rows that already carried a per-branch shift_id were left
-- pointing at shifts that the same migration deactivated. Verified on prod
-- 2026-06-15: 18 such rows, all map cleanly (16 → Ca sáng, 2 → Ca chiều), 0 unique
-- collisions. This makes the global shift set the single source for shift display
-- (per the D027 intent) and lets the 5 deactivated per-branch shifts be cleaned up
-- later (they are currently pinned by FK RESTRICT).
--
-- Mapping mirrors 20260615130000 exactly: check-in before 15:00 VN → Ca sáng,
-- otherwise Ca chiều, NULL check-in → Ca sáng. The NOT EXISTS guard skips any row
-- that would collide with an existing (employee, date, target shift) record, so the
-- migration stays safe even if new rows appear before it is applied.

BEGIN;

UPDATE public.attendance_records ar
SET shift_id = g.id
FROM public.shifts old_s, public.shifts g
WHERE ar.shift_id = old_s.id
  AND old_s.is_active = false
  AND old_s.branch_id IS NOT NULL
  AND g.tenant_id = ar.tenant_id
  AND g.branch_id IS NULL
  AND g.is_active = true
  AND g.name = CASE
    WHEN ar.check_in IS NULL THEN 'Ca sáng'
    WHEN EXTRACT(HOUR FROM (ar.check_in AT TIME ZONE 'Asia/Ho_Chi_Minh')) < 15
      THEN 'Ca sáng'
    ELSE 'Ca chiều'
  END
  AND NOT EXISTS (
    SELECT 1
    FROM public.attendance_records x
    WHERE x.tenant_id = ar.tenant_id
      AND x.employee_id = ar.employee_id
      AND x.date = ar.date
      AND x.shift_id = g.id
      AND x.id <> ar.id
  );

COMMIT;
