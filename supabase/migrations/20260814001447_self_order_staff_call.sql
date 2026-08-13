-- Guest "Gọi nhân viên" from table QR. POS sees a table badge + existing
-- payment-call beep. Writes stay on SECURITY DEFINER RPCs.

CREATE TABLE public.self_order_staff_calls (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id bigint NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  table_id bigint NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
  client_op_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT self_order_staff_calls_status_check
    CHECK (status IN ('pending', 'acknowledged', 'expired')),
  CONSTRAINT self_order_staff_calls_pending_check
    CHECK (
      (status = 'pending' AND acknowledged_at IS NULL AND acknowledged_by IS NULL)
      OR (status = 'acknowledged' AND acknowledged_at IS NOT NULL)
      OR (status = 'expired' AND acknowledged_at IS NULL)
    )
);

CREATE UNIQUE INDEX self_order_staff_calls_one_pending_per_table
  ON public.self_order_staff_calls (table_id)
  WHERE status = 'pending';

CREATE UNIQUE INDEX self_order_staff_calls_client_op_id_uidx
  ON public.self_order_staff_calls (tenant_id, client_op_id);

CREATE INDEX idx_self_order_staff_calls_branch_pending
  ON public.self_order_staff_calls (tenant_id, branch_id, created_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.self_order_staff_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY self_order_staff_calls_staff_select
  ON public.self_order_staff_calls
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT public.auth_tenant_id())
    AND public.has_permission(branch_id, 'pos:use')
  );

REVOKE ALL PRIVILEGES ON TABLE public.self_order_staff_calls
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.self_order_staff_calls TO authenticated, service_role;
REVOKE ALL PRIVILEGES ON SEQUENCE public.self_order_staff_calls_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.self_order_staff_calls IS
  'Guest staff-call from Self-Order QR. Staff SELECT via RLS; writes via RPCs.';

DROP TRIGGER IF EXISTS trg_broadcast_branch_ops ON public.self_order_staff_calls;
CREATE TRIGGER trg_broadcast_branch_ops
  AFTER INSERT OR DELETE OR UPDATE ON public.self_order_staff_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_branch_ops();

CREATE OR REPLACE FUNCTION public.self_order_call_staff(
  p_token text,
  p_client_op_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_table public.tables%ROWTYPE;
  v_existing public.self_order_staff_calls%ROWTYPE;
  v_pending public.self_order_staff_calls%ROWTYPE;
  v_recent public.self_order_staff_calls%ROWTYPE;
  v_call_id bigint;
  v_cooldown interval := interval '45 seconds';
  v_ttl interval := interval '15 minutes';
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  IF p_client_op_id IS NULL THEN
    RAISE EXCEPTION 'self_order_missing_operation_id' USING ERRCODE = '22023';
  END IF;

  SELECT t.*
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

  PERFORM pg_advisory_xact_lock(
    hashtext('self-order-staff-call'),
    hashtext(v_table.id::text)
  );

  SELECT t.*
  INTO v_table
  FROM public.tables t
  WHERE t.id = v_table.id
    AND t.self_order_token = p_token
    AND t.self_order_enabled = true
    AND t.status <> 'maintenance';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_disabled_token');
  END IF;
  IF NOT public.self_order_branch_has_open_pos_session(
    v_table.tenant_id,
    v_table.branch_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'pos_session_closed');
  END IF;

  UPDATE public.self_order_staff_calls c
  SET status = 'expired'
  WHERE c.table_id = v_table.id
    AND c.status = 'pending'
    AND c.expires_at <= now();

  SELECT c.*
  INTO v_existing
  FROM public.self_order_staff_calls c
  WHERE c.tenant_id = v_table.tenant_id
    AND c.client_op_id = p_client_op_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'callId', v_existing.id,
      'status', v_existing.status
    );
  END IF;

  SELECT c.*
  INTO v_pending
  FROM public.self_order_staff_calls c
  WHERE c.table_id = v_table.id
    AND c.status = 'pending'
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'callId', v_pending.id,
      'status', v_pending.status
    );
  END IF;

  SELECT c.*
  INTO v_recent
  FROM public.self_order_staff_calls c
  WHERE c.table_id = v_table.id
    AND c.created_at > now() - v_cooldown
  ORDER BY c.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'self_order_rate_limited'
      USING ERRCODE = 'P0001',
            DETAIL = jsonb_build_object(
              'retryAfterSeconds',
              GREATEST(
                1,
                CEIL(EXTRACT(EPOCH FROM (v_recent.created_at + v_cooldown - now())))
              )
            )::text;
  END IF;

  INSERT INTO public.self_order_staff_calls (
    tenant_id,
    branch_id,
    table_id,
    client_op_id,
    status,
    expires_at
  )
  VALUES (
    v_table.tenant_id,
    v_table.branch_id,
    v_table.id,
    p_client_op_id,
    'pending',
    now() + v_ttl
  )
  RETURNING id INTO v_call_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'callId', v_call_id,
    'status', 'pending'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_ack_staff_call(
  p_call_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_call public.self_order_staff_calls%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_call_id IS NULL OR p_call_id < 1 THEN
    RAISE EXCEPTION 'self_order_staff_call_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT c.*
  INTO v_call
  FROM public.self_order_staff_calls c
  WHERE c.id = p_call_id
    AND c.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_staff_call_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_call.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'permission denied: pos:use' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('self-order-staff-call'),
    hashtext(v_call.table_id::text)
  );

  SELECT c.*
  INTO v_call
  FROM public.self_order_staff_calls c
  WHERE c.id = p_call_id
    AND c.tenant_id = v_tenant
  FOR UPDATE;

  IF v_call.status = 'acknowledged' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'status', 'acknowledged'
    );
  END IF;

  UPDATE public.self_order_staff_calls
  SET
    status = 'acknowledged',
    acknowledged_at = now(),
    acknowledged_by = v_uid
  WHERE id = v_call.id
    AND tenant_id = v_call.tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'status', 'acknowledged'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.self_order_call_staff(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_order_call_staff(text, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.self_order_ack_staff_call(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.self_order_ack_staff_call(bigint)
  TO authenticated, service_role;
