BEGIN;

-- Drop two genuinely-redundant unused indexes (Tier A, conservative). Both have
-- idx_scan=0 in PROD (pg_stat_user_indexes), back no PK/UNIQUE/exclusion
-- constraint, are not a replica-identity index, and leave every foreign key
-- still covered by a surviving index:
--   ix_notifications_tenant_branch_created_cover -> superseded by
--     ix_notifications_tenant_branch_created (same leading columns
--     tenant_id, target_branch_id, created_at DESC; the dropped index only adds
--     an unused INCLUDE payload). notifications FKs stay covered.
--   idx_orders_pos_session_created_at -> the orders.pos_session_id FK stays
--     covered by idx_orders_pos_session on (pos_session_id).
-- DROP INDEX IF EXISTS is idempotent; these indexes are unused so lock
-- contention is nil (CONCURRENTLY is disallowed inside a transaction).
-- idx_order_status_history_tenant is intentionally NOT dropped: it is the sole
-- cover for order_status_history_tenant_id_fkey on a write-active table and has
-- a recorded scan (idx_scan>0).

DROP INDEX IF EXISTS public.ix_notifications_tenant_branch_created_cover;
DROP INDEX IF EXISTS public.idx_orders_pos_session_created_at;

DO $$
DECLARE
  v_remaining int;
  v_super_notif int;
  v_super_orders int;
BEGIN
  -- The two target indexes must be gone.
  SELECT count(*) INTO v_remaining
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname IN (
      'ix_notifications_tenant_branch_created_cover',
      'idx_orders_pos_session_created_at'
    );
  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'tier-A index drop incomplete: % target index(es) still present', v_remaining;
  END IF;

  -- The superseding indexes that keep the FKs / query paths covered must remain.
  SELECT count(*) INTO v_super_notif
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname = 'ix_notifications_tenant_branch_created';
  IF v_super_notif <> 1 THEN
    RAISE EXCEPTION 'superseding index ix_notifications_tenant_branch_created missing; aborting drop';
  END IF;

  SELECT count(*) INTO v_super_orders
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname = 'idx_orders_pos_session';
  IF v_super_orders <> 1 THEN
    RAISE EXCEPTION 'superseding index idx_orders_pos_session missing; aborting drop';
  END IF;
END $$;

COMMIT;
