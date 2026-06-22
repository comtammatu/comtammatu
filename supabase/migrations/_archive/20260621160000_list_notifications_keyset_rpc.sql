-- Keyset pagination + SQL-side unread filter for the notifications list.
-- Replaces a PostgREST embed (42702 ambiguous-column footgun) plus a JS
-- post-filter that broke keyset hasMore in unread-only mode. SECURITY INVOKER:
-- notifications_select + notification_reads RLS scope the rows; user is auth.uid().
CREATE OR REPLACE FUNCTION public.list_notifications(
  p_limit       integer DEFAULT 20,
  p_before      timestamptz DEFAULT NULL,
  p_unread_only boolean DEFAULT false
)
  RETURNS TABLE (
    id bigint,
    tenant_id bigint,
    target_branch_id bigint,
    target_roles text[],
    kind text,
    severity text,
    title text,
    body text,
    entity_type text,
    entity_id bigint,
    action_url text,
    meta jsonb,
    created_at timestamptz,
    expires_at timestamptz,
    read_at timestamptz
  )
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path TO ''
  AS $$
  SELECT
    n.id, n.tenant_id, n.target_branch_id, n.target_roles,
    n.kind, n.severity, n.title, n.body,
    n.entity_type, n.entity_id, n.action_url, n.meta,
    n.created_at, n.expires_at,
    r.read_at
  FROM public.notifications n
  LEFT JOIN public.notification_reads r
    ON r.notification_id = n.id
   AND r.user_id = (SELECT auth.uid())
  WHERE (p_before IS NULL OR n.created_at < p_before)
    AND (NOT p_unread_only OR r.read_at IS NULL)
  -- id tie-break: created_at can collide to the microsecond for batch inserts;
  -- without it the created_at-only cursor could skip/dup a row at a page edge.
  ORDER BY n.created_at DESC, n.id DESC
  -- limit+1 so the caller derives hasMore; clamp to the action's 1..50 range.
  LIMIT least(greatest(p_limit, 1), 50) + 1;
$$;

REVOKE ALL ON FUNCTION public.list_notifications(integer, timestamptz, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_notifications(integer, timestamptz, boolean) TO authenticated;
