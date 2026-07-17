CREATE OR REPLACE FUNCTION public.self_order_branch_has_open_pos_session(
  p_tenant_id bigint,
  p_branch_id bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pos_sessions ps
    WHERE ps.tenant_id = p_tenant_id
      AND ps.branch_id = p_branch_id
      AND ps.status = 'open'
  );
$$;

CREATE OR REPLACE FUNCTION public.self_order_get_snapshot(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_table record;
  v_session record;
  v_order record;
  v_payment_request record;
  v_session_payload jsonb := NULL;
  v_order_payload jsonb := NULL;
  v_payment_request_payload jsonb := NULL;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT
    t.id AS table_id,
    t.tenant_id,
    t.branch_id,
    t.number AS table_number,
    t.self_order_token,
    b.name AS branch_name
  INTO v_table
  FROM public.tables t
  JOIN public.branches b
    ON b.id = t.branch_id
   AND b.tenant_id = t.tenant_id
   AND b.is_active = true
  WHERE t.self_order_token = p_token
    AND t.self_order_enabled = true
    AND t.status <> 'maintenance'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_disabled_token');
  END IF;

  IF NOT public.self_order_branch_has_open_pos_session(v_table.tenant_id, v_table.branch_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'pos_session_closed');
  END IF;

  SELECT *
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.tenant_id = v_table.tenant_id
    AND s.table_id = v_table.table_id
    AND s.status IN ('pending_approval', 'active')
  ORDER BY s.id DESC
  LIMIT 1;

  IF FOUND THEN
    v_session_payload := jsonb_build_object(
      'status', v_session.status,
      'createdAt', v_session.created_at,
      'approvedAt', v_session.approved_at
    );

    IF v_session.status = 'active' AND v_session.order_id IS NOT NULL THEN
      SELECT
        o.order_number,
        o.status,
        o.payment_status,
        o.payment_method,
        o.total_amount,
        COALESCE(SUM(oi.quantity) FILTER (WHERE oi.status <> 'cancelled'), 0)::int AS item_count
      INTO v_order
      FROM public.orders o
      LEFT JOIN public.order_items oi
        ON oi.order_id = o.id
       AND oi.tenant_id = o.tenant_id
      WHERE o.id = v_session.order_id
        AND o.tenant_id = v_session.tenant_id
      GROUP BY o.id;

      IF FOUND THEN
        v_order_payload := jsonb_build_object(
          'orderNumber', v_order.order_number,
          'status', v_order.status,
          'paymentStatus', v_order.payment_status,
          'paymentMethod', v_order.payment_method,
          'totalAmount', v_order.total_amount,
          'itemCount', v_order.item_count
        );
      END IF;

      SELECT status, method, amount_snapshot, created_at
      INTO v_payment_request
      FROM public.self_order_payment_requests pr
      WHERE pr.tenant_id = v_session.tenant_id
        AND pr.session_id = v_session.id
        AND pr.status IN ('cash_call', 'vietqr_pending')
      ORDER BY pr.id DESC
      LIMIT 1;

      IF FOUND THEN
        v_payment_request_payload := jsonb_build_object(
          'status', v_payment_request.status,
          'method', v_payment_request.method,
          'amount', v_payment_request.amount_snapshot,
          'createdAt', v_payment_request.created_at
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'branch', jsonb_build_object(
      'name', v_table.branch_name
    ),
    'table', jsonb_build_object(
      'number', v_table.table_number
    ),
    'session', v_session_payload,
    'order', v_order_payload,
    'paymentRequest', v_payment_request_payload,
    'menu', public.self_order_menu_payload(v_table.tenant_id),
    'realtimeTopic', 'self-order:' || v_table.self_order_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_approve_batch(
  p_batch_id bigint,
  p_target_order_id bigint DEFAULT NULL,
  p_pos_session_id bigint DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_batch record;
  v_session record;
  v_order record;
  v_result jsonb;
  v_order_id bigint;
  v_pos_session_id bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT b.*
  INTO v_batch
  FROM public.self_order_batches b
  WHERE b.id = p_batch_id
    AND b.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_batch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_batch.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'permission denied: pos:use' USING ERRCODE = '42501';
  END IF;

  SELECT ps.id
  INTO v_pos_session_id
  FROM public.pos_sessions ps
  WHERE ps.tenant_id = v_batch.tenant_id
    AND ps.branch_id = v_batch.branch_id
    AND ps.status = 'open'
    AND (p_pos_session_id IS NULL OR ps.id = p_pos_session_id)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_pos_session_closed' USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.id = v_batch.session_id
    AND s.tenant_id = v_batch.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_session_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_batch.status IN ('accepted', 'auto_accepted') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', v_batch.status,
      'orderId', v_batch.order_id,
      'idempotent', true
    );
  END IF;

  IF v_batch.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'self_order_batch_not_pending' USING ERRCODE = '22023';
  END IF;

  IF p_target_order_id IS NULL THEN
    v_result := public.create_order(
      v_batch.tenant_id,
      v_batch.branch_id,
      v_uid,
      v_batch.cart_payload,
      'dine_in',
      v_batch.table_id,
      v_pos_session_id,
      v_batch.customer_note,
      COALESCE(p_idempotency_key, v_batch.client_op_id)
    );
    v_order_id := NULLIF(v_result ->> 'order_id', '')::bigint;
  ELSE
    SELECT *
    INTO v_order
    FROM public.orders o
    WHERE o.id = p_target_order_id
      AND o.tenant_id = v_batch.tenant_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_order.branch_id <> v_batch.branch_id
       OR v_order.table_id IS DISTINCT FROM v_batch.table_id
       OR v_order.status NOT IN ('new', 'confirmed', 'preparing', 'ready', 'served')
       OR COALESCE(v_order.payment_status, 'unpaid') = 'paid'
       OR v_order.merged_into_order_id IS NOT NULL
       OR (v_order.pos_session_id IS NOT NULL AND v_order.pos_session_id <> v_pos_session_id) THEN
      RAISE EXCEPTION 'self_order_target_order_not_appendable' USING ERRCODE = '22023';
    END IF;

    IF public.self_order_active_payment_lock(v_order.id) IS NOT NULL THEN
      RAISE EXCEPTION 'self_order_pending_payment_exists' USING ERRCODE = '55P03';
    END IF;

    v_result := public.append_order_items(
      p_target_order_id,
      v_batch.cart_payload,
      COALESCE(p_idempotency_key, v_batch.client_op_id)
    );
    v_order_id := p_target_order_id;
  END IF;

  UPDATE public.self_order_sessions
     SET status = 'active',
         order_id = v_order_id,
         approved_by = v_uid,
         approved_at = COALESCE(approved_at, now()),
         close_reason = NULL,
         closed_at = NULL
   WHERE id = v_session.id;

  UPDATE public.self_order_batches
     SET status = 'accepted',
         order_id = v_order_id,
         accepted_by = v_uid,
         accepted_at = now(),
         failure_reason = NULL
   WHERE id = v_batch.id;

  RETURN COALESCE(v_result, '{}'::jsonb) || jsonb_build_object(
    'ok', true,
    'status', 'accepted',
    'orderId', v_order_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_enforce_open_pos_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant_id bigint;
  v_branch_id bigint;
  v_should_check boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_tenant_id := NEW.tenant_id;
    v_branch_id := NEW.branch_id;
    v_should_check := true;
  ELSIF TG_OP = 'UPDATE'
        AND TG_TABLE_NAME = 'self_order_batches'
        AND OLD.status IS DISTINCT FROM NEW.status
        AND NEW.status IN ('accepted', 'auto_accepted') THEN
    v_tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id);
    v_branch_id := COALESCE(NEW.branch_id, OLD.branch_id);
    v_should_check := true;
  END IF;

  IF v_should_check
     AND NOT public.self_order_branch_has_open_pos_session(v_tenant_id, v_branch_id) THEN
    RAISE EXCEPTION 'self_order_pos_session_closed' USING ERRCODE = 'P0002';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_self_order_batches_require_open_pos_session
  ON public.self_order_batches;
CREATE TRIGGER trg_self_order_batches_require_open_pos_session
  BEFORE INSERT OR UPDATE OF status ON public.self_order_batches
  FOR EACH ROW EXECUTE FUNCTION public.self_order_enforce_open_pos_session();

DROP TRIGGER IF EXISTS trg_self_order_payment_requests_require_open_pos_session
  ON public.self_order_payment_requests;
CREATE TRIGGER trg_self_order_payment_requests_require_open_pos_session
  BEFORE INSERT ON public.self_order_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.self_order_enforce_open_pos_session();

REVOKE ALL ON FUNCTION public.self_order_branch_has_open_pos_session(bigint, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_enforce_open_pos_session() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_get_snapshot(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_approve_batch(bigint, bigint, bigint, uuid) FROM PUBLIC, anon;

GRANT ALL ON FUNCTION public.self_order_branch_has_open_pos_session(bigint, bigint) TO service_role;
GRANT ALL ON FUNCTION public.self_order_get_snapshot(text) TO service_role;
GRANT ALL ON FUNCTION public.self_order_approve_batch(bigint, bigint, bigint, uuid) TO authenticated;
