ALTER TABLE public.tables
  ADD COLUMN IF NOT EXISTS self_order_token text,
  ADD COLUMN IF NOT EXISTS self_order_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS self_order_token_rotated_at timestamp with time zone;

ALTER TABLE public.tables
  ADD CONSTRAINT tables_self_order_token_format_check
  CHECK (
    self_order_token IS NULL
    OR (
      char_length(self_order_token) BETWEEN 24 AND 128
      AND self_order_token ~ '^[A-Za-z0-9_-]+$'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS tables_tenant_self_order_token_key
  ON public.tables (tenant_id, self_order_token)
  WHERE self_order_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tables_self_order_lookup
  ON public.tables (self_order_token)
  WHERE self_order_enabled = true AND self_order_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.self_order_sessions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id bigint NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  table_id bigint NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
  order_id bigint REFERENCES public.orders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending_approval',
  token_snapshot text NOT NULL,
  token_rotated_at_snapshot timestamp with time zone,
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamp with time zone,
  closed_at timestamp with time zone,
  close_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT self_order_sessions_status_check
    CHECK (status = ANY (ARRAY['pending_approval', 'active', 'closed', 'revoked'])),
  CONSTRAINT self_order_sessions_active_order_required
    CHECK ((status <> 'active') OR (order_id IS NOT NULL AND approved_by IS NOT NULL)),
  CONSTRAINT self_order_sessions_close_reason_length
    CHECK (close_reason IS NULL OR char_length(close_reason) <= 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS self_order_sessions_one_open_per_table
  ON public.self_order_sessions (tenant_id, table_id)
  WHERE status = ANY (ARRAY['pending_approval', 'active']);

CREATE INDEX IF NOT EXISTS idx_self_order_sessions_order
  ON public.self_order_sessions (tenant_id, order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_self_order_sessions_branch_status
  ON public.self_order_sessions (tenant_id, branch_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.self_order_batches (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id bigint NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  table_id bigint NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
  session_id bigint NOT NULL REFERENCES public.self_order_sessions(id) ON DELETE CASCADE,
  order_id bigint REFERENCES public.orders(id) ON DELETE SET NULL,
  client_op_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending_approval',
  cart_payload jsonb NOT NULL,
  customer_note text,
  failure_reason text,
  accepted_by uuid REFERENCES public.profiles(id),
  accepted_at timestamp with time zone,
  rejected_by uuid REFERENCES public.profiles(id),
  rejected_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT self_order_batches_status_check
    CHECK (status = ANY (ARRAY['pending_approval', 'accepted', 'rejected', 'auto_accepted', 'failed'])),
  CONSTRAINT self_order_batches_cart_array_check
    CHECK (jsonb_typeof(cart_payload) = 'array' AND jsonb_array_length(cart_payload) > 0),
  CONSTRAINT self_order_batches_customer_note_length
    CHECK (customer_note IS NULL OR char_length(customer_note) <= 500),
  CONSTRAINT self_order_batches_failure_reason_length
    CHECK (failure_reason IS NULL OR char_length(failure_reason) <= 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS self_order_batches_session_client_op_key
  ON public.self_order_batches (tenant_id, session_id, client_op_id);

CREATE INDEX IF NOT EXISTS idx_self_order_batches_branch_status
  ON public.self_order_batches (tenant_id, branch_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.self_order_payment_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id bigint NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  table_id bigint NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
  session_id bigint NOT NULL REFERENCES public.self_order_sessions(id) ON DELETE CASCADE,
  order_id bigint NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_id bigint REFERENCES public.payments(id) ON DELETE SET NULL,
  client_op_id uuid NOT NULL,
  method text NOT NULL,
  status text NOT NULL,
  amount_snapshot numeric(15,2) NOT NULL,
  invoice_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  cancelled_at timestamp with time zone,
  completed_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT self_order_payment_requests_method_check
    CHECK (method = ANY (ARRAY['cash_call', 'vietqr'])),
  CONSTRAINT self_order_payment_requests_status_check
    CHECK (status = ANY (ARRAY['cash_call', 'vietqr_pending', 'cancelled', 'completed', 'expired'])),
  CONSTRAINT self_order_payment_requests_amount_check CHECK (amount_snapshot >= 0),
  CONSTRAINT self_order_payment_requests_status_method_check
    CHECK (
      (method = 'cash_call' AND status IN ('cash_call', 'cancelled', 'completed', 'expired'))
      OR
      (method = 'vietqr' AND status IN ('vietqr_pending', 'cancelled', 'completed', 'expired'))
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS self_order_payment_requests_session_client_op_key
  ON public.self_order_payment_requests (tenant_id, session_id, client_op_id);

CREATE UNIQUE INDEX IF NOT EXISTS self_order_payment_requests_one_pending_vietqr
  ON public.self_order_payment_requests (tenant_id, order_id)
  WHERE status = 'vietqr_pending';

CREATE INDEX IF NOT EXISTS idx_self_order_payment_requests_branch_status
  ON public.self_order_payment_requests (tenant_id, branch_id, status, created_at DESC);

ALTER TABLE public.self_order_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.self_order_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.self_order_payment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY self_order_sessions_staff_select
  ON public.self_order_sessions
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'pos:use')
  );

CREATE POLICY self_order_batches_staff_select
  ON public.self_order_batches
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'pos:use')
  );

CREATE POLICY self_order_payment_requests_staff_select
  ON public.self_order_payment_requests
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'pos:use')
  );

CREATE TRIGGER trg_self_order_sessions_updated_at
  BEFORE UPDATE ON public.self_order_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_self_order_batches_updated_at
  BEFORE UPDATE ON public.self_order_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_self_order_payment_requests_updated_at
  BEFORE UPDATE ON public.self_order_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.self_order_normalize_invoice_payload(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_buyer_name text := btrim(COALESCE(v_payload ->> 'buyerName', ''));
  v_tax_code text := btrim(COALESCE(v_payload ->> 'buyerTaxCode', ''));
  v_address text := btrim(COALESCE(v_payload ->> 'buyerAddress', ''));
  v_email text := btrim(COALESCE(v_payload ->> 'buyerEmail', ''));
  v_not_get boolean := COALESCE((v_payload ->> 'buyerNotGetInvoice')::boolean, false);
BEGIN
  IF v_not_get
     OR (v_buyer_name = '' AND v_tax_code = '' AND v_address = '' AND v_email = '') THEN
    RETURN jsonb_build_object(
      'buyerName', 'Bán cho người tiêu dùng',
      'buyerNotGetInvoice', true
    );
  END IF;

  IF v_tax_code <> '' THEN
    IF v_buyer_name = '' OR v_address = '' THEN
      RAISE EXCEPTION 'invalid_invoice_payload' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'buyerName', NULLIF(v_buyer_name, ''),
    'buyerTaxCode', NULLIF(v_tax_code, ''),
    'buyerAddress', NULLIF(v_address, ''),
    'buyerEmail', NULLIF(v_email, ''),
    'buyerNotGetInvoice', false
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_set_actor_claims(p_actor uuid, p_tenant_id bigint)
RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', p_actor::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', p_tenant_id)
    )::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_active_payment_lock(p_order_id bigint)
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT p.id
  FROM public.payments p
  WHERE p.order_id = p_order_id
    AND p.method = 'vietqr'
    AND p.status = 'pending'
  ORDER BY p.id DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.self_order_menu_payload(p_tenant_id bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'type', c.type,
      'sort_order', c.sort_order,
      'menu_items', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', mi.id,
            'name', mi.name,
            'description', mi.description,
            'base_price', mi.base_price,
            'image_url', mi.image_url,
            'sort_order', mi.sort_order,
            'menu_item_variants', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', v.id,
                  'name', v.name,
                  'price_adjustment', v.price_adjustment,
                  'sort_order', v.sort_order
                )
                ORDER BY v.sort_order, v.id
              )
              FROM public.menu_item_variants v
              WHERE v.tenant_id = mi.tenant_id
                AND v.item_id = mi.id
                AND v.is_active = true
            ), '[]'::jsonb),
            'menu_item_modifiers', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', m.id,
                  'name', m.name,
                  'price', m.price,
                  'sort_order', m.sort_order
                )
                ORDER BY m.sort_order, m.id
              )
              FROM public.menu_item_modifiers m
              WHERE m.tenant_id = mi.tenant_id
                AND m.item_id = mi.id
                AND m.is_active = true
            ), '[]'::jsonb),
            'menu_item_available_sides', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', s.id,
                  'is_default', s.is_default,
                  'side_item', jsonb_build_object(
                    'id', side_item.id,
                    'name', side_item.name,
                    'base_price', side_item.base_price
                  )
                )
                ORDER BY side_item.sort_order, side_item.id
              )
              FROM public.menu_item_available_sides s
              JOIN public.menu_items side_item
                ON side_item.id = s.side_item_id
               AND side_item.tenant_id = s.tenant_id
               AND side_item.is_active = true
              WHERE s.tenant_id = mi.tenant_id
                AND s.main_item_id = mi.id
            ), '[]'::jsonb)
          )
          ORDER BY mi.sort_order, mi.id
        )
        FROM public.menu_items mi
        WHERE mi.tenant_id = c.tenant_id
          AND mi.category_id = c.id
          AND mi.is_active = true
      ), '[]'::jsonb)
    )
    ORDER BY c.sort_order, c.id
  ), '[]'::jsonb)
  FROM public.menu_categories c
  WHERE c.tenant_id = p_tenant_id
    AND c.is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.self_order_canonicalize_cart(
  p_tenant_id bigint,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_item jsonb;
  v_menu record;
  v_variant_id bigint;
  v_variant_name text;
  v_variant_price numeric(15,2);
  v_modifier_ids bigint[];
  v_modifiers jsonb;
  v_result jsonb := '[]'::jsonb;
  v_quantity int;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'invalid_cart_payload' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS value LOOP
    v_quantity := (v_item ->> 'quantity')::int;
    IF v_quantity IS NULL OR v_quantity < 1 OR v_quantity > 99 THEN
      RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023';
    END IF;

    SELECT id, name, base_price
    INTO v_menu
    FROM public.menu_items
    WHERE id = (v_item ->> 'menu_item_id')::bigint
      AND tenant_id = p_tenant_id
      AND is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'menu_item_not_available' USING ERRCODE = 'P0002';
    END IF;

    v_variant_id := NULL;
    v_variant_name := NULL;
    v_variant_price := 0;
    IF NULLIF(v_item ->> 'variant_id', '') IS NOT NULL THEN
      SELECT id, name, price_adjustment
      INTO v_variant_id, v_variant_name, v_variant_price
      FROM public.menu_item_variants
      WHERE id = (v_item ->> 'variant_id')::bigint
        AND item_id = v_menu.id
        AND tenant_id = p_tenant_id
        AND is_active = true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'variant_not_available' USING ERRCODE = 'P0002';
      END IF;
    END IF;

    SELECT COALESCE(array_agg(DISTINCT (m.value ->> 'modifier_id')::bigint), ARRAY[]::bigint[])
    INTO v_modifier_ids
    FROM jsonb_array_elements(COALESCE(v_item -> 'modifiers', '[]'::jsonb)) AS m(value);

    IF COALESCE(array_length(v_modifier_ids, 1), 0) > 0 THEN
      SELECT jsonb_agg(
        jsonb_build_object(
          'modifier_id', mm.id,
          'name', mm.name,
          'price', mm.price
        )
        ORDER BY mm.sort_order, mm.id
      )
      INTO v_modifiers
      FROM public.menu_item_modifiers mm
      WHERE mm.tenant_id = p_tenant_id
        AND mm.item_id = v_menu.id
        AND mm.is_active = true
        AND mm.id = ANY(v_modifier_ids);

      IF jsonb_array_length(COALESCE(v_modifiers, '[]'::jsonb)) <> array_length(v_modifier_ids, 1) THEN
        RAISE EXCEPTION 'modifier_not_available' USING ERRCODE = 'P0002';
      END IF;
    ELSE
      v_modifiers := '[]'::jsonb;
    END IF;

    v_result := v_result || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'key', COALESCE(NULLIF(v_item ->> 'key', ''), extensions.gen_random_uuid()::text),
      'menu_item_id', v_menu.id,
      'item_name', v_menu.name,
      'variant_id', v_variant_id,
      'variant_name', v_variant_name,
      'quantity', v_quantity,
      'unit_price', v_menu.base_price + COALESCE(v_variant_price, 0),
      'modifiers', v_modifiers,
      'sides', COALESCE(v_item -> 'sides', '[]'::jsonb),
      'note', NULLIF(btrim(COALESCE(v_item ->> 'note', '')), '')
    )));
  END LOOP;

  RETURN v_result;
END;
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

  SELECT *
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.tenant_id = v_table.tenant_id
    AND s.table_id = v_table.table_id
    AND s.status IN ('pending_approval', 'active')
  ORDER BY s.id DESC
  LIMIT 1;

  IF FOUND AND v_session.status = 'active' AND v_session.order_id IS NOT NULL THEN
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

    SELECT status, method, amount_snapshot, created_at
    INTO v_payment_request
    FROM public.self_order_payment_requests pr
    WHERE pr.tenant_id = v_session.tenant_id
      AND pr.session_id = v_session.id
      AND pr.status IN ('cash_call', 'vietqr_pending')
    ORDER BY pr.id DESC
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'branch', jsonb_build_object(
      'name', v_table.branch_name
    ),
    'table', jsonb_build_object(
      'number', v_table.table_number
    ),
    'session', CASE WHEN v_session.id IS NULL THEN NULL ELSE jsonb_build_object(
      'status', v_session.status,
      'createdAt', v_session.created_at,
      'approvedAt', v_session.approved_at
    ) END,
    'order', CASE WHEN v_order.order_number IS NULL THEN NULL ELSE jsonb_build_object(
      'orderNumber', v_order.order_number,
      'status', v_order.status,
      'paymentStatus', v_order.payment_status,
      'paymentMethod', v_order.payment_method,
      'totalAmount', v_order.total_amount,
      'itemCount', v_order.item_count
    ) END,
    'paymentRequest', CASE WHEN v_payment_request.status IS NULL THEN NULL ELSE jsonb_build_object(
      'status', v_payment_request.status,
      'method', v_payment_request.method,
      'amount', v_payment_request.amount_snapshot,
      'createdAt', v_payment_request.created_at
    ) END,
    'menu', public.self_order_menu_payload(v_table.tenant_id),
    'realtimeTopic', 'self-order:' || v_table.self_order_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_append_active_batch(
  p_session_id bigint,
  p_batch_id bigint,
  p_client_op_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_session record;
  v_order record;
  v_result jsonb;
  v_pending_payment_id bigint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND OR v_session.status <> 'active' OR v_session.order_id IS NULL THEN
    RAISE EXCEPTION 'self_order_session_not_active' USING ERRCODE = '22023';
  END IF;

  IF v_session.approved_by IS NULL THEN
    RAISE EXCEPTION 'self_order_missing_actor' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.tables t
  WHERE t.id = v_session.table_id
    AND t.tenant_id = v_session.tenant_id
    AND t.branch_id = v_session.branch_id
    AND t.self_order_enabled = true
    AND t.self_order_token = v_session.token_snapshot;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_token_disabled' USING ERRCODE = '42501';
  END IF;

  SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.status, o.payment_status, o.merged_into_order_id
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_session.order_id
    AND o.tenant_id = v_session.tenant_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_order.branch_id <> v_session.branch_id
     OR v_order.table_id IS DISTINCT FROM v_session.table_id
     OR v_order.status NOT IN ('new', 'confirmed', 'preparing', 'ready', 'served')
     OR COALESCE(v_order.payment_status, 'unpaid') = 'paid'
     OR v_order.merged_into_order_id IS NOT NULL THEN
    UPDATE public.self_order_sessions
       SET status = 'closed',
           closed_at = now(),
           close_reason = 'order_closed'
     WHERE id = v_session.id;
    RAISE EXCEPTION 'self_order_order_not_appendable' USING ERRCODE = '22023';
  END IF;

  SELECT public.self_order_active_payment_lock(v_order.id) INTO v_pending_payment_id;
  IF v_pending_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'self_order_pending_payment_exists' USING ERRCODE = '55P03';
  END IF;

  PERFORM public.self_order_set_actor_claims(v_session.approved_by, v_session.tenant_id);
  v_result := public.append_order_items(v_session.order_id, p_items, p_client_op_id);

  UPDATE public.self_order_batches
     SET status = 'auto_accepted',
         order_id = v_session.order_id,
         accepted_by = v_session.approved_by,
         accepted_at = now(),
         failure_reason = NULL
   WHERE id = p_batch_id
     AND tenant_id = v_session.tenant_id;

  RETURN COALESCE(v_result, '{}'::jsonb) || jsonb_build_object(
    'session_status', 'active',
    'batch_id', p_batch_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_submit_batch(
  p_token text,
  p_client_op_id uuid,
  p_items jsonb,
  p_customer_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_table record;
  v_session record;
  v_batch record;
  v_items jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'invalid_cart_payload' USING ERRCODE = '22023';
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

  v_items := public.self_order_canonicalize_cart(v_table.tenant_id, p_items);

  LOOP
    SELECT *
    INTO v_session
    FROM public.self_order_sessions s
    WHERE s.tenant_id = v_table.tenant_id
      AND s.table_id = v_table.id
      AND s.status IN ('pending_approval', 'active')
    ORDER BY s.id DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      EXIT;
    END IF;

    BEGIN
      INSERT INTO public.self_order_sessions (
        tenant_id, branch_id, table_id, status,
        token_snapshot, token_rotated_at_snapshot
      )
      VALUES (
        v_table.tenant_id, v_table.branch_id, v_table.id, 'pending_approval',
        v_table.self_order_token, v_table.self_order_token_rotated_at
      )
      RETURNING * INTO v_session;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  INSERT INTO public.self_order_batches (
    tenant_id, branch_id, table_id, session_id,
    client_op_id, status, cart_payload, customer_note
  )
  VALUES (
    v_table.tenant_id, v_table.branch_id, v_table.id, v_session.id,
    p_client_op_id, 'pending_approval', v_items, NULLIF(btrim(COALESCE(p_customer_note, '')), '')
  )
  ON CONFLICT (tenant_id, session_id, client_op_id) DO UPDATE
    SET updated_at = public.self_order_batches.updated_at
  RETURNING * INTO v_batch;

  IF v_batch.status IN ('accepted', 'auto_accepted') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', v_batch.status,
      'idempotent', true
    );
  END IF;

  IF v_session.status = 'active' THEN
    RETURN public.self_order_append_active_batch(
      v_session.id,
      v_batch.id,
      p_client_op_id,
      v_items
    ) || jsonb_build_object('ok', true, 'status', 'auto_accepted');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'pending_approval',
    'batchId', v_batch.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_create_payment_request(
  p_token text,
  p_client_op_id uuid,
  p_method text,
  p_invoice_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_table record;
  v_session record;
  v_order record;
  v_existing_request record;
  v_payment_id bigint;
  v_invoice_payload jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  IF p_method NOT IN ('cash_call', 'vietqr') THEN
    RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
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

  SELECT *
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.tenant_id = v_table.tenant_id
    AND s.table_id = v_table.id
    AND s.status = 'active'
  ORDER BY s.id DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_session.order_id IS NULL OR v_session.approved_by IS NULL THEN
    RAISE EXCEPTION 'self_order_session_not_active' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_session.order_id
    AND o.tenant_id = v_session.tenant_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_order.table_id IS DISTINCT FROM v_session.table_id
     OR v_order.status NOT IN ('new', 'confirmed', 'preparing', 'ready', 'served')
     OR COALESCE(v_order.payment_status, 'unpaid') = 'paid'
     OR v_order.merged_into_order_id IS NOT NULL THEN
    UPDATE public.self_order_sessions
       SET status = 'closed', closed_at = now(), close_reason = 'order_closed'
     WHERE id = v_session.id;
    RAISE EXCEPTION 'self_order_order_not_payable' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_existing_request
  FROM public.self_order_payment_requests pr
  WHERE pr.tenant_id = v_session.tenant_id
    AND pr.session_id = v_session.id
    AND pr.client_op_id = p_client_op_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', v_existing_request.status,
      'method', v_existing_request.method,
      'amount', v_existing_request.amount_snapshot,
      'paymentCode', v_order.payment_code,
      'idempotent', true
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.self_order_payment_requests pr
    WHERE pr.tenant_id = v_session.tenant_id
      AND pr.session_id = v_session.id
      AND pr.status = 'vietqr_pending'
    FOR UPDATE
  )
  OR public.self_order_active_payment_lock(v_order.id) IS NOT NULL THEN
    RAISE EXCEPTION 'self_order_pending_payment_exists' USING ERRCODE = '55P03';
  END IF;

  v_invoice_payload := public.self_order_normalize_invoice_payload(p_invoice_payload);

  IF p_method = 'cash_call' THEN
    INSERT INTO public.self_order_payment_requests (
      tenant_id, branch_id, table_id, session_id, order_id,
      client_op_id, method, status, amount_snapshot, invoice_payload
    )
    VALUES (
      v_session.tenant_id, v_session.branch_id, v_session.table_id, v_session.id, v_order.id,
      p_client_op_id, 'cash_call', 'cash_call', v_order.total_amount, v_invoice_payload
    )
    RETURNING * INTO v_existing_request;

    RETURN jsonb_build_object(
      'ok', true,
      'status', 'cash_call',
      'amount', v_order.total_amount
    );
  END IF;

  IF v_order.total_amount <= 0 THEN
    RAISE EXCEPTION 'self_order_vietqr_requires_positive_amount' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.payments (
    tenant_id, branch_id, order_id, method, amount,
    status, provider_ref, provider_data, created_by
  )
  VALUES (
    v_session.tenant_id, v_session.branch_id, v_order.id, 'vietqr', v_order.total_amount,
    'pending', v_order.payment_code,
    jsonb_build_object(
      'source', 'qr_self_order',
      'description', v_order.payment_code,
      'invoicePayload', v_invoice_payload
    ),
    v_session.approved_by
  )
  RETURNING id INTO v_payment_id;

  UPDATE public.orders
     SET payment_status = 'pending',
         payment_method = 'vietqr',
         updated_at = now()
   WHERE id = v_order.id;

  INSERT INTO public.self_order_payment_requests (
    tenant_id, branch_id, table_id, session_id, order_id, payment_id,
    client_op_id, method, status, amount_snapshot, invoice_payload,
    expires_at
  )
  VALUES (
    v_session.tenant_id, v_session.branch_id, v_session.table_id, v_session.id,
    v_order.id, v_payment_id, p_client_op_id, 'vietqr', 'vietqr_pending',
    v_order.total_amount, v_invoice_payload, now() + interval '30 minutes'
  )
  RETURNING * INTO v_existing_request;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'vietqr_pending',
    'amount', v_order.total_amount,
    'paymentCode', v_order.payment_code
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_cancel_pending_payment_and_add(
  p_token text,
  p_client_op_id uuid,
  p_items jsonb,
  p_customer_note text DEFAULT NULL
)
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
  v_payment record;
  v_batch record;
  v_items jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
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

  v_items := public.self_order_canonicalize_cart(v_table.tenant_id, p_items);

  SELECT *
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.tenant_id = v_table.tenant_id
    AND s.table_id = v_table.id
    AND s.status = 'active'
  ORDER BY s.id DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'self_order_session_not_active' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_session.order_id
    AND o.tenant_id = v_session.tenant_id
  FOR UPDATE;

  IF NOT FOUND OR COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    UPDATE public.self_order_sessions
       SET status = 'closed', closed_at = now(), close_reason = 'payment_completed'
     WHERE id = v_session.id;
    RAISE EXCEPTION 'self_order_payment_completed' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_payment_request
  FROM public.self_order_payment_requests pr
  WHERE pr.tenant_id = v_session.tenant_id
    AND pr.session_id = v_session.id
    AND pr.status = 'vietqr_pending'
  ORDER BY pr.id DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND AND v_payment_request.payment_id IS NOT NULL THEN
    SELECT *
    INTO v_payment
    FROM public.payments p
    WHERE p.id = v_payment_request.payment_id
      AND p.tenant_id = v_session.tenant_id
    FOR UPDATE;

    IF FOUND AND v_payment.status = 'completed' THEN
      UPDATE public.self_order_payment_requests
         SET status = 'completed', completed_at = COALESCE(v_payment.paid_at, now())
       WHERE id = v_payment_request.id;
      UPDATE public.self_order_sessions
         SET status = 'closed', closed_at = now(), close_reason = 'payment_completed'
       WHERE id = v_session.id;
      RAISE EXCEPTION 'self_order_payment_completed' USING ERRCODE = '22023';
    END IF;

    IF FOUND AND v_payment.status = 'pending' THEN
      UPDATE public.payments
         SET status = 'failed',
             updated_at = now()
       WHERE id = v_payment.id;
    END IF;
  END IF;

  IF FOUND THEN
    UPDATE public.self_order_payment_requests
       SET status = 'cancelled',
           cancelled_at = now()
     WHERE id = v_payment_request.id;
  END IF;

  UPDATE public.orders
     SET payment_status = 'unpaid',
         payment_method = NULL,
         updated_at = now()
   WHERE id = v_order.id
     AND payment_status <> 'paid';

  INSERT INTO public.self_order_batches (
    tenant_id, branch_id, table_id, session_id,
    client_op_id, status, cart_payload, customer_note
  )
  VALUES (
    v_session.tenant_id, v_session.branch_id, v_session.table_id, v_session.id,
    p_client_op_id, 'pending_approval', v_items, NULLIF(btrim(COALESCE(p_customer_note, '')), '')
  )
  ON CONFLICT (tenant_id, session_id, client_op_id) DO UPDATE
    SET updated_at = public.self_order_batches.updated_at
  RETURNING * INTO v_batch;

  IF v_batch.status IN ('accepted', 'auto_accepted') THEN
    RETURN jsonb_build_object('ok', true, 'status', v_batch.status, 'idempotent', true);
  END IF;

  RETURN public.self_order_append_active_batch(
    v_session.id,
    v_batch.id,
    p_client_op_id,
    v_items
  ) || jsonb_build_object('ok', true, 'status', 'auto_accepted', 'cancelledPayment', FOUND);
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_list_staff_queue(p_branch_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_tenant IS NULL OR NOT public.has_permission(p_branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'permission denied: pos:use' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'pendingBatches', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'sessionId', b.session_id,
          'tableId', b.table_id,
          'tableNumber', t.number,
          'status', b.status,
          'items', b.cart_payload,
          'customerNote', b.customer_note,
          'createdAt', b.created_at
        )
        ORDER BY b.created_at
      )
      FROM public.self_order_batches b
      JOIN public.tables t
        ON t.id = b.table_id
       AND t.tenant_id = b.tenant_id
      WHERE b.tenant_id = v_tenant
        AND b.branch_id = p_branch_id
        AND b.status = 'pending_approval'
    ), '[]'::jsonb),
    'paymentRequests', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', pr.id,
          'tableId', pr.table_id,
          'tableNumber', t.number,
          'orderNumber', o.order_number,
          'method', pr.method,
          'status', pr.status,
          'amount', pr.amount_snapshot,
          'createdAt', pr.created_at
        )
        ORDER BY pr.created_at
      )
      FROM public.self_order_payment_requests pr
      JOIN public.tables t
        ON t.id = pr.table_id
       AND t.tenant_id = pr.tenant_id
      JOIN public.orders o
        ON o.id = pr.order_id
       AND o.tenant_id = pr.tenant_id
      WHERE pr.tenant_id = v_tenant
        AND pr.branch_id = p_branch_id
        AND pr.status IN ('cash_call', 'vietqr_pending')
    ), '[]'::jsonb)
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
      p_pos_session_id,
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
       OR v_order.merged_into_order_id IS NOT NULL THEN
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

CREATE OR REPLACE FUNCTION public.self_order_reject_batch(
  p_batch_id bigint,
  p_reason text DEFAULT NULL
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT *
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

  IF v_batch.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'self_order_batch_not_pending' USING ERRCODE = '22023';
  END IF;

  UPDATE public.self_order_batches
     SET status = 'rejected',
         rejected_by = v_uid,
         rejected_at = now(),
         failure_reason = NULLIF(btrim(COALESCE(p_reason, '')), '')
   WHERE id = p_batch_id;

  RETURN jsonb_build_object('ok', true, 'status', 'rejected');
END;
$$;

CREATE OR REPLACE FUNCTION public.self_order_sync_payment_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    UPDATE public.self_order_payment_requests
       SET status = 'completed',
           completed_at = COALESCE(NEW.paid_at, now())
     WHERE payment_id = NEW.id
       AND status = 'vietqr_pending';
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_self_order_sync_payment_request
  AFTER UPDATE OF status ON public.payments
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.self_order_sync_payment_request();

CREATE OR REPLACE FUNCTION public.self_order_close_session_from_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_reason text;
BEGIN
  IF NEW.payment_status = 'paid' THEN
    v_reason := 'payment_completed';
  ELSIF NEW.status IN ('completed', 'cancelled') THEN
    v_reason := 'order_' || NEW.status;
  ELSE
    RETURN NULL;
  END IF;

  UPDATE public.self_order_sessions
     SET status = 'closed',
         closed_at = COALESCE(closed_at, now()),
         close_reason = COALESCE(close_reason, v_reason)
   WHERE tenant_id = NEW.tenant_id
     AND order_id = NEW.id
     AND status = 'active';

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_self_order_close_session_from_order
  AFTER UPDATE OF status, payment_status ON public.orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.payment_status IS DISTINCT FROM NEW.payment_status)
  EXECUTE FUNCTION public.self_order_close_session_from_order();

CREATE OR REPLACE FUNCTION public.self_order_broadcast_session_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_row jsonb;
  v_session_id bigint;
  v_token text;
BEGIN
  v_row := to_jsonb(NEW);
  v_session_id := COALESCE(
    NULLIF(v_row ->> 'session_id', '')::bigint,
    NULLIF(v_row ->> 'id', '')::bigint
  );

  SELECT t.self_order_token
  INTO v_token
  FROM public.self_order_sessions s
  JOIN public.tables t
    ON t.id = s.table_id
   AND t.tenant_id = s.tenant_id
  WHERE s.id = v_session_id
  LIMIT 1;

  IF v_token IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'realtime'
      AND p.proname = 'send'
  ) THEN
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object('sessionId', v_session_id, 'changedAt', now()),
        'session_changed',
        'self-order:' || v_token,
        false
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '[self_order_broadcast_session_changed] broadcast skipped: %', SQLERRM;
    END;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_self_order_sessions_broadcast
  AFTER INSERT OR UPDATE ON public.self_order_sessions
  FOR EACH ROW EXECUTE FUNCTION public.self_order_broadcast_session_changed();

CREATE TRIGGER trg_self_order_batches_broadcast
  AFTER INSERT OR UPDATE ON public.self_order_batches
  FOR EACH ROW EXECUTE FUNCTION public.self_order_broadcast_session_changed();

CREATE TRIGGER trg_self_order_payment_requests_broadcast
  AFTER INSERT OR UPDATE ON public.self_order_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.self_order_broadcast_session_changed();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'realtime'
      AND table_name = 'messages'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'realtime'
      AND table_name = 'messages'
      AND column_name = 'topic'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'realtime'
      AND table_name = 'messages'
      AND column_name = 'private'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'realtime'
      AND tablename = 'messages'
      AND policyname = 'self_order_public_broadcast_select'
  ) THEN
    CREATE POLICY self_order_public_broadcast_select
      ON realtime.messages
      FOR SELECT
      TO anon, authenticated
      USING (topic LIKE 'self-order:%' AND private = false);
  END IF;
END $$;

REVOKE ALL ON TABLE public.self_order_sessions FROM anon;
REVOKE ALL ON TABLE public.self_order_batches FROM anon;
REVOKE ALL ON TABLE public.self_order_payment_requests FROM anon;
GRANT SELECT ON TABLE public.self_order_sessions TO authenticated;
GRANT SELECT ON TABLE public.self_order_batches TO authenticated;
GRANT SELECT ON TABLE public.self_order_payment_requests TO authenticated;
GRANT ALL ON TABLE public.self_order_sessions TO service_role;
GRANT ALL ON TABLE public.self_order_batches TO service_role;
GRANT ALL ON TABLE public.self_order_payment_requests TO service_role;

REVOKE ALL ON FUNCTION public.self_order_normalize_invoice_payload(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_sync_payment_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_close_session_from_order() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_broadcast_session_changed() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.self_order_get_snapshot(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.self_order_submit_batch(text, uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.self_order_create_payment_request(text, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.self_order_cancel_pending_payment_and_add(text, uuid, jsonb, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.self_order_get_snapshot(text) TO service_role;
GRANT ALL ON FUNCTION public.self_order_submit_batch(text, uuid, jsonb, text) TO service_role;
GRANT ALL ON FUNCTION public.self_order_create_payment_request(text, uuid, text, jsonb) TO service_role;
GRANT ALL ON FUNCTION public.self_order_cancel_pending_payment_and_add(text, uuid, jsonb, text) TO service_role;

REVOKE ALL ON FUNCTION public.self_order_list_staff_queue(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.self_order_approve_batch(bigint, bigint, bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.self_order_reject_batch(bigint, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.self_order_list_staff_queue(bigint) TO authenticated;
GRANT ALL ON FUNCTION public.self_order_approve_batch(bigint, bigint, bigint, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.self_order_reject_batch(bigint, text) TO authenticated;
