-- =============================================================
-- Payment ↔ Order reconciliation RPC
--
-- Detects completed payments whose parent order has NOT transitioned to
-- payment_status = 'paid'. Signals gateway webhook failure, race condition,
-- or manual DB tampering. Used by /admin/finance/reconciliation.
--
-- Authz: caller must hold `finance:view` (tenant-wide or any branch).
-- Scoping: rows filtered to caller's tenant.
-- =============================================================

CREATE OR REPLACE FUNCTION public.find_payment_order_desync(
  p_since TIMESTAMPTZ DEFAULT (now() - interval '30 days')
)
RETURNS TABLE (
  payment_id          BIGINT,
  order_id            BIGINT,
  tenant_id           BIGINT,
  branch_id           BIGINT,
  amount              NUMERIC(15,2),
  payment_method      TEXT,  -- mapped from payments.method
  payment_status      TEXT,
  payment_paid_at     TIMESTAMPTZ,
  order_status        TEXT,
  order_payment_status TEXT,
  order_created_at    TIMESTAMPTZ,
  age_minutes         INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p.id                                     AS payment_id,
    p.order_id                               AS order_id,
    p.tenant_id                              AS tenant_id,
    p.branch_id                              AS branch_id,
    p.amount                                 AS amount,
    p.method                                 AS payment_method,
    p.status                                 AS payment_status,
    p.paid_at                                AS payment_paid_at,
    o.status                                 AS order_status,
    o.payment_status                         AS order_payment_status,
    o.created_at                             AS order_created_at,
    GREATEST(
      EXTRACT(EPOCH FROM (now() - p.paid_at))::INTEGER / 60,
      0
    )                                        AS age_minutes
  FROM public.payments p
  JOIN public.orders   o ON o.id = p.order_id AND o.tenant_id = p.tenant_id
  WHERE p.tenant_id = public.auth_tenant_id()
    AND p.status = 'completed'
    AND COALESCE(o.payment_status, 'unpaid') <> 'paid'
    AND p.paid_at >= p_since
    AND public.has_permission_any('finance:view')
  ORDER BY p.paid_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.find_payment_order_desync(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_payment_order_desync(TIMESTAMPTZ) TO authenticated;

COMMENT ON FUNCTION public.find_payment_order_desync(TIMESTAMPTZ) IS
  'Ops reconciliation: rows are payments marked completed whose order did not flip to paid. Returns empty for callers without finance:view. Lookback window defaults to 30 days.';
