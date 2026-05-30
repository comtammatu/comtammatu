-- =============================================================
-- Notification Center (Phase B) — base tables, RLS, grants
-- =============================================================
-- Notifications are targeted by (target_roles, target_branch_id).
-- RLS enforces visibility: a user sees a row only if their role is in
-- target_roles AND (target_branch_id IS NULL OR matches their branch,
-- or they are owner/super_manager/area_manager — tenant-wide visibility).
-- Read-state is stored per-user in notification_reads.

-- =====================
-- notifications
-- =====================
CREATE TABLE public.notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_branch_id BIGINT REFERENCES public.branches(id) ON DELETE CASCADE,
  target_roles TEXT[] NOT NULL CHECK (array_length(target_roles, 1) >= 1),
  kind TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  body TEXT,
  entity_type TEXT,
  entity_id BIGINT,
  action_url TEXT,
  dedup_key TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX ux_notifications_dedup
  ON public.notifications(tenant_id, dedup_key)
  WHERE dedup_key IS NOT NULL;

CREATE INDEX ix_notifications_tenant_created
  ON public.notifications(tenant_id, created_at DESC);

CREATE INDEX ix_notifications_tenant_branch_created
  ON public.notifications(tenant_id, target_branch_id, created_at DESC);

CREATE INDEX ix_notifications_entity
  ON public.notifications(entity_type, entity_id)
  WHERE entity_type IS NOT NULL;

COMMENT ON TABLE public.notifications IS
  'Phase B notification feed. Rows are NOT per-user — targeting is by role+branch and RLS enforces visibility.';
COMMENT ON COLUMN public.notifications.kind IS
  'Event kind, e.g. pos.order_new | workflow.po_pending_approval | inventory.stock_low | inventory.expiry_soon';
COMMENT ON COLUMN public.notifications.dedup_key IS
  'Optional per-tenant dedup key, e.g. stock_low:ingredient:42:2026-04-25';

-- =====================
-- notification_reads
-- =====================
CREATE TABLE public.notification_reads (
  notification_id BIGINT NOT NULL
    REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX ix_notification_reads_user
  ON public.notification_reads(user_id, read_at DESC);

COMMENT ON TABLE public.notification_reads IS
  'Per-user read-state for notifications (presence of row = read).';

-- =====================
-- RLS
-- =====================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

-- SELECT: tenant match, role match, and branch scope
CREATE POLICY notifications_select ON public.notifications
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = ANY (target_roles)
    AND (
      target_branch_id IS NULL
      OR target_branch_id = public.auth_branch_id()
      OR public.auth_role() IN ('owner', 'super_manager', 'area_manager')
    )
  );

-- INSERT/UPDATE/DELETE for authenticated users is denied.
-- SECURITY DEFINER triggers + service_role (edge functions) do writes.

-- notification_reads: user fully manages own rows
CREATE POLICY notification_reads_select_own ON public.notification_reads
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY notification_reads_insert_own ON public.notification_reads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY notification_reads_delete_own ON public.notification_reads
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- =====================
-- GRANTS
-- =====================
GRANT SELECT ON public.notifications TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.notification_reads TO authenticated;

-- =====================
-- Helper RPCs
-- =====================

-- Count unread notifications visible to caller.
-- Uses notifications RLS for visibility and LEFT JOIN reads for read-state.
CREATE OR REPLACE FUNCTION public.count_unread_notifications()
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT count(*)::bigint
  FROM public.notifications n
  LEFT JOIN public.notification_reads r
    ON r.notification_id = n.id AND r.user_id = auth.uid()
  WHERE r.notification_id IS NULL
    AND (n.expires_at IS NULL OR n.expires_at > now());
$$;

GRANT EXECUTE ON FUNCTION public.count_unread_notifications() TO authenticated;

-- Mark all visible notifications as read for the caller.
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS BIGINT
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  INSERT INTO public.notification_reads (notification_id, user_id)
  SELECT n.id, auth.uid()
  FROM public.notifications n
  LEFT JOIN public.notification_reads r
    ON r.notification_id = n.id AND r.user_id = auth.uid()
  WHERE r.notification_id IS NULL
    AND (n.expires_at IS NULL OR n.expires_at > now())
  ON CONFLICT (notification_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

-- =====================
-- Realtime publication
-- =====================
-- Realtime publishes INSERT/UPDATE/DELETE on tables in publication supabase_realtime.
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
