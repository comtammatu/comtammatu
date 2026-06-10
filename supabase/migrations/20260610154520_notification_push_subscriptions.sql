-- Durable Web Push subscriptions for the in-app Notification channel.
-- Production apply remains owner-gated: migration file -> PR -> merge -> owner apply.

CREATE TABLE IF NOT EXISTS public.notification_push_subscriptions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  device_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sent_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  CONSTRAINT notification_push_subscriptions_failure_count_check
    CHECK (failure_count >= 0),
  CONSTRAINT notification_push_subscriptions_endpoint_not_blank
    CHECK (length(btrim(endpoint)) > 0),
  CONSTRAINT notification_push_subscriptions_p256dh_not_blank
    CHECK (length(btrim(p256dh)) > 0),
  CONSTRAINT notification_push_subscriptions_auth_not_blank
    CHECK (length(btrim(auth)) > 0),
  CONSTRAINT notification_push_subscriptions_user_endpoint_key
    UNIQUE (tenant_id, user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_notification_push_subscriptions_active_user
  ON public.notification_push_subscriptions (tenant_id, user_id, disabled_at, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_push_subscriptions_active_tenant
  ON public.notification_push_subscriptions (tenant_id, disabled_at, last_seen_at DESC);

COMMENT ON TABLE public.notification_push_subscriptions IS
  'Per-user Web Push subscriptions for installed PWA notification delivery. In-app notification rows remain the durable work queue.';

ALTER TABLE public.notification_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_push_subscriptions_select_own
  ON public.notification_push_subscriptions;
CREATE POLICY notification_push_subscriptions_select_own
  ON public.notification_push_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS notification_push_subscriptions_insert_own
  ON public.notification_push_subscriptions;
CREATE POLICY notification_push_subscriptions_insert_own
  ON public.notification_push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS notification_push_subscriptions_update_own
  ON public.notification_push_subscriptions;
CREATE POLICY notification_push_subscriptions_update_own
  ON public.notification_push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND user_id = auth.uid()
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS notification_push_subscriptions_delete_own
  ON public.notification_push_subscriptions;
CREATE POLICY notification_push_subscriptions_delete_own
  ON public.notification_push_subscriptions
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND user_id = auth.uid()
  );

REVOKE ALL ON TABLE public.notification_push_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.notification_push_subscriptions TO service_role;

GRANT USAGE, SELECT ON SEQUENCE public.notification_push_subscriptions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.notification_push_subscriptions_id_seq TO service_role;

CREATE TABLE IF NOT EXISTS public.notification_push_deliveries (
  notification_id BIGINT NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  subscription_id BIGINT NOT NULL REFERENCES public.notification_push_subscriptions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, subscription_id),
  CONSTRAINT notification_push_deliveries_status_check
    CHECK (status = ANY (ARRAY['pending', 'sent', 'failed', 'skipped'])),
  CONSTRAINT notification_push_deliveries_attempt_count_check
    CHECK (attempt_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_notification_push_deliveries_subscription
  ON public.notification_push_deliveries (subscription_id, updated_at DESC);

COMMENT ON TABLE public.notification_push_deliveries IS
  'Per-notification/per-subscription delivery ledger for idempotent Web Push dispatch.';

ALTER TABLE public.notification_push_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.notification_push_deliveries FROM anon, authenticated;
GRANT ALL ON TABLE public.notification_push_deliveries TO service_role;
