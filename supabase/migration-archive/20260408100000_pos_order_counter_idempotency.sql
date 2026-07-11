-- =============================================================
-- POS: Atomic per-branch daily order sequence + idempotency key
-- Removes advisory-lock contention; safe retries return same order.
-- =============================================================

-- ── 1. Daily sequence table (UPSERT bump, no global lock) ─────
CREATE TABLE public.order_daily_counters (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  counter_date DATE NOT NULL,
  last_seq INT NOT NULL DEFAULT 0 CHECK (last_seq >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, counter_date)
);

CREATE INDEX idx_order_daily_counters_tenant_branch
  ON public.order_daily_counters (tenant_id, branch_id);

ALTER TABLE public.order_daily_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branch_all" ON public.order_daily_counters
  FOR ALL
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      branch_id = public.auth_branch_id()
      OR public.auth_role() IN ('owner', 'super_manager', 'area_manager')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      branch_id = public.auth_branch_id()
      OR public.auth_role() IN ('owner', 'super_manager', 'area_manager')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_daily_counters TO authenticated;

-- Seed counters from existing orders (UTC calendar day) so new sequences do not collide.
INSERT INTO public.order_daily_counters (tenant_id, branch_id, counter_date, last_seq)
SELECT
  o.tenant_id,
  o.branch_id,
  (o.created_at AT TIME ZONE 'UTC')::date,
  COUNT(*)::int
FROM public.orders o
GROUP BY o.tenant_id, o.branch_id, (o.created_at AT TIME ZONE 'UTC')::date;

-- ── 2. Idempotency column on orders ────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN idempotency_key UUID;

CREATE UNIQUE INDEX orders_idempotency_per_tenant_uidx
  ON public.orders (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── 3. Replace create_order ───────────────────────────────────
DROP FUNCTION IF EXISTS public.create_order(
  BIGINT,
  BIGINT,
  UUID,
  JSONB,
  TEXT,
  BIGINT,
  BIGINT,
  INT,
  TEXT
);

CREATE OR REPLACE FUNCTION public.create_order(
  p_tenant_id         BIGINT,
  p_branch_id         BIGINT,
  p_created_by        UUID,
  p_items             JSONB,
  p_order_type        TEXT    DEFAULT 'dine_in',
  p_table_id          BIGINT  DEFAULT NULL,
  p_pos_session_id    BIGINT  DEFAULT NULL,
  p_customer_count    INT     DEFAULT 1,
  p_note              TEXT    DEFAULT NULL,
  p_idempotency_key   UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_created_by    UUID;
  v_order_id      BIGINT;
  v_order_number  TEXT;
  v_subtotal      NUMERIC(15,2) := 0;
  v_seq           INT;
  v_item          JSONB;
  v_base_price    NUMERIC(15,2);
  v_variant_adj   NUMERIC(15,2);
  v_modifier_sum  NUMERIC(15,2);
  v_unit_price    NUMERIC(15,2);
  v_item_subtotal NUMERIC(15,2);
  v_menu_item_id  BIGINT;
  v_variant_id    BIGINT;
  v_quantity      INT;
BEGIN
  v_created_by := auth.uid();
  IF v_created_by IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items must be a non-empty JSON array' USING ERRCODE = '22023';
  END IF;

  IF p_order_type NOT IN ('dine_in', 'takeaway') THEN
    RAISE EXCEPTION 'p_order_type must be dine_in or takeaway' USING ERRCODE = '22023';
  END IF;

  IF p_table_id IS NOT NULL THEN
    PERFORM 1 FROM public.tables
    WHERE id = p_table_id AND branch_id = p_branch_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Table does not belong to this branch' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF p_pos_session_id IS NOT NULL THEN
    PERFORM 1 FROM public.pos_sessions
    WHERE id = p_pos_session_id
      AND branch_id = p_branch_id
      AND tenant_id = p_tenant_id
      AND status = 'open';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'POS session does not belong to this branch or is not open' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Idempotent replay: same key → same order (no duplicate bill)
  IF p_idempotency_key IS NOT NULL THEN
    SELECT o.id, o.order_number INTO v_order_id, v_order_number
    FROM public.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'order_id', v_order_id,
        'order_number', v_order_number
      );
    END IF;
  END IF;

  -- Atomic daily sequence (no advisory lock / no COUNT scan)
  INSERT INTO public.order_daily_counters (
    tenant_id, branch_id, counter_date, last_seq
  )
  VALUES (
    p_tenant_id, p_branch_id, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, 1
  )
  ON CONFLICT (tenant_id, branch_id, counter_date)
  DO UPDATE SET
    last_seq = public.order_daily_counters.last_seq + 1,
    updated_at = now()
  RETURNING last_seq INTO v_seq;

  v_order_number := p_branch_id::TEXT
    || '-' || to_char((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, 'YYMMDD')
    || '-' || lpad(v_seq::TEXT, 3, '0');

  BEGIN
    INSERT INTO public.orders (
      tenant_id, branch_id, table_id, order_number, order_type,
      subtotal, total_amount, customer_count, note, created_by,
      pos_session_id, idempotency_key
    )
    VALUES (
      p_tenant_id, p_branch_id, p_table_id, v_order_number, p_order_type,
      0, 0, p_customer_count, p_note, v_created_by,
      p_pos_session_id, p_idempotency_key
    )
    RETURNING id INTO v_order_id;
  EXCEPTION
    WHEN unique_violation THEN
      IF p_idempotency_key IS NOT NULL THEN
        SELECT o.id, o.order_number INTO v_order_id, v_order_number
        FROM public.orders o
        WHERE o.tenant_id = p_tenant_id
          AND o.idempotency_key = p_idempotency_key;
        IF FOUND THEN
          RETURN jsonb_build_object(
            'order_id', v_order_id,
            'order_number', v_order_number
          );
        END IF;
      END IF;
      RAISE;
  END;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS value
  LOOP
    v_menu_item_id := (v_item ->> 'menu_item_id')::BIGINT;
    v_variant_id   := (v_item ->> 'variant_id')::BIGINT;
    v_quantity     := (v_item ->> 'quantity')::INT;

    SELECT base_price INTO v_base_price
    FROM public.menu_items
    WHERE id = v_menu_item_id AND tenant_id = p_tenant_id AND is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu item % not found or inactive', v_menu_item_id USING ERRCODE = 'P0002';
    END IF;

    v_variant_adj := 0;
    IF v_variant_id IS NOT NULL THEN
      SELECT price_adjustment INTO v_variant_adj
      FROM public.menu_item_variants
      WHERE id = v_variant_id AND item_id = v_menu_item_id AND tenant_id = p_tenant_id AND is_active = true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant % not found or inactive', v_variant_id USING ERRCODE = 'P0002';
      END IF;
    END IF;

    v_modifier_sum := 0;
    IF v_item -> 'modifiers' IS NOT NULL
       AND jsonb_typeof(v_item -> 'modifiers') = 'array'
       AND jsonb_array_length(v_item -> 'modifiers') > 0
    THEN
      SELECT COALESCE(SUM(m.price), 0) INTO v_modifier_sum
      FROM jsonb_array_elements(v_item -> 'modifiers') AS mod_el
      JOIN public.menu_item_modifiers m
        ON m.id = (mod_el ->> 'modifier_id')::BIGINT
       AND m.item_id = v_menu_item_id
       AND m.tenant_id = p_tenant_id
       AND m.is_active = true;
    END IF;

    v_unit_price    := v_base_price + v_variant_adj + v_modifier_sum;
    v_item_subtotal := v_unit_price * v_quantity;
    v_subtotal      := v_subtotal + v_item_subtotal;

    INSERT INTO public.order_items (
      tenant_id, order_id, menu_item_id, variant_id,
      item_name, variant_name, quantity, unit_price,
      modifiers, sides, subtotal, note
    )
    VALUES (
      p_tenant_id, v_order_id, v_menu_item_id, v_variant_id,
      v_item ->> 'item_name', v_item ->> 'variant_name',
      v_quantity, v_unit_price,
      COALESCE(v_item -> 'modifiers', '[]'::JSONB),
      COALESCE(v_item -> 'sides', '[]'::JSONB),
      v_item_subtotal, v_item ->> 'note'
    );
  END LOOP;

  UPDATE public.orders
  SET subtotal = v_subtotal, total_amount = v_subtotal
  WHERE id = v_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by
  )
  VALUES (p_tenant_id, v_order_id, NULL, 'new', v_created_by);

  IF p_order_type = 'dine_in' AND p_table_id IS NOT NULL THEN
    UPDATE public.tables
    SET status = 'occupied'
    WHERE id = p_table_id AND branch_id = p_branch_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Failed to update table status' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  PERFORM public.route_order_to_kds(v_order_id);

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order(
  BIGINT,
  BIGINT,
  UUID,
  JSONB,
  TEXT,
  BIGINT,
  BIGINT,
  INT,
  TEXT,
  UUID
) TO authenticated;
