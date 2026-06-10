-- POS daily-limit holds
--
-- Problem: two POS clients can both read "1 portion left" and add it to their
-- local carts. The old trigger correctly let only the first submitted order
-- win, but the economic rule should be "first cart reservation wins".

CREATE TABLE IF NOT EXISTS public.branch_menu_item_daily_holds (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id bigint NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  menu_item_id bigint NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  limit_date date NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),
  hold_token uuid NOT NULL,
  held_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'pos_cart',
  quantity integer NOT NULL,
  expires_at timestamptz NOT NULL,
  committed_at timestamptz,
  released_at timestamptz,
  order_id bigint REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branch_menu_item_daily_holds_source_check
    CHECK (source IN ('pos_cart', 'pos_append')),
  CONSTRAINT branch_menu_item_daily_holds_quantity_check
    CHECK (quantity > 0)
);

COMMENT ON TABLE public.branch_menu_item_daily_holds IS
  'Short-lived POS cart reservations for branch_menu_item_daily_limits. Active rows reserve quota before order submit; commit/release/expiry removes them from availability.';

CREATE INDEX IF NOT EXISTS idx_bmidh_active_lookup
  ON public.branch_menu_item_daily_holds (branch_id, limit_date, menu_item_id)
  WHERE committed_at IS NULL AND released_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bmidh_token_active
  ON public.branch_menu_item_daily_holds (hold_token, branch_id, limit_date)
  WHERE committed_at IS NULL AND released_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bmidh_user_active
  ON public.branch_menu_item_daily_holds (tenant_id, held_by, expires_at)
  WHERE committed_at IS NULL AND released_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bmidh_order
  ON public.branch_menu_item_daily_holds (order_id)
  WHERE order_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_bmidh_updated_at ON public.branch_menu_item_daily_holds;
CREATE TRIGGER trg_bmidh_updated_at
  BEFORE UPDATE ON public.branch_menu_item_daily_holds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.branch_menu_item_daily_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bmidh_select ON public.branch_menu_item_daily_holds;
CREATE POLICY bmidh_select ON public.branch_menu_item_daily_holds
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      held_by = auth.uid()
      OR public.auth_role() IN ('owner', 'super_manager')
      OR public.auth_branch_id() = branch_id
    )
  );

REVOKE ALL ON TABLE public.branch_menu_item_daily_holds FROM PUBLIC;
GRANT SELECT ON TABLE public.branch_menu_item_daily_holds TO authenticated;
GRANT ALL ON TABLE public.branch_menu_item_daily_holds TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.branch_menu_item_daily_holds_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.pos_daily_limit_item_quantities(p_items jsonb)
RETURNS TABLE(menu_item_id bigint, quantity integer)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  WITH input AS (
    SELECT elem AS item
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS item_rows(elem)
  ),
  agg AS (
    SELECT
      (item ->> 'menu_item_id')::bigint AS menu_item_id,
      COALESCE(NULLIF(item ->> 'quantity', '')::integer, 0) AS quantity
    FROM input
    WHERE item ? 'menu_item_id'
      AND (item ->> 'menu_item_id') ~ '^[0-9]+$'

    UNION ALL

    SELECT
      (side_rows.elem ->> 'side_item_id')::bigint AS menu_item_id,
      (
        COALESCE(NULLIF(input.item ->> 'quantity', '')::integer, 0)
        * GREATEST(
            COALESCE(NULLIF(side_rows.elem ->> 'quantity', '')::integer, 1),
            1
          )
      )::integer AS quantity
    FROM input
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(input.item -> 'sides', '[]'::jsonb)
    ) AS side_rows(elem)
    WHERE side_rows.elem ? 'side_item_id'
      AND (side_rows.elem ->> 'side_item_id') ~ '^[0-9]+$'
  )
  SELECT agg.menu_item_id, SUM(agg.quantity)::integer
  FROM agg
  WHERE agg.menu_item_id IS NOT NULL
    AND agg.quantity > 0
  GROUP BY agg.menu_item_id
  ORDER BY agg.menu_item_id ASC;
$$;

COMMENT ON FUNCTION public.pos_daily_limit_item_quantities(jsonb) IS
  'Aggregate POS RPC items into daily-limit demand. Counts each main item quantity and side_item_id demand as parent quantity times side quantity.';

CREATE OR REPLACE FUNCTION public.reserve_branch_menu_daily_holds(
  p_branch_id bigint,
  p_hold_token uuid,
  p_items jsonb,
  p_source text DEFAULT 'pos_cart',
  p_ttl_seconds integer DEFAULT 180
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_branch_id bigint := public.auth_branch_id();
  v_role text := public.auth_role();
  v_limit_date date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_ttl_seconds integer := LEAST(GREATEST(COALESCE(p_ttl_seconds, 180), 30), 600);
  v_expires_at timestamptz := now() + make_interval(secs => LEAST(GREATEST(COALESCE(p_ttl_seconds, 180), 30), 600));
  v_target record;
  v_limit record;
  v_other_hold_qty integer;
  v_items jsonb := '[]'::jsonb;
  v_released integer := 0;
BEGIN
  IF v_uid IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF p_hold_token IS NULL THEN
    RAISE EXCEPTION 'hold_token required' USING ERRCODE = '22023';
  END IF;

  IF p_source NOT IN ('pos_cart', 'pos_append') THEN
    RAISE EXCEPTION 'invalid hold source' USING ERRCODE = '22023';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array' USING ERRCODE = '22023';
  END IF;

  IF v_role NOT IN ('owner', 'super_manager', 'branch_manager', 'cashier', 'waiter') THEN
    RAISE EXCEPTION 'permission denied: pos daily-limit hold' USING ERRCODE = '42501';
  END IF;

  IF v_role NOT IN ('owner', 'super_manager')
     AND (v_branch_id IS NULL OR v_branch_id <> p_branch_id) THEN
    RAISE EXCEPTION 'branch scope mismatch' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.branches b
  WHERE b.id = p_branch_id
    AND b.tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.branch_menu_item_daily_holds h
  SET released_at = h.expires_at,
      updated_at = now()
  WHERE h.tenant_id = v_tenant_id
    AND h.branch_id = p_branch_id
    AND h.limit_date = v_limit_date
    AND h.committed_at IS NULL
    AND h.released_at IS NULL
    AND h.expires_at <= now();

  IF jsonb_array_length(p_items) = 0 THEN
    UPDATE public.branch_menu_item_daily_holds h
    SET released_at = now(),
        updated_at = now()
    WHERE h.tenant_id = v_tenant_id
      AND h.branch_id = p_branch_id
      AND h.hold_token = p_hold_token
      AND h.held_by = v_uid
      AND h.committed_at IS NULL
      AND h.released_at IS NULL;

    GET DIAGNOSTICS v_released = ROW_COUNT;

    RETURN jsonb_build_object(
      'success', true,
      'hold_token', p_hold_token,
      'items', '[]'::jsonb,
      'released_count', v_released
    );
  END IF;

  FOR v_target IN
    SELECT *
    FROM public.pos_daily_limit_item_quantities(p_items)
  LOOP
    SELECT * INTO v_limit
    FROM public.branch_menu_item_daily_limits bl
    WHERE bl.tenant_id = v_tenant_id
      AND bl.branch_id = p_branch_id
      AND bl.menu_item_id = v_target.menu_item_id
      AND bl.limit_date = v_limit_date
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_limit.is_disabled THEN
      RAISE EXCEPTION 'daily_limit_item_disabled'
        USING ERRCODE = 'P0001',
              DETAIL = jsonb_build_object(
                'reason', 'daily_limit_item_disabled',
                'menu_item_id', v_target.menu_item_id
              )::text;
    END IF;

    IF v_limit.limit_quantity IS NULL THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(h.quantity), 0)::integer
    INTO v_other_hold_qty
    FROM public.branch_menu_item_daily_holds h
    WHERE h.tenant_id = v_tenant_id
      AND h.branch_id = p_branch_id
      AND h.menu_item_id = v_target.menu_item_id
      AND h.limit_date = v_limit_date
      AND h.hold_token <> p_hold_token
      AND h.committed_at IS NULL
      AND h.released_at IS NULL
      AND h.expires_at > now();

    IF v_limit.sold_today + v_other_hold_qty + v_target.quantity > v_limit.limit_quantity THEN
      RAISE EXCEPTION 'daily_limit_exceeded'
        USING ERRCODE = 'P0001',
              DETAIL = jsonb_build_object(
                'reason', 'daily_limit_exceeded',
                'menu_item_id', v_target.menu_item_id,
                'limit_quantity', v_limit.limit_quantity,
                'sold_today', v_limit.sold_today,
                'held_quantity', v_other_hold_qty,
                'requested_quantity', v_target.quantity
              )::text;
    END IF;
  END LOOP;

  UPDATE public.branch_menu_item_daily_holds h
  SET released_at = now(),
      updated_at = now()
  WHERE h.tenant_id = v_tenant_id
    AND h.branch_id = p_branch_id
    AND h.hold_token = p_hold_token
    AND h.held_by = v_uid
    AND h.committed_at IS NULL
    AND h.released_at IS NULL;

  WITH requested AS (
    SELECT *
    FROM public.pos_daily_limit_item_quantities(p_items)
  ),
  inserted AS (
    INSERT INTO public.branch_menu_item_daily_holds (
      tenant_id,
      branch_id,
      menu_item_id,
      limit_date,
      hold_token,
      held_by,
      source,
      quantity,
      expires_at
    )
    SELECT
      v_tenant_id,
      p_branch_id,
      r.menu_item_id,
      v_limit_date,
      p_hold_token,
      v_uid,
      p_source,
      r.quantity,
      v_expires_at
    FROM requested r
    JOIN public.branch_menu_item_daily_limits bl
      ON bl.tenant_id = v_tenant_id
     AND bl.branch_id = p_branch_id
     AND bl.menu_item_id = r.menu_item_id
     AND bl.limit_date = v_limit_date
    WHERE bl.limit_quantity IS NOT NULL
      AND bl.is_disabled = false
    RETURNING menu_item_id, quantity, expires_at
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'menu_item_id', inserted.menu_item_id,
        'quantity', inserted.quantity,
        'expires_at', inserted.expires_at
      )
      ORDER BY inserted.menu_item_id
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM inserted;

  RETURN jsonb_build_object(
    'success', true,
    'hold_token', p_hold_token,
    'expires_at', v_expires_at,
    'ttl_seconds', v_ttl_seconds,
    'items', v_items
  );
END;
$$;

COMMENT ON FUNCTION public.reserve_branch_menu_daily_holds(bigint, uuid, jsonb, text, integer) IS
  'Replace a POS cart daily-limit hold snapshot. Locks limit rows by menu_item_id ASC, excludes the caller token, raises daily_limit_item_disabled / daily_limit_exceeded, and stores short-lived active holds.';

CREATE OR REPLACE FUNCTION public.release_branch_menu_daily_holds(
  p_branch_id bigint,
  p_hold_token uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_branch_id bigint := public.auth_branch_id();
  v_role text := public.auth_role();
  v_released integer := 0;
BEGIN
  IF v_uid IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF p_hold_token IS NULL THEN
    RAISE EXCEPTION 'hold_token required' USING ERRCODE = '22023';
  END IF;

  IF v_role NOT IN ('owner', 'super_manager', 'branch_manager', 'cashier', 'waiter') THEN
    RAISE EXCEPTION 'permission denied: pos daily-limit hold' USING ERRCODE = '42501';
  END IF;

  IF v_role NOT IN ('owner', 'super_manager')
     AND (v_branch_id IS NULL OR v_branch_id <> p_branch_id) THEN
    RAISE EXCEPTION 'branch scope mismatch' USING ERRCODE = '42501';
  END IF;

  UPDATE public.branch_menu_item_daily_holds h
  SET released_at = now(),
      updated_at = now()
  WHERE h.tenant_id = v_tenant_id
    AND h.branch_id = p_branch_id
    AND h.hold_token = p_hold_token
    AND h.held_by = v_uid
    AND h.committed_at IS NULL
    AND h.released_at IS NULL;

  GET DIAGNOSTICS v_released = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'hold_token', p_hold_token,
    'released_count', v_released
  );
END;
$$;

COMMENT ON FUNCTION public.release_branch_menu_daily_holds(bigint, uuid) IS
  'Release active POS daily-limit holds owned by the caller token for a branch.';

CREATE OR REPLACE FUNCTION public.create_order_with_daily_limit_hold(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_created_by uuid,
  p_items jsonb,
  p_order_type text DEFAULT 'dine_in'::text,
  p_table_id bigint DEFAULT NULL::bigint,
  p_pos_session_id bigint DEFAULT NULL::bigint,
  p_customer_count integer DEFAULT 1,
  p_note text DEFAULT NULL::text,
  p_idempotency_key uuid DEFAULT NULL::uuid,
  p_daily_limit_hold_token uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_order_id bigint;
BEGIN
  IF p_daily_limit_hold_token IS NOT NULL THEN
    PERFORM set_config(
      'comtammatu.daily_limit_hold_token',
      p_daily_limit_hold_token::text,
      true
    );
  END IF;

  v_result := public.create_order(
    p_tenant_id,
    p_branch_id,
    p_created_by,
    p_items,
    p_order_type,
    p_table_id,
    p_pos_session_id,
    p_customer_count,
    p_note,
    p_idempotency_key
  );

  v_order_id := NULLIF(v_result ->> 'order_id', '')::bigint;

  IF p_daily_limit_hold_token IS NOT NULL AND v_order_id IS NOT NULL THEN
    UPDATE public.branch_menu_item_daily_holds h
    SET committed_at = COALESCE(h.committed_at, now()),
        order_id = COALESCE(h.order_id, v_order_id),
        updated_at = now()
    WHERE h.tenant_id = p_tenant_id
      AND h.branch_id = p_branch_id
      AND h.hold_token = p_daily_limit_hold_token
      AND h.held_by = v_uid
      AND h.committed_at IS NULL
      AND h.released_at IS NULL
      AND h.expires_at > now();
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.create_order_with_daily_limit_hold(bigint, bigint, uuid, jsonb, text, bigint, bigint, integer, text, uuid, uuid) IS
  'Wrapper around create_order that sets transaction-local daily-limit hold token so the quota trigger excludes the caller hold, then commits matching active holds to the new order.';

CREATE OR REPLACE FUNCTION public.append_order_items_with_daily_limit_hold(
  p_order_id bigint,
  p_items jsonb,
  p_idempotency_key uuid DEFAULT NULL::uuid,
  p_daily_limit_hold_token uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_order record;
BEGIN
  IF p_daily_limit_hold_token IS NOT NULL THEN
    PERFORM set_config(
      'comtammatu.daily_limit_hold_token',
      p_daily_limit_hold_token::text,
      true
    );
  END IF;

  v_result := public.append_order_items(
    p_order_id,
    p_items,
    p_idempotency_key
  );

  IF p_daily_limit_hold_token IS NOT NULL THEN
    SELECT o.tenant_id, o.branch_id
    INTO v_order
    FROM public.orders o
    WHERE o.id = p_order_id;

    IF FOUND THEN
      UPDATE public.branch_menu_item_daily_holds h
      SET committed_at = COALESCE(h.committed_at, now()),
          order_id = COALESCE(h.order_id, p_order_id),
          updated_at = now()
      WHERE h.tenant_id = v_order.tenant_id
        AND h.branch_id = v_order.branch_id
        AND h.hold_token = p_daily_limit_hold_token
        AND h.held_by = v_uid
        AND h.committed_at IS NULL
        AND h.released_at IS NULL
        AND h.expires_at > now();
    END IF;
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.append_order_items_with_daily_limit_hold(bigint, jsonb, uuid, uuid) IS
  'Wrapper around append_order_items that sets transaction-local daily-limit hold token so the quota trigger excludes the caller hold, then commits matching active holds to the target order.';

CREATE OR REPLACE FUNCTION public.enforce_branch_menu_daily_limit() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $_$
DECLARE
  v_branch_id       bigint;
  v_order_date      date;
  v_tenant_id       bigint;
  v_target          record;
  v_limit           record;
  v_hold_token_text text;
  v_hold_token      uuid;
  v_active_hold_qty integer;
BEGIN
  IF COALESCE(current_setting('comtammatu.skip_quota_enforcement', true), 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  v_hold_token_text := NULLIF(
    current_setting('comtammatu.daily_limit_hold_token', true),
    ''
  );
  IF v_hold_token_text IS NOT NULL THEN
    v_hold_token := v_hold_token_text::uuid;
  END IF;

  SELECT o.tenant_id,
         o.branch_id,
         (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  INTO v_tenant_id, v_branch_id, v_order_date
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF v_branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_target IN
    WITH agg AS (
      SELECT NEW.menu_item_id::bigint AS item_id,
             NEW.quantity::integer    AS need_qty
      UNION ALL
      SELECT (s.elem ->> 'side_item_id')::bigint,
             (NEW.quantity * COALESCE(NULLIF(s.elem ->> 'quantity', '')::integer, 1))::integer
      FROM jsonb_array_elements(COALESCE(NEW.sides, '[]'::jsonb)) AS s(elem)
      WHERE s.elem ? 'side_item_id'
        AND (s.elem ->> 'side_item_id') ~ '^[0-9]+$'
    )
    SELECT item_id, SUM(need_qty)::integer AS need_qty
    FROM agg
    WHERE item_id IS NOT NULL
    GROUP BY item_id
    ORDER BY item_id ASC
  LOOP
    SELECT * INTO v_limit
    FROM public.branch_menu_item_daily_limits
    WHERE branch_id = v_branch_id
      AND menu_item_id = v_target.item_id
      AND limit_date = v_order_date
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_limit.is_disabled THEN
      RAISE EXCEPTION 'daily_limit_item_disabled'
        USING ERRCODE = 'P0001',
              DETAIL = jsonb_build_object(
                'reason', 'daily_limit_item_disabled',
                'menu_item_id', v_target.item_id
              )::text;
    END IF;

    SELECT COALESCE(SUM(h.quantity), 0)::integer
    INTO v_active_hold_qty
    FROM public.branch_menu_item_daily_holds h
    WHERE h.tenant_id = v_tenant_id
      AND h.branch_id = v_branch_id
      AND h.menu_item_id = v_target.item_id
      AND h.limit_date = v_order_date
      AND (v_hold_token IS NULL OR h.hold_token <> v_hold_token)
      AND h.committed_at IS NULL
      AND h.released_at IS NULL
      AND h.expires_at > now();

    IF v_limit.limit_quantity IS NOT NULL
       AND v_limit.sold_today + v_active_hold_qty + v_target.need_qty > v_limit.limit_quantity THEN
      RAISE EXCEPTION 'daily_limit_exceeded'
        USING ERRCODE = 'P0001',
              DETAIL = jsonb_build_object(
                'reason', 'daily_limit_exceeded',
                'menu_item_id', v_target.item_id,
                'limit_quantity', v_limit.limit_quantity,
                'sold_today', v_limit.sold_today,
                'held_quantity', v_active_hold_qty,
                'requested_quantity', v_target.need_qty
              )::text;
    END IF;

    UPDATE public.branch_menu_item_daily_limits
    SET sold_today = sold_today + v_target.need_qty
    WHERE id = v_limit.id;
  END LOOP;

  RETURN NEW;
END;
$_$;

COMMENT ON FUNCTION public.enforce_branch_menu_daily_limit() IS
  'AFTER INSERT on order_items: aggregate main + sides by menu_item_id ASC, lock each limit row, count active daily-limit holds except comtammatu.daily_limit_hold_token, raise P0001 daily_limit_item_disabled / daily_limit_exceeded, increment sold_today. Skip-hatch: comtammatu.skip_quota_enforcement=true.';

REVOKE ALL ON FUNCTION public.reserve_branch_menu_daily_holds(bigint, uuid, jsonb, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_branch_menu_daily_holds(bigint, uuid, jsonb, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_branch_menu_daily_holds(bigint, uuid, jsonb, text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.release_branch_menu_daily_holds(bigint, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_branch_menu_daily_holds(bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_branch_menu_daily_holds(bigint, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.create_order_with_daily_limit_hold(bigint, bigint, uuid, jsonb, text, bigint, bigint, integer, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_with_daily_limit_hold(bigint, bigint, uuid, jsonb, text, bigint, bigint, integer, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_with_daily_limit_hold(bigint, bigint, uuid, jsonb, text, bigint, bigint, integer, text, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.append_order_items_with_daily_limit_hold(bigint, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_order_items_with_daily_limit_hold(bigint, jsonb, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_order_items_with_daily_limit_hold(bigint, jsonb, uuid, uuid) TO service_role;
