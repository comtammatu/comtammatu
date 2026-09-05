-- Migration: notification_targeting_and_badge_alignment
-- Align unread notification counts with feed RLS, return target_branch_id,
-- enforce target_user_id privacy, and provide entity notification acknowledgement.

-- 1. count_unread_notifications_by_target
DROP FUNCTION IF EXISTS public.count_unread_notifications_by_target();

CREATE FUNCTION public.count_unread_notifications_by_target()
RETURNS TABLE(kind text, action_url text, target_branch_id bigint, unread_count bigint)
LANGUAGE sql STABLE
SET search_path TO ''
AS $$
  SELECT
    notification.kind,
    notification.action_url,
    notification.target_branch_id,
    count(*)::bigint AS unread_count
  FROM public.notifications AS notification
  LEFT JOIN public.notification_reads AS notification_read
    ON notification_read.notification_id = notification.id
   AND notification_read.user_id = (SELECT auth.uid())
  WHERE notification_read.notification_id IS NULL
    AND (
      notification.expires_at IS NULL
      OR notification.expires_at > now()
    )
    AND (
      NOT (notification.meta ? 'target_user_id')
      OR (notification.meta ->> 'target_user_id') = (SELECT auth.uid())::text
    )
  GROUP BY notification.kind, notification.action_url, notification.target_branch_id;
$$;

REVOKE ALL ON FUNCTION public.count_unread_notifications_by_target() FROM PUBLIC;
GRANT ALL ON FUNCTION public.count_unread_notifications_by_target() TO authenticated;
GRANT ALL ON FUNCTION public.count_unread_notifications_by_target() TO service_role;
COMMENT ON FUNCTION public.count_unread_notifications_by_target() IS 'RLS-scoped unread notification counts grouped by navigation target and branch.';

-- 2. count_unread_notifications
CREATE OR REPLACE FUNCTION public.count_unread_notifications()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
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
      OR ctx.user_role IN ('owner')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.notification_reads r
      WHERE r.notification_id = n.id
        AND r.user_id = ctx.user_id
    )
    AND (n.expires_at IS NULL OR n.expires_at > now())
    AND (
      NOT (n.meta ? 'target_user_id')
      OR (n.meta ->> 'target_user_id') = ctx.user_id::text
    );
$$;

REVOKE ALL ON FUNCTION public.count_unread_notifications() FROM PUBLIC;
GRANT ALL ON FUNCTION public.count_unread_notifications() TO authenticated;
GRANT ALL ON FUNCTION public.count_unread_notifications() TO service_role;
COMMENT ON FUNCTION public.count_unread_notifications() IS 'Total unread notifications for current caller, strictly isolating personal notifications.';

-- 3. Update RLS policy notifications_select to enforce target_user_id
DROP POLICY IF EXISTS notifications_select ON public.notifications;

CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated USING (
  ((tenant_id = public.auth_tenant_id())
   AND ((SELECT public.auth_role() AS auth_role) = ANY (target_roles))
   AND (
     (target_branch_id IS NULL)
     OR (target_branch_id = public.auth_branch_id())
     OR ((SELECT public.auth_role() AS auth_role) = ANY (ARRAY['owner'::text]))
   )
   AND (
     NOT (meta ? 'target_user_id')
     OR (meta ->> 'target_user_id') = (SELECT auth.uid())::text
   ))
);

-- 4. RPC mark_entity_notifications_read
CREATE OR REPLACE FUNCTION public.mark_entity_notifications_read(
  p_entity_type text,
  p_entity_id bigint
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_count integer := 0;
BEGIN
  IF v_user_id IS NULL OR v_tenant_id IS NULL OR p_entity_type IS NULL OR p_entity_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH target_notifs AS (
    SELECT n.id
    FROM public.notifications n
    WHERE n.tenant_id = v_tenant_id
      AND n.entity_type = p_entity_type
      AND n.entity_id = p_entity_id
      AND (n.expires_at IS NULL OR n.expires_at > now())
      AND NOT EXISTS (
        SELECT 1
        FROM public.notification_reads r
        WHERE r.notification_id = n.id
          AND r.user_id = v_user_id
      )
  ),
  inserted AS (
    INSERT INTO public.notification_reads (notification_id, user_id, read_at)
    SELECT id, v_user_id, now()
    FROM target_notifs
    ON CONFLICT (notification_id, user_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_count FROM inserted;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_entity_notifications_read(text, bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_entity_notifications_read(text, bigint) TO authenticated;
GRANT ALL ON FUNCTION public.mark_entity_notifications_read(text, bigint) TO service_role;
COMMENT ON FUNCTION public.mark_entity_notifications_read(text, bigint) IS 'Acknowledge all unread notifications for a specific business entity for the current caller.';
