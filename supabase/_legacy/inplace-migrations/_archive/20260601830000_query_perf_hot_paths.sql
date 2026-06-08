-- =============================================================
-- Query performance hot paths
--
-- Scope:
-- 1) Add direct-match indexes for KDS board and order item fan-out reads.
-- 2) Add notification indexes used by unread count/read fan-out paths.
-- 3) Make notification unread RPCs expose the same visibility predicates as
--    normal RLS so the planner can use tenant/role/branch indexes earlier.
--
-- Production policy: owner applies this migration manually after merge.
-- =============================================================

-- KDS board query shape:
--   WHERE branch_id = ? AND status = ANY(?) ORDER BY created_at ASC
-- The tenant-led index from 20260524000000 remains useful when the planner
-- can push RLS tenant predicates. This branch-led index matches PostgREST's
-- explicit filter directly and avoids falling back to a plain created_at scan.
CREATE INDEX IF NOT EXISTS idx_kds_tickets_branch_created_live
  ON public.kds_tickets (branch_id, created_at ASC)
  INCLUDE (
    tenant_id,
    status,
    station_id,
    order_id,
    order_item_id,
    kitchen_send_batch_id,
    bumped_at,
    updated_at
  )
  WHERE status IN ('pending', 'preparing', 'ready');

-- KDS/POS fan-out query shape:
--   WHERE order_id = ANY(?)
-- RLS adds tenant_id, so keep a tenant+order index alongside the legacy
-- order_id-only index.
CREATE INDEX IF NOT EXISTS idx_order_items_tenant_order_menu
  ON public.order_items (tenant_id, order_id, menu_item_id)
  INCLUDE (item_name, variant_name, quantity, unit_price, status, note);

-- Notification center hot paths:
-- - count unread for current user
-- - mark all visible unread rows as read
-- - list recent visible rows by tenant/branch/role
CREATE INDEX IF NOT EXISTS ix_notifications_tenant_branch_created_cover
  ON public.notifications (tenant_id, target_branch_id, created_at DESC)
  INCLUDE (target_roles, expires_at);

CREATE INDEX IF NOT EXISTS ix_notifications_target_roles_gin
  ON public.notifications USING gin (target_roles);

CREATE INDEX IF NOT EXISTS ix_notification_reads_user_notification
  ON public.notification_reads (user_id, notification_id);

-- Count unread notifications visible to caller.
-- SECURITY DEFINER avoids per-row RLS helper calls on the notification feed,
-- but the function keeps the exact tenant/role/branch/expiry/read predicates
-- from notifications_select inline.
CREATE OR REPLACE FUNCTION public.count_unread_notifications()
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ctx AS MATERIALIZED (
    SELECT
      auth.uid() AS user_id,
      public.auth_tenant_id() AS tenant_id,
      public.auth_branch_id() AS branch_id,
      public.auth_role() AS user_role
  )
  SELECT count(*)::bigint
  FROM ctx
  JOIN public.notifications n
    ON n.tenant_id = ctx.tenant_id
  WHERE ctx.user_id IS NOT NULL
    AND ctx.tenant_id IS NOT NULL
    AND ctx.user_role IS NOT NULL
    AND n.target_roles @> ARRAY[ctx.user_role]::text[]
    AND (
      n.target_branch_id IS NULL
      OR n.target_branch_id = ctx.branch_id
      OR ctx.user_role IN ('owner', 'super_manager', 'area_manager')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.notification_reads r
      WHERE r.notification_id = n.id
        AND r.user_id = ctx.user_id
    )
    AND (n.expires_at IS NULL OR n.expires_at > now());
$$;

REVOKE ALL ON FUNCTION public.count_unread_notifications()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_unread_notifications() TO authenticated;

-- Mark all visible notifications as read for the caller.
-- Mirrors count_unread_notifications() and inserts only rows visible under the
-- explicit tenant/role/branch predicate.
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  WITH ctx AS MATERIALIZED (
    SELECT
      auth.uid() AS user_id,
      public.auth_tenant_id() AS tenant_id,
      public.auth_branch_id() AS branch_id,
      public.auth_role() AS user_role
  ),
  visible_unread AS (
    SELECT n.id, ctx.user_id
    FROM ctx
    JOIN public.notifications n
      ON n.tenant_id = ctx.tenant_id
    WHERE ctx.user_id IS NOT NULL
      AND ctx.tenant_id IS NOT NULL
      AND ctx.user_role IS NOT NULL
      AND n.target_roles @> ARRAY[ctx.user_role]::text[]
      AND (
        n.target_branch_id IS NULL
        OR n.target_branch_id = ctx.branch_id
        OR ctx.user_role IN ('owner', 'super_manager', 'area_manager')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.notification_reads r
        WHERE r.notification_id = n.id
          AND r.user_id = ctx.user_id
      )
      AND (n.expires_at IS NULL OR n.expires_at > now())
  )
  INSERT INTO public.notification_reads (notification_id, user_id)
  SELECT id, user_id
  FROM visible_unread
  ON CONFLICT (notification_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_all_notifications_read()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
