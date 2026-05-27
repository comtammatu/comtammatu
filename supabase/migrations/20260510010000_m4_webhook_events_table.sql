-- =============================================================
-- M4 P1-A — webhook_events idempotency table
--
-- Every payment-provider webhook (Momo today, VietQR/VNPay future) writes
-- one row here BEFORE invoking the payment-completion RPC. The
-- (provider, request_id) UNIQUE constraint converts replay attacks and
-- double-deliveries into single-row inserts that no-op via ON CONFLICT.
--
-- Without this table:
--   - Momo retries (3 default) overwrite payments.provider_data three times
--   - A leaked HMAC + replay can re-flip a refunded payment to completed
--   - We have no audit trail of webhook receipt for reconciliation
--
-- The webhook handler (`apps/web/app/api/webhooks/momo/route.ts`) wires
-- this in a follow-up TS edit after migrations apply and `pnpm db:types`
-- regenerates. The schema is staged here so the route refactor compiles.
--
-- Refs: tasks/regressions.md WEBHOOK-MUST-IDEMPOTENT.
-- =============================================================

CREATE TABLE public.webhook_events (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider        TEXT   NOT NULL CHECK (provider IN ('momo', 'vietqr', 'vnpay')),
  request_id      TEXT   NOT NULL,
  payment_id      BIGINT REFERENCES public.payments(id),
  signature_valid BOOLEAN NOT NULL DEFAULT false,
  payload         JSONB  NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'received'
                    CHECK (processing_status IN ('received', 'processed', 'failed', 'ignored')),
  http_status     INT,
  error_code      TEXT,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (provider, request_id)
);

CREATE INDEX idx_webhook_events_tenant ON public.webhook_events (tenant_id);
CREATE INDEX idx_webhook_events_payment ON public.webhook_events (payment_id);
CREATE INDEX idx_webhook_events_created ON public.webhook_events (created_at DESC);

COMMENT ON TABLE public.webhook_events IS
  'M4 P1-A (2026-04-29): payment provider webhook idempotency log. UNIQUE(provider, request_id) blocks duplicate processing. Webhook routes MUST insert this row before calling complete_payment_and_consume_stock or any payment-state RPC. RLS allows owner+super_manager SELECT (debugging/reconciliation); INSERT only via service_role webhook handlers (RLS bypassed).';


-- ─── RLS — owner / super_manager read; INSERT via service_role only ──────

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_events_select_admin" ON public.webhook_events
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:view')
  );

-- No INSERT/UPDATE/DELETE policies for `authenticated` — service_role
-- bypasses RLS, and authenticated users have no business writing the
-- webhook log directly. Future admin tooling that lets ops manually retry
-- a webhook would call a dedicated SECURITY DEFINER RPC, not direct INSERT.

GRANT SELECT ON TABLE public.webhook_events TO authenticated;
