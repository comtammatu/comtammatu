BEGIN;

-- Covering indexes for the highest-value unindexed foreign keys on hot tables
-- (performance advisor `unindexed_foreign_keys`). Scoped to FK columns that are
-- real filter/join keys on the largest/hottest tables; single-tenant tenant_id
-- columns (no selectivity) and pure user-audit refs (created_by/changed_by, rarely
-- filtered) are deliberately left for a later, telemetry-driven wave. Plain
-- CREATE INDEX (not CONCURRENTLY) is fine here: the tables are <= ~17k rows at
-- pilot scale, so the build holds its lock sub-second.

CREATE INDEX IF NOT EXISTS print_jobs_printer_id_idx
  ON public.print_jobs (printer_id);

CREATE INDEX IF NOT EXISTS kitchen_send_batches_order_id_idx
  ON public.kitchen_send_batches (order_id);

CREATE INDEX IF NOT EXISTS kitchen_send_batches_branch_id_idx
  ON public.kitchen_send_batches (branch_id);

CREATE INDEX IF NOT EXISTS notifications_target_branch_id_idx
  ON public.notifications (target_branch_id);

DO $$
DECLARE
  v_missing int;
BEGIN
  SELECT count(*) INTO v_missing
  FROM (VALUES
    ('print_jobs_printer_id_idx'),
    ('kitchen_send_batches_order_id_idx'),
    ('kitchen_send_batches_branch_id_idx'),
    ('notifications_target_branch_id_idx')
  ) AS want(name)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_indexes i
    WHERE i.schemaname = 'public' AND i.indexname = want.name
  );

  IF v_missing <> 0 THEN
    RAISE EXCEPTION 'fk covering index wave incomplete: % expected indexes missing', v_missing;
  END IF;
END $$;

COMMIT;
