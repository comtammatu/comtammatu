-- ADR 0023: shift leader flag + pos void-after-paid approval queue.

-- ---------------------------------------------------------------------------
-- 1) Shift leader on assignments
-- ---------------------------------------------------------------------------
ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS is_shift_leader boolean NOT NULL DEFAULT false;

ALTER TABLE public.shift_assignments
  DROP CONSTRAINT IF EXISTS shift_assignments_leader_requires_shift;

ALTER TABLE public.shift_assignments
  ADD CONSTRAINT shift_assignments_leader_requires_shift
  CHECK (NOT is_shift_leader OR shift_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS shift_assignments_one_leader_per_shift_day
  ON public.shift_assignments (branch_id, shift_id, work_date)
  WHERE is_shift_leader;

COMMENT ON COLUMN public.shift_assignments.is_shift_leader IS
  'ADR 0023: rotating shift lead for the assignment day. At most one per (branch_id, shift_id, work_date).';

-- ---------------------------------------------------------------------------
-- 2) Void request queue
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pos_void_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  branch_id bigint NOT NULL REFERENCES public.branches(id),
  order_id bigint NOT NULL REFERENCES public.orders(id),
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  reason text NOT NULL,
  payout_method text NOT NULL CHECK (payout_method IN ('cash', 'bank_transfer')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_void_requests_reason_len CHECK (
    char_length(trim(reason)) >= 20 AND char_length(reason) <= 500
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS pos_void_requests_one_pending_per_order
  ON public.pos_void_requests (order_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS pos_void_requests_branch_pending_idx
  ON public.pos_void_requests (branch_id, status, created_at DESC);

ALTER TABLE public.pos_void_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_void_requests_select ON public.pos_void_requests;
CREATE POLICY pos_void_requests_select ON public.pos_void_requests
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_is_owner(auth.uid())
      OR public.has_permission(branch_id, 'pos:use')
      OR public.has_permission(branch_id, 'settings:branch')
    )
  );

REVOKE ALL ON TABLE public.pos_void_requests FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.pos_void_requests TO authenticated;
GRANT ALL ON TABLE public.pos_void_requests TO service_role;

COMMENT ON TABLE public.pos_void_requests IS
  'ADR 0023: cashier requests full void-after-paid; shift leader / BM / Owner resolves.';

-- ---------------------------------------------------------------------------
-- 3) Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_shift_leader_for_branch(
  p_branch_id bigint,
  p_user_id uuid,
  p_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_employee_id bigint;
  v_work_date date;
BEGIN
  IF p_branch_id IS NULL OR p_user_id IS NULL OR v_tenant IS NULL THEN
    RETURN false;
  END IF;

  SELECT e.id INTO v_employee_id
  FROM public.employees e
  WHERE e.profile_id = p_user_id
    AND e.tenant_id = v_tenant
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RETURN false;
  END IF;

  v_work_date := public.branch_business_date(p_branch_id, p_at);

  RETURN EXISTS (
    SELECT 1
    FROM public.shift_assignments sa
    WHERE sa.tenant_id = v_tenant
      AND sa.branch_id = p_branch_id
      AND sa.employee_id = v_employee_id
      AND sa.work_date = v_work_date
      AND sa.is_shift_leader
      AND sa.shift_id IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION private.is_shift_leader_for_branch(bigint, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_shift_leader_for_branch(bigint, uuid, timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION private.has_recent_approved_void_request(
  p_order_id bigint,
  p_actor uuid,
  p_tenant_id bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pos_void_requests r
    WHERE r.order_id = p_order_id
      AND r.tenant_id = p_tenant_id
      AND r.status = 'approved'
      AND r.resolved_by = p_actor
      AND r.resolved_at >= clock_timestamp() - interval '30 seconds'
  );
$$;

REVOKE ALL ON FUNCTION private.has_recent_approved_void_request(bigint, uuid, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_recent_approved_void_request(bigint, uuid, bigint)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Request RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_pos_void_after_paid(
  p_order_id bigint,
  p_reason text,
  p_payout_method text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_order record;
  v_request_id bigint;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 20 OR length(p_reason) > 500 THEN
    RAISE EXCEPTION 'reason_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_payout_method IS NULL OR p_payout_method NOT IN ('cash', 'bank_transfer') THEN
    RAISE EXCEPTION 'refund_payout_method_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT id, tenant_id, branch_id, status, payment_status
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.tenant_id <> v_tenant THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_order.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_order.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'order_not_paid' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'order_already_cancelled' USING ERRCODE = 'P0001';
  END IF;

  IF public.auth_is_owner(v_actor) THEN
    RAISE EXCEPTION 'owner_use_direct_void' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.pos_void_requests (
    tenant_id, branch_id, order_id, requested_by, reason, payout_method, status
  )
  VALUES (
    v_tenant, v_order.branch_id, p_order_id, v_actor, trim(p_reason), p_payout_method, 'pending'
  )
  RETURNING id INTO v_request_id;

  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles, kind, severity, title, body,
    entity_type, entity_id, action_url, meta, dedup_key
  )
  VALUES (
    v_tenant,
    v_order.branch_id,
    ARRAY['branch_manager', 'cashier', 'chef', 'branch_staff']::text[],
    'pos.void_requested',
    'warning',
    'Yêu cầu hủy đơn đã thanh toán',
    'Thu ngân yêu cầu hủy đơn #' || p_order_id::text || '. Trưởng ca hoặc quản lý cần duyệt.',
    'pos_void_request',
    v_request_id,
    format('/br/%s/pos?voidRequest=%s', v_order.branch_id, v_request_id),
    jsonb_build_object(
      'request_id', v_request_id,
      'order_id', p_order_id,
      'branch_id', v_order.branch_id
    ),
    format('pos.void_requested:%s', v_request_id)
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET
    body = EXCLUDED.body,
    action_url = EXCLUDED.action_url,
    meta = EXCLUDED.meta,
    created_at = now(),
    expires_at = NULL;

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'status', 'pending',
    'order_id', p_order_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_pos_void_after_paid(bigint, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_pos_void_after_paid(bigint, text, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) Resolve RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_pos_void_request(
  p_request_id bigint,
  p_decision text,
  p_resolution_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_req record;
  v_can_resolve boolean := false;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_request_id IS NULL OR p_decision IS NULL
     OR p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_req
  FROM public.pos_void_requests
  WHERE id = p_request_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'void_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'void_request_not_pending' USING ERRCODE = 'P0001';
  END IF;

  v_can_resolve :=
    public.auth_is_owner(v_actor)
    OR public.has_permission(v_req.branch_id, 'settings:branch')
    OR private.is_shift_leader_for_branch(v_req.branch_id, v_actor, now());

  IF NOT v_can_resolve THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_decision = 'rejected' THEN
    UPDATE public.pos_void_requests
    SET
      status = 'rejected',
      resolved_by = v_actor,
      resolved_at = now(),
      resolution_note = NULLIF(trim(COALESCE(p_resolution_note, '')), ''),
      updated_at = now()
    WHERE id = v_req.id;

    RETURN jsonb_build_object(
      'request_id', v_req.id,
      'status', 'rejected',
      'order_id', v_req.order_id
    );
  END IF;

  UPDATE public.pos_void_requests
  SET
    status = 'approved',
    resolved_by = v_actor,
    resolved_at = clock_timestamp(),
    resolution_note = NULLIF(trim(COALESCE(p_resolution_note, '')), ''),
    updated_at = now()
  WHERE id = v_req.id;

  v_result := public.refund_paid_order_with_payout(
    v_req.order_id,
    v_req.reason,
    v_req.payout_method
  );

  RETURN jsonb_build_object(
    'request_id', v_req.id,
    'status', 'approved',
    'order_id', v_req.order_id,
    'refund', v_result
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_pos_void_request(bigint, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_pos_void_request(bigint, text, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) Patch refund gates for just-approved void-request resolvers
--     Body of refund_paid_order matches baseline; only the permission IF changes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_paid_order(p_order_id bigint, p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor          uuid   := auth.uid();
  v_tenant         bigint := public.auth_tenant_id();
  v_order          record;
  v_payment        record;
  v_invoice        record;
  v_refund_id      bigint;
  v_in_summary     boolean := false;
  v_invoice_action text   := 'none';
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 20 THEN
    RAISE EXCEPTION 'reason_too_short' USING ERRCODE = '22023';
  END IF;
  IF length(p_reason) > 500 THEN
    RAISE EXCEPTION 'reason_too_long' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT id, tenant_id, branch_id, status, payment_status
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.tenant_id <> v_tenant THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_order.branch_id, 'pos:void_paid_order')
     AND NOT private.has_recent_approved_void_request(p_order_id, v_actor, v_tenant)
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'order_already_cancelled' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'order_not_paid' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, branch_id, amount, status, method
  INTO v_payment
  FROM public.payments
  WHERE order_id = p_order_id
    AND tenant_id = v_tenant
    AND status = 'completed'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_completed_payment' USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1
  FROM public.payments
  WHERE order_id = p_order_id
    AND tenant_id = v_tenant
    AND status = 'completed'
    AND id <> v_payment.id;
  IF FOUND THEN
    RAISE EXCEPTION 'multiple_payments' USING ERRCODE = 'P0001';
  END IF;

  IF v_payment.amount > 0 THEN
    PERFORM 1
    FROM public.refunds
    WHERE payment_id = v_payment.id
      AND status IN ('pending', 'approved');
    IF FOUND THEN
      RAISE EXCEPTION 'already_refunded' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.tax_invoice_orders tio
    JOIN public.tax_invoices ti ON ti.id = tio.tax_invoice_id
    WHERE tio.order_id = p_order_id
      AND ti.invoice_kind = 'daily_summary'
      AND ti.status NOT IN ('cancelled', 'replaced')
  )
  INTO v_in_summary;
  IF v_in_summary THEN
    RAISE EXCEPTION 'order_in_daily_summary' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, status, provider_ref, provider, issued_at
  INTO v_invoice
  FROM public.tax_invoices
  WHERE order_id = p_order_id
    AND tenant_id = v_tenant
    AND invoice_kind = 'per_order'
    AND status IN ('draft', 'signing', 'submitted', 'issued')
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;
  IF FOUND THEN
    IF v_invoice.status IN ('signing', 'submitted', 'issued')
       AND v_invoice.provider_ref IS NOT NULL
       AND v_invoice.issued_at IS NOT NULL
       AND (v_invoice.issued_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
             < date_trunc('month', (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date THEN
      RAISE EXCEPTION 'cross_period_invoice' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.tax_invoices
    SET status = 'cancelled',
        cancelled_at = now(),
        provider_data = COALESCE(provider_data, '{}'::jsonb)
          || jsonb_build_object(
               'cancelled',
               jsonb_build_object('cancel_reason', p_reason, 'source', 'pos_void_paid_order')
             ),
        updated_at = now()
    WHERE id = v_invoice.id;

    INSERT INTO public.tax_invoice_events
      (tax_invoice_id, tenant_id, from_status, to_status, actor_id, payload, note)
    VALUES (
      v_invoice.id, v_tenant, v_invoice.status, 'cancelled', v_actor,
      jsonb_build_object('cancel_reason', p_reason, 'source', 'pos_void_paid_order'),
      p_reason
    );

    v_invoice_action := CASE
      WHEN v_invoice.status = 'issued' THEN 'cancel_issued'
      ELSE 'cancel_predispatch'
    END;
  END IF;

  IF v_payment.amount > 0 THEN
    INSERT INTO public.refunds
      (tenant_id, branch_id, payment_id, order_id, amount, reason,
       status, created_by, approved_by, approved_at, tax_invoice_id)
    VALUES (
      v_tenant, v_payment.branch_id, v_payment.id, p_order_id, v_payment.amount, p_reason,
      'approved', v_actor, v_actor, now(), v_invoice.id
    )
    RETURNING id INTO v_refund_id;
  END IF;

  UPDATE public.payments
  SET status = 'refunded', updated_at = now()
  WHERE id = v_payment.id;

  UPDATE public.orders
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_order_id;

  PERFORM set_config('comtammatu.skip_quota_enforcement', 'true', true);
  UPDATE public.order_items
  SET status = 'cancelled', updated_at = now()
  WHERE order_id = p_order_id
    AND status <> 'cancelled';
  PERFORM set_config('comtammatu.skip_quota_enforcement', 'false', true);

  UPDATE public.kds_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE order_id = p_order_id
    AND status NOT IN ('cancelled', 'served');

  PERFORM public.post_pos_sale_refund_restore(p_order_id, v_actor);

  PERFORM public.log_audit(
    'refund.pos_void_after_paid',
    'order',
    p_order_id,
    NULL,
    jsonb_build_object(
      'refund_id', v_refund_id,
      'order_id', p_order_id,
      'payment_id', v_payment.id,
      'amount', v_payment.amount,
      'method', v_payment.method,
      'invoice_id', v_invoice.id,
      'invoice_action', v_invoice_action,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'status', 'refunded',
    'refund_id', v_refund_id,
    'amount', v_payment.amount,
    'method', v_payment.method,
    'invoice_id', v_invoice.id,
    'invoice_action', v_invoice_action,
    'invoice_provider_ref', v_invoice.provider_ref,
    'invoice_provider', v_invoice.provider
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_paid_order_with_payout(
  p_order_id bigint,
  p_reason text,
  p_payout_method text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_result jsonb;
  v_refund_id bigint;
BEGIN
  IF v_actor IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.auth_is_owner(v_actor)
     AND NOT private.has_recent_approved_void_request(p_order_id, v_actor, v_tenant_id)
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  IF p_payout_method IS NULL
    OR p_payout_method NOT IN ('cash', 'bank_transfer')
  THEN
    RAISE EXCEPTION 'refund_payout_method_invalid' USING ERRCODE = '22023';
  END IF;

  v_result := public.refund_paid_order(p_order_id, p_reason);
  v_refund_id := NULLIF(v_result->>'refund_id', '')::bigint;

  IF v_refund_id IS NOT NULL THEN
    UPDATE public.refunds
    SET payout_method = p_payout_method,
        updated_at = now()
    WHERE id = v_refund_id
      AND tenant_id = v_tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'refund_not_found' USING ERRCODE = 'P0002';
    END IF;

    PERFORM public.log_audit(
      'refund.payout_method_set',
      'refund',
      v_refund_id,
      NULL,
      jsonb_build_object('payout_method', p_payout_method)
    );
  END IF;

  RETURN v_result || jsonb_build_object('payout_method', p_payout_method);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) Set / clear shift leader on an assignment (roster / BM)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_shift_assignment_leader(
  p_assignment_id bigint,
  p_is_leader boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_row record;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_assignment_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_row
  FROM public.shift_assignments
  WHERE id = p_assignment_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignment_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.branch_id IS NULL THEN
    RAISE EXCEPTION 'assignment_missing_branch' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.auth_is_owner(v_actor)
     AND NOT public.has_permission(v_row.branch_id, 'hr:assign_shift')
     AND NOT public.has_permission(v_row.branch_id, 'settings:branch')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_is_leader THEN
    IF v_row.shift_id IS NULL THEN
      RAISE EXCEPTION 'leader_requires_shift' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.shift_assignments
    SET is_shift_leader = false,
        updated_at = now()
    WHERE tenant_id = v_tenant
      AND branch_id = v_row.branch_id
      AND shift_id = v_row.shift_id
      AND work_date = v_row.work_date
      AND is_shift_leader
      AND id <> v_row.id;

    UPDATE public.shift_assignments
    SET is_shift_leader = true,
        updated_at = now()
    WHERE id = v_row.id;
  ELSE
    UPDATE public.shift_assignments
    SET is_shift_leader = false,
        updated_at = now()
    WHERE id = v_row.id;
  END IF;

  RETURN jsonb_build_object(
    'assignment_id', v_row.id,
    'is_shift_leader', p_is_leader
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_shift_assignment_leader(bigint, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_shift_assignment_leader(bigint, boolean)
  TO authenticated, service_role;
