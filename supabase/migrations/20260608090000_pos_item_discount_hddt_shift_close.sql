-- POS item-level discount + HĐĐT/shift-close discount correctness.
--
-- The lean baseline is regenerated from prod by the repo-owned lean-build script.
-- Keep this as a forward migration until the schema change lands in prod and the
-- lean baseline is regenerated from that source of truth.

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS item_discount_amount numeric(15,2) DEFAULT 0 NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_item_discount_amount_check
    CHECK (item_discount_amount >= 0);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

COMMENT ON COLUMN public.orders.item_discount_amount IS 'Tổng chiết khấu theo món từ các order_items active. Được re-derive bởi private.recompute_order_totals; không phải metadata chiết khấu cấp đơn.';

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS discount_amount numeric(15,2) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS discount_type text,
  ADD COLUMN IF NOT EXISTS discount_value numeric(15,2),
  ADD COLUMN IF NOT EXISTS discount_note text;

DO $$
BEGIN
  ALTER TABLE public.order_items
    ADD CONSTRAINT order_items_discount_amount_check
    CHECK (discount_amount >= 0 AND discount_amount <= subtotal);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE public.order_items
    ADD CONSTRAINT order_items_discount_metadata_paired
    CHECK (
      (discount_amount = 0 AND discount_type IS NULL AND discount_value IS NULL AND discount_note IS NULL)
      OR (
        discount_amount > 0
        AND discount_type IS NOT NULL
        AND discount_value IS NOT NULL
        AND discount_note IS NOT NULL
        AND length(trim(discount_note)) >= 3
      )
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE public.order_items
    ADD CONSTRAINT order_items_discount_type_check
    CHECK (discount_type IS NULL OR discount_type = ANY (ARRAY['pct'::text, 'vnd'::text]));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE public.order_items
    ADD CONSTRAINT order_items_discount_value_check
    CHECK (discount_value IS NULL OR discount_value >= 0);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

COMMENT ON COLUMN public.order_items.discount_amount IS 'Chiết khấu VND đã re-derive cho dòng món này từ discount_type/value và subtotal hiện tại. HĐĐT gửi trực tiếp xuống itemDiscount/discount.';
COMMENT ON COLUMN public.order_items.discount_value IS 'Giá trị gốc cashier nhập cho chiết khấu dòng món (10 cho 10%, 15000 cho 15.000đ trên dòng món).';
COMMENT ON COLUMN public.order_items.discount_note IS 'Ghi chú lý do chiết khấu dòng món (>= 3 ký tự sau trim).';


CREATE OR REPLACE FUNCTION public._compute_vat_breakdown(p_order_ids bigint[]) RETURNS TABLE(vat_rate numeric, line_gross numeric, line_subtotal numeric, line_vat numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  WITH order_items_sum AS (
    SELECT
      oi.order_id,
      SUM(GREATEST(COALESCE(oi.subtotal, 0) - COALESCE(oi.discount_amount, 0), 0)) AS items_sum
    FROM public.order_items oi
    WHERE oi.order_id = ANY(p_order_ids)
      AND oi.status <> 'cancelled'
    GROUP BY oi.order_id
  ),
  scaled AS (
    SELECT
      oi.vat_rate,
      (GREATEST(COALESCE(oi.subtotal, 0) - COALESCE(oi.discount_amount, 0), 0)
        * (o.total_amount / NULLIF(ois.items_sum, 0))) AS gross
    FROM public.order_items oi
    JOIN public.orders o            ON o.id = oi.order_id
    JOIN order_items_sum ois        ON ois.order_id = oi.order_id
    WHERE oi.order_id = ANY(p_order_ids)
      AND oi.status <> 'cancelled'
      AND ois.items_sum > 0
  ),
  by_rate AS (
    SELECT
      scaled.vat_rate,
      SUM(scaled.gross)::numeric(15,2) AS line_gross
    FROM scaled
    GROUP BY scaled.vat_rate
  )
  SELECT
    by_rate.vat_rate,
    by_rate.line_gross,
    (by_rate.line_gross / (1 + by_rate.vat_rate / 100))::numeric(15,2) AS line_subtotal,
    (by_rate.line_gross
       - (by_rate.line_gross / (1 + by_rate.vat_rate / 100))::numeric(15,2)
    )::numeric(15,2) AS line_vat
  FROM by_rate
  ORDER BY by_rate.vat_rate;
$$;


CREATE OR REPLACE FUNCTION public.append_order_items(p_order_id bigint, p_items jsonb, p_idempotency_key uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid             UUID;
  v_prof_tenant     BIGINT;
  v_prof_branch     BIGINT;
  v_prof_role       TEXT;
  v_order           RECORD;
  v_item            JSONB;
  v_base_price      NUMERIC(15,2);
  v_variant_adj     NUMERIC(15,2);
  v_modifier_sum    NUMERIC(15,2);
  v_sides_sum       NUMERIC(15,2);
  v_enriched_sides  JSONB;
  v_unit_price      NUMERIC(15,2);
  v_item_subtotal   NUMERIC(15,2);
  v_menu_item_id    BIGINT;
  v_variant_id      BIGINT;
  v_quantity        INT;
  v_subtotal        NUMERIC(15,2);
  v_discount_amount NUMERIC(15,2);
  v_total_amount    NUMERIC(15,2);
  v_note_parts      TEXT[] := ARRAY[]::TEXT[];
  v_item_name       TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.order_items
      WHERE order_id = p_order_id
        AND request_key = p_idempotency_key
      LIMIT 1
    ) THEN
      SELECT o.subtotal, o.total_amount
      INTO v_subtotal, v_total_amount
      FROM public.orders o
      WHERE o.id = p_order_id;

      RETURN jsonb_build_object(
        'success',      TRUE,
        'order_id',     p_order_id,
        'added_count',  0,
        'subtotal',     COALESCE(v_subtotal, 0),
        'total_amount', COALESCE(v_total_amount, 0),
        'idempotent',   TRUE
      );
    END IF;
  END IF;

  SELECT o.id, o.tenant_id, o.branch_id, o.status, o.payment_status, o.service_charge,
         o.discount_type, o.discount_value
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_order.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NOT NULL THEN
    IF v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
      RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'branch scope required' USING ERRCODE = '42501';
  END IF;

  IF v_order.status NOT IN ('new', 'confirmed', 'preparing', 'ready', 'served') THEN
    RAISE EXCEPTION 'order not appendable' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order not appendable' USING ERRCODE = '22023';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items must be a non-empty JSON array' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS value
  LOOP
    v_menu_item_id := (v_item ->> 'menu_item_id')::BIGINT;
    v_variant_id := NULLIF(v_item ->> 'variant_id', '')::BIGINT;
    v_quantity := (v_item ->> 'quantity')::INT;

    IF v_quantity IS NULL OR v_quantity < 1 THEN
      RAISE EXCEPTION 'invalid quantity' USING ERRCODE = '22023';
    END IF;

    SELECT base_price INTO v_base_price
    FROM public.menu_items
    WHERE id = v_menu_item_id AND tenant_id = v_order.tenant_id AND is_active = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu item % not found or inactive', v_menu_item_id USING ERRCODE = 'P0002';
    END IF;

    v_variant_adj := 0;
    IF v_variant_id IS NOT NULL THEN
      SELECT price_adjustment INTO v_variant_adj
      FROM public.menu_item_variants
      WHERE id = v_variant_id AND item_id = v_menu_item_id AND tenant_id = v_order.tenant_id AND is_active = TRUE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant % not found or inactive', v_variant_id USING ERRCODE = 'P0002';
      END IF;
    END IF;

    v_modifier_sum := public.pos_order_modifier_sum(
      v_order.tenant_id,
      v_menu_item_id,
      COALESCE(v_item -> 'modifiers', '[]'::JSONB)
    );

    SELECT sides_sum, enriched_sides
    INTO v_sides_sum, v_enriched_sides
    FROM public.pos_enrich_order_sides(
      v_order.tenant_id,
      v_menu_item_id,
      COALESCE(v_item -> 'sides', '[]'::JSONB)
    );

    v_unit_price := v_base_price + v_variant_adj + v_modifier_sum + COALESCE(v_sides_sum, 0);
    v_item_subtotal := v_unit_price * v_quantity;

    v_item_name := v_item ->> 'item_name';
    IF v_item_name IS NOT NULL AND length(trim(v_item_name)) > 0 THEN
      v_note_parts := array_append(v_note_parts, v_item_name);
    END IF;

    INSERT INTO public.order_items (
      tenant_id, order_id, menu_item_id, variant_id,
      item_name, variant_name, quantity, unit_price,
      modifiers, sides, subtotal, note, status, request_key
    )
    VALUES (
      v_order.tenant_id, p_order_id, v_menu_item_id, v_variant_id,
      COALESCE(v_item ->> 'item_name', 'Mon'),
      v_item ->> 'variant_name',
      v_quantity, v_unit_price,
      COALESCE(v_item -> 'modifiers', '[]'::JSONB),
      COALESCE(v_enriched_sides, '[]'::JSONB),
      v_item_subtotal, v_item ->> 'note', 'pending',
      p_idempotency_key
    );
  END LOOP;

  SELECT rt.subtotal, rt.order_discount_amount, rt.total_amount
  INTO v_subtotal, v_discount_amount, v_total_amount
  FROM private.recompute_order_totals(p_order_id) rt;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id,
    p_order_id,
    v_order.status,
    v_order.status,
    v_uid,
    'items_added: ' || COALESCE(array_to_string(v_note_parts, ', '), 'items')
  );

  PERFORM public.route_order_to_kds(p_order_id);

  RETURN jsonb_build_object(
    'success',      TRUE,
    'order_id',     p_order_id,
    'added_count',  jsonb_array_length(p_items),
    'subtotal',     v_subtotal,
    'total_amount', v_total_amount
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.apply_order_discount(p_order_id bigint, p_type text, p_value numeric, p_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid             UUID;
  v_prof_tenant     BIGINT;
  v_prof_branch     BIGINT;
  v_prof_role       TEXT;
  v_order           RECORD;
  v_clamped_value   NUMERIC(15,2);
  v_discount_amount NUMERIC(15,2);
  v_total_amount    NUMERIC(15,2);
  v_note_trim       TEXT;
  v_has_pending     BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  -- Bất kỳ nhân viên POS nào (cashier/waiter/branch_manager+) đều áp được.
  -- Không gate theo % — owner đã chốt tại 4-agent debate (C1).
  IF v_prof_role IS NULL OR v_prof_role NOT IN
     ('owner', 'super_manager', 'area_manager', 'branch_manager', 'cashier', 'waiter')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Validate type / value / note BEFORE locking — fail fast without
  -- holding the advisory lock.
  IF p_type IS NULL OR p_type NOT IN ('pct', 'vnd') THEN
    RAISE EXCEPTION 'discount_invalid_type' USING ERRCODE = '22023';
  END IF;

  IF p_value IS NULL OR p_value < 0 THEN
    RAISE EXCEPTION 'discount_invalid_value' USING ERRCODE = '22023';
  END IF;

  v_note_trim := COALESCE(trim(p_note), '');
  IF length(v_note_trim) < 3 THEN
    RAISE EXCEPTION 'discount_note_required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT o.id, o.tenant_id, o.branch_id, o.status, o.payment_status,
         o.subtotal, o.tax_amount, o.service_charge, o.item_discount_amount
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  -- Branch scope (SECURITY DEFINER — RLS bypass; manual check required).
  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_order.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  -- Block on terminal / paid orders. Discount = pre-payment cashier action;
  -- editing an already-completed order rewrites recorded revenue silently.
  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.order_id = p_order_id
      AND p.tenant_id = v_order.tenant_id
      AND p.branch_id = v_order.branch_id
      AND p.status = 'pending'
  )
  INTO v_has_pending;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'pending' OR v_has_pending THEN
    RAISE EXCEPTION 'discount_payment_pending' USING ERRCODE = '22023';
  END IF;

  -- Auto-clamp at the boundary (UI also clamps; this is defense-in-depth):
  -- pct beyond 100 -> 100, vnd beyond remaining subtotal -> remaining subtotal.
  IF p_type = 'pct' THEN
    v_clamped_value := LEAST(p_value, 100);
  ELSE
    v_clamped_value := LEAST(
      p_value,
      GREATEST(COALESCE(v_order.subtotal, 0) - COALESCE(v_order.item_discount_amount, 0), 0)
    );
  END IF;

  v_discount_amount := public.compute_discount_amount(
    p_type,
    v_clamped_value,
    GREATEST(COALESCE(v_order.subtotal, 0) - COALESCE(v_order.item_discount_amount, 0), 0)
  );

  -- Edge: cashier types 0 — that's NOT an apply, it's a clear. Force the
  -- caller to use clear_order_discount instead (so audit history reads
  -- "discount_cleared" not "discount_applied: 0%").
  IF v_discount_amount = 0 THEN
    RAISE EXCEPTION 'discount_zero_amount' USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders
     SET discount_type   = p_type,
         discount_value  = v_clamped_value,
         discount_note   = v_note_trim,
         discount_amount = v_discount_amount,
         updated_at      = now()
   WHERE id = p_order_id;

  SELECT rt.order_discount_amount, rt.total_amount
  INTO v_discount_amount, v_total_amount
  FROM private.recompute_order_totals(p_order_id) rt;

  -- Audit row in order_status_history. Re-stamps current status (no state
  -- transition) — the `note` column is the discount audit. Pattern matches
  -- append_order_items / void_order_item history entries.
  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  ) VALUES (
    v_order.tenant_id, p_order_id, v_order.status, v_order.status, v_uid,
    'discount_applied: ' || p_type || ' ' || v_clamped_value::TEXT
      || ' (' || v_discount_amount::TEXT || 'đ) :: ' || v_note_trim
  );

  RETURN jsonb_build_object(
    'order_id',        p_order_id,
    'discount_type',   p_type,
    'discount_value',  v_clamped_value,
    'discount_amount', v_discount_amount,
    'total_amount',    v_total_amount
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.apply_order_item_discount(p_order_item_id bigint, p_type text, p_value numeric, p_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid              UUID;
  v_prof_tenant      BIGINT;
  v_prof_branch      BIGINT;
  v_prof_role        TEXT;
  v_item             RECORD;
  v_order            RECORD;
  v_order_id         BIGINT;
  v_clamped_value    NUMERIC(15,2);
  v_discount_amount  NUMERIC(15,2);
  v_totals           RECORD;
  v_note_trim        TEXT;
  v_has_pending      BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN
     ('owner', 'super_manager', 'area_manager', 'branch_manager', 'cashier', 'waiter')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_type IS NULL OR p_type NOT IN ('pct', 'vnd') THEN
    RAISE EXCEPTION 'discount_invalid_type' USING ERRCODE = '22023';
  END IF;

  IF p_value IS NULL OR p_value < 0 THEN
    RAISE EXCEPTION 'discount_invalid_value' USING ERRCODE = '22023';
  END IF;

  v_note_trim := COALESCE(trim(p_note), '');
  IF length(v_note_trim) < 3 THEN
    RAISE EXCEPTION 'discount_note_required' USING ERRCODE = '22023';
  END IF;

  SELECT oi.order_id INTO v_order_id
  FROM public.order_items oi
  WHERE oi.id = p_order_item_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_order_id);

  SELECT * INTO v_item
  FROM public.order_items
  WHERE id = p_order_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_order.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_item.status = 'cancelled' THEN
    RAISE EXCEPTION 'item terminal' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.order_id = v_order.id
      AND p.tenant_id = v_order.tenant_id
      AND p.branch_id = v_order.branch_id
      AND p.status = 'pending'
  )
  INTO v_has_pending;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'pending' OR v_has_pending THEN
    RAISE EXCEPTION 'discount_payment_pending' USING ERRCODE = '22023';
  END IF;

  IF p_type = 'pct' THEN
    v_clamped_value := LEAST(p_value, 100);
  ELSE
    v_clamped_value := LEAST(p_value, COALESCE(v_item.subtotal, 0));
  END IF;

  v_discount_amount := public.compute_discount_amount(
    p_type,
    v_clamped_value,
    v_item.subtotal
  );

  IF v_discount_amount = 0 THEN
    RAISE EXCEPTION 'discount_zero_amount' USING ERRCODE = '22023';
  END IF;

  UPDATE public.order_items
  SET discount_type   = p_type,
      discount_value  = v_clamped_value,
      discount_note   = v_note_trim,
      discount_amount = v_discount_amount,
      updated_at      = now()
  WHERE id = p_order_item_id;

  SELECT * INTO v_totals
  FROM private.recompute_order_totals(v_order.id);

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  ) VALUES (
    v_order.tenant_id,
    v_order.id,
    v_order.status,
    v_order.status,
    v_uid,
    'item_discount_applied: item#' || p_order_item_id::TEXT || ' '
      || p_type || ' ' || v_clamped_value::TEXT
      || ' (' || v_discount_amount::TEXT || 'đ) :: ' || v_note_trim
  );

  RETURN jsonb_build_object(
    'order_id',              v_order.id,
    'order_item_id',         p_order_item_id,
    'item_discount_type',    p_type,
    'item_discount_value',   v_clamped_value,
    'item_discount_amount',  v_discount_amount,
    'order_discount_amount', v_totals.order_discount_amount,
    'total_item_discount',   v_totals.item_discount_amount,
    'total_amount',          v_totals.total_amount
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.clear_order_item_discount(p_order_item_id bigint, p_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid         UUID;
  v_prof_tenant BIGINT;
  v_prof_branch BIGINT;
  v_prof_role   TEXT;
  v_item        RECORD;
  v_order       RECORD;
  v_order_id    BIGINT;
  v_totals      RECORD;
  v_note_trim   TEXT;
  v_has_pending BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN
     ('owner', 'super_manager', 'area_manager', 'branch_manager', 'cashier', 'waiter')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_note_trim := COALESCE(trim(p_note), '');
  IF length(v_note_trim) < 3 THEN
    RAISE EXCEPTION 'discount_note_required' USING ERRCODE = '22023';
  END IF;

  SELECT oi.order_id INTO v_order_id
  FROM public.order_items oi
  WHERE oi.id = p_order_item_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_order_id);

  SELECT * INTO v_item
  FROM public.order_items
  WHERE id = p_order_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_order.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_item.status = 'cancelled' THEN
    RAISE EXCEPTION 'item terminal' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.order_id = v_order.id
      AND p.tenant_id = v_order.tenant_id
      AND p.branch_id = v_order.branch_id
      AND p.status = 'pending'
  )
  INTO v_has_pending;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'pending' OR v_has_pending THEN
    RAISE EXCEPTION 'discount_payment_pending' USING ERRCODE = '22023';
  END IF;

  UPDATE public.order_items
  SET discount_type   = NULL,
      discount_value  = NULL,
      discount_note   = NULL,
      discount_amount = 0,
      updated_at      = now()
  WHERE id = p_order_item_id;

  SELECT * INTO v_totals
  FROM private.recompute_order_totals(v_order.id);

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  ) VALUES (
    v_order.tenant_id,
    v_order.id,
    v_order.status,
    v_order.status,
    v_uid,
    'item_discount_cleared: item#' || p_order_item_id::TEXT
      || ' (was ' || COALESCE(v_item.discount_amount::TEXT, '0') || 'đ) :: '
      || v_note_trim
  );

  RETURN jsonb_build_object(
    'order_id',              v_order.id,
    'order_item_id',         p_order_item_id,
    'order_discount_amount', v_totals.order_discount_amount,
    'total_item_discount',   v_totals.item_discount_amount,
    'total_amount',          v_totals.total_amount
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id bigint, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid              UUID;
  v_prof_tenant      BIGINT;
  v_prof_branch      BIGINT;
  v_prof_role        TEXT;
  v_order            RECORD;
  v_item_id          BIGINT;
  v_print_res        JSONB;
  v_tickets_enqueued INT := 0;
  v_tickets_skipped  INT := 0;
  v_skip_reasons     TEXT[] := ARRAY[]::TEXT[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN ('branch_manager', 'cashier', 'waiter') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT id, tenant_id, branch_id, status, table_id, order_type,
         service_charge, discount_type, discount_value
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_branch IS NULL OR v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:void_order') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  UPDATE public.order_items
  SET status = 'cancelled',
      cancel_reason = p_reason,
      updated_at = now()
  WHERE order_id = p_order_id AND status <> 'cancelled';

  UPDATE public.kds_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE order_id = p_order_id AND tenant_id = v_order.tenant_id;

  UPDATE public.orders
  SET
    status          = 'cancelled',
    subtotal        = 0,
    discount_type   = NULL,
    discount_value  = NULL,
    discount_note   = NULL,
    discount_amount = 0,
    item_discount_amount = 0,
    total_amount    = 0 + COALESCE(service_charge, 0),
    updated_at      = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id, p_order_id, v_order.status, 'cancelled', v_uid, p_reason
  );

  FOR v_item_id IN
    SELECT id FROM public.order_items
    WHERE order_id = p_order_id
      AND sent_to_kitchen_at IS NOT NULL
    ORDER BY id
  LOOP
    BEGIN
      v_print_res := public.enqueue_cancel_ticket_print(v_item_id, p_reason);
      IF (v_print_res ? 'skipped') AND (v_print_res->>'skipped')::boolean THEN
        v_tickets_skipped := v_tickets_skipped + 1;
        v_skip_reasons := v_skip_reasons || COALESCE(v_print_res->>'reason', 'unknown');
      ELSE
        v_tickets_enqueued := v_tickets_enqueued + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_tickets_skipped := v_tickets_skipped + 1;
      v_skip_reasons := v_skip_reasons || ('error:' || SQLERRM);
      RAISE NOTICE '[cancel_order] cancel-ticket enqueue raised for item %: %',
        v_item_id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'order_id',         p_order_id,
    'status',           'cancelled',
    'cancel_tickets',   v_tickets_enqueued,
    'cancel_skipped',   v_tickets_skipped,
    'skip_reasons',     to_jsonb(v_skip_reasons)
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.clear_order_discount(p_order_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid          UUID;
  v_prof_tenant  BIGINT;
  v_prof_branch  BIGINT;
  v_prof_role    TEXT;
  v_order        RECORD;
  v_total_amount NUMERIC(15,2);
  v_has_pending  BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN
     ('owner', 'super_manager', 'area_manager', 'branch_manager', 'cashier', 'waiter')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT o.id, o.tenant_id, o.branch_id, o.status, o.payment_status,
         o.subtotal, o.service_charge, o.discount_amount
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_order.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.order_id = p_order_id
      AND p.tenant_id = v_order.tenant_id
      AND p.branch_id = v_order.branch_id
      AND p.status = 'pending'
  )
  INTO v_has_pending;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'pending' OR v_has_pending THEN
    RAISE EXCEPTION 'discount_payment_pending' USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders
     SET discount_type   = NULL,
         discount_value  = NULL,
         discount_note   = NULL,
         discount_amount = 0,
         updated_at      = now()
   WHERE id = p_order_id;

  SELECT rt.total_amount
  INTO v_total_amount
  FROM private.recompute_order_totals(p_order_id) rt;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  ) VALUES (
    v_order.tenant_id, p_order_id, v_order.status, v_order.status, v_uid,
    'discount_cleared (was '
      || COALESCE(v_order.discount_amount::TEXT, '0') || 'đ)'
  );

  RETURN jsonb_build_object(
    'order_id',     p_order_id,
    'total_amount', v_total_amount
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.complete_payment_and_consume_stock(p_payment_id bigint, p_expected_amount numeric DEFAULT NULL::numeric, p_provider_data jsonb DEFAULT NULL::jsonb, p_actor_id uuid DEFAULT NULL::uuid) RETURNS TABLE(status text, payment_id bigint, order_id bigint, stock_consumed boolean, detail text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_payment          RECORD;
  v_order            RECORD;
  v_line_subtotal    NUMERIC(15,2) := 0;
  v_recomputed_total NUMERIC(15,2) := 0;
  v_stock_status     TEXT := NULL;
  v_stock_detail     TEXT := NULL;
BEGIN
  SELECT p.id, p.order_id, p.tenant_id, p.branch_id, p.amount, p.status
  INTO v_payment
  FROM public.payments p
  WHERE p.id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'not_found'::TEXT, p_payment_id, NULL::BIGINT, FALSE,
      ('payment ' || p_payment_id || ' does not exist')::TEXT;
    RETURN;
  END IF;

  IF v_payment.status = 'completed' THEN
    RETURN QUERY SELECT
      'already_completed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      'payment was previously completed; no-op'::TEXT;
    RETURN;
  END IF;

  IF v_payment.status <> 'pending' THEN
    RETURN QUERY SELECT
      'failed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      ('payment status=' || v_payment.status || ' cannot transition to completed')::TEXT;
    RETURN;
  END IF;

  SELECT o.id, o.tenant_id, o.branch_id, o.tax_amount, o.service_charge,
         o.discount_amount, o.total_amount
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_payment.order_id
    AND o.tenant_id = v_payment.tenant_id
    AND o.branch_id = v_payment.branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'failed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      'order_not_found'::TEXT;
    RETURN;
  END IF;

  SELECT rt.total_amount
  INTO v_recomputed_total
  FROM private.recompute_order_totals(v_order.id) rt;

  IF ABS(v_payment.amount - v_recomputed_total) > 1 THEN
    UPDATE public.payments
       SET status = 'failed',
           provider_data = COALESCE(p_provider_data, provider_data),
           updated_at = now()
     WHERE id = v_payment.id;

    RETURN QUERY SELECT
      'amount_mismatch_recomputed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      ('stored=' || v_payment.amount || ' recomputed=' || v_recomputed_total)::TEXT;
    RETURN;
  END IF;

  IF p_expected_amount IS NOT NULL AND ABS(p_expected_amount - v_recomputed_total) > 1 THEN
    UPDATE public.payments
       SET status = 'failed',
           provider_data = COALESCE(p_provider_data, provider_data),
           updated_at = now()
     WHERE id = v_payment.id;

    RETURN QUERY SELECT
      'amount_mismatch_recomputed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      ('expected=' || p_expected_amount || ' recomputed=' || v_recomputed_total)::TEXT;
    RETURN;
  END IF;

  -- "không trừ kho" (owner policy 2026-05-28): stock consumption removed.

  UPDATE public.payments
     SET status        = 'completed',
         paid_at       = COALESCE(paid_at, now()),
         provider_data = COALESCE(p_provider_data, provider_data),
         updated_at    = now()
   WHERE id = v_payment.id;

  UPDATE public.orders
     SET payment_status = 'paid',
         updated_at     = now()
   WHERE id = v_payment.order_id
     AND tenant_id = v_payment.tenant_id;

  PERFORM public.finalize_paid_order(v_payment.order_id, p_actor_id);

  RETURN QUERY SELECT
    'completed'::TEXT,
    v_payment.id,
    v_payment.order_id,
    TRUE,
    'stock=ok'::TEXT;
END;
$$;


CREATE OR REPLACE FUNCTION private.recompute_order_item_discount(p_order_item_id bigint) RETURNS numeric
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_item            RECORD;
  v_discount_amount NUMERIC(15,2);
BEGIN
  SELECT oi.subtotal, oi.discount_type, oi.discount_value
  INTO v_item
  FROM public.order_items oi
  WHERE oi.id = p_order_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  v_discount_amount := public.compute_discount_amount(
    v_item.discount_type,
    v_item.discount_value,
    v_item.subtotal
  );

  UPDATE public.order_items oi
  SET discount_type   = CASE WHEN v_discount_amount = 0 THEN NULL ELSE oi.discount_type END,
      discount_value  = CASE WHEN v_discount_amount = 0 THEN NULL ELSE oi.discount_value END,
      discount_note   = CASE WHEN v_discount_amount = 0 THEN NULL ELSE oi.discount_note END,
      discount_amount = v_discount_amount,
      updated_at      = now()
  WHERE oi.id = p_order_item_id;

  RETURN v_discount_amount;
END;
$$;


CREATE OR REPLACE FUNCTION private.recompute_order_totals(p_order_id bigint) RETURNS TABLE(subtotal numeric, order_discount_amount numeric, item_discount_amount numeric, total_amount numeric)
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order                 RECORD;
  v_subtotal              NUMERIC(15,2);
  v_item_discount_amount  NUMERIC(15,2);
  v_order_discount_base   NUMERIC(15,2);
  v_order_discount_amount NUMERIC(15,2);
  v_total_amount          NUMERIC(15,2);
BEGIN
  SELECT o.discount_type, o.discount_value, o.tax_amount, o.service_charge
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT
    COALESCE(SUM(oi.subtotal), 0)::NUMERIC(15,2),
    COALESCE(SUM(oi.discount_amount), 0)::NUMERIC(15,2)
  INTO v_subtotal, v_item_discount_amount
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.status <> 'cancelled';

  v_order_discount_base := GREATEST(v_subtotal - v_item_discount_amount, 0);
  v_order_discount_amount := public.compute_discount_amount(
    v_order.discount_type,
    v_order.discount_value,
    v_order_discount_base
  );

  v_total_amount := GREATEST(
    0,
    ROUND(
      v_subtotal
      + COALESCE(v_order.tax_amount, 0)
      + COALESCE(v_order.service_charge, 0)
      - v_item_discount_amount
      - v_order_discount_amount,
      2
    )
  );

  UPDATE public.orders o
  SET subtotal             = v_subtotal,
      item_discount_amount = v_item_discount_amount,
      discount_type        = CASE WHEN v_order_discount_amount = 0 THEN NULL ELSE o.discount_type END,
      discount_value       = CASE WHEN v_order_discount_amount = 0 THEN NULL ELSE o.discount_value END,
      discount_note        = CASE WHEN v_order_discount_amount = 0 THEN NULL ELSE o.discount_note END,
      discount_amount      = v_order_discount_amount,
      total_amount         = v_total_amount,
      updated_at           = now()
  WHERE o.id = p_order_id;

  RETURN QUERY SELECT
    v_subtotal,
    v_order_discount_amount,
    v_item_discount_amount,
    v_total_amount;
END;
$$;


CREATE OR REPLACE FUNCTION public.edit_pending_order_item(p_order_item_id bigint, p_variant_id bigint, p_variant_name text, p_unit_price numeric, p_modifiers jsonb, p_sides jsonb, p_note text, p_quantity integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid            UUID;
  v_prof_tenant    BIGINT;
  v_prof_branch    BIGINT;
  v_prof_role      TEXT;
  v_item           public.order_items%ROWTYPE;
  v_order          public.orders%ROWTYPE;
  v_menu_active    BOOLEAN;
  v_base_price     NUMERIC(15,2);
  v_variant_adj    NUMERIC(15,2) := 0;
  v_modifier_sum   NUMERIC(15,2) := 0;
  v_sides_sum      NUMERIC(15,2) := 0;
  v_enriched_sides JSONB := '[]'::JSONB;
  v_new_unit       NUMERIC(15,2);
  v_old_qty        INT;
  v_old_unit       NUMERIC(15,2);
  v_new_subtotal   NUMERIC(15,2);
  v_subtotal_sum   NUMERIC(15,2);
  v_disc_amount    NUMERIC(15,2);
  v_total_amount   NUMERIC(15,2);
  v_flag_enabled   TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN ('branch_manager', 'cashier', 'waiter') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'quantity must be >= 1' USING ERRCODE = '22023';
  END IF;

  IF p_unit_price IS NULL OR p_unit_price < 0 THEN
    RAISE EXCEPTION 'unit_price must be >= 0' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_item.order_id);

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_branch IS NULL OR v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:void_order') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'pos_edit_pending_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RAISE EXCEPTION 'feature disabled' USING ERRCODE = '22023';
  END IF;

  IF v_item.status <> 'pending' THEN
    RAISE EXCEPTION 'item not editable' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  SELECT base_price, is_active
  INTO v_base_price, v_menu_active
  FROM public.menu_items
  WHERE id = v_item.menu_item_id AND tenant_id = v_order.tenant_id;

  IF NOT FOUND OR COALESCE(v_menu_active, FALSE) = FALSE THEN
    RAISE EXCEPTION 'menu item inactive' USING ERRCODE = '22023';
  END IF;

  IF p_variant_id IS NOT NULL THEN
    SELECT price_adjustment INTO v_variant_adj
    FROM public.menu_item_variants
    WHERE id = p_variant_id
      AND item_id = v_item.menu_item_id
      AND tenant_id = v_order.tenant_id
      AND is_active = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'variant inactive' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_variant_adj := 0;
  END IF;

  v_modifier_sum := public.pos_order_modifier_sum(
    v_order.tenant_id,
    v_item.menu_item_id,
    COALESCE(p_modifiers, '[]'::JSONB)
  );

  SELECT sides_sum, enriched_sides
  INTO v_sides_sum, v_enriched_sides
  FROM public.pos_enrich_order_sides(
    v_order.tenant_id,
    v_item.menu_item_id,
    COALESCE(p_sides, '[]'::JSONB)
  );

  v_new_unit := v_base_price + v_variant_adj + v_modifier_sum + COALESCE(v_sides_sum, 0);

  v_old_qty := v_item.quantity;
  v_old_unit := v_item.unit_price;
  v_new_subtotal := v_new_unit * p_quantity;

  UPDATE public.order_items
  SET variant_id   = p_variant_id,
      variant_name = NULLIF(p_variant_name, ''),
      unit_price   = v_new_unit,
      modifiers    = COALESCE(p_modifiers, '[]'::JSONB),
      sides        = COALESCE(v_enriched_sides, '[]'::JSONB),
      note         = NULLIF(trim(COALESCE(p_note, '')), ''),
      quantity     = p_quantity,
      subtotal     = v_new_subtotal,
      updated_at   = now()
  WHERE id = p_order_item_id;

  UPDATE public.kds_tickets
  SET updated_at = now()
  WHERE order_item_id = p_order_item_id
    AND tenant_id = v_item.tenant_id
    AND status NOT IN ('served', 'cancelled');

  PERFORM private.recompute_order_item_discount(p_order_item_id);

  SELECT rt.subtotal, rt.order_discount_amount, rt.total_amount
  INTO v_subtotal_sum, v_disc_amount, v_total_amount
  FROM private.recompute_order_totals(v_item.order_id) rt;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_item.tenant_id, v_item.order_id, v_order.status, v_order.status, v_uid,
    'edit_item ' || p_order_item_id::TEXT
      || ': qty ' || v_old_qty::TEXT || '->' || p_quantity::TEXT
      || ', unit ' || v_old_unit::TEXT || '->' || v_new_unit::TEXT
  );

  RETURN jsonb_build_object(
    'order_id',           v_item.order_id,
    'order_item_id',      p_order_item_id,
    'old_quantity',       v_old_qty,
    'new_quantity',       p_quantity,
    'subtotal',           v_subtotal_sum,
    'discount_amount',    v_disc_amount,
    'total_amount',       v_total_amount,
    'was_sent_to_kitchen', v_item.sent_to_kitchen_at IS NOT NULL
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.enqueue_provisional_bill(p_order_id bigint, p_qr_content text DEFAULT NULL::text, p_qr_header_label text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid          UUID;
  v_order        public.orders%ROWTYPE;
  v_branch       public.branches%ROWTYPE;
  v_table_no     INT;
  v_printer_id   BIGINT;
  v_cashier_name TEXT;
  v_branch_tax   TEXT;
  v_qr_type      TEXT;
  v_flag_enabled TEXT;
  v_vietqr_bank  TEXT;
  v_vietqr_acc   TEXT;
  v_vietqr_name  TEXT;
  v_payment_qr   JSONB;
  v_items        JSONB;
  v_payload      JSONB;
  v_idempotency  TEXT;
  v_job_id       BIGINT;
  v_now          TIMESTAMPTZ := now();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('pos:print') THEN
    RAISE EXCEPTION 'permission denied: pos:print' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'pos_provisional_bill_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RAISE EXCEPTION 'provisional bill printing is disabled' USING ERRCODE = 'P0001';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'order already paid; cannot print provisional bill' USING ERRCODE = 'P0001';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'order is cancelled; cannot print provisional bill' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_branch FROM public.branches WHERE id = v_order.branch_id;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT full_name INTO v_cashier_name
  FROM public.profiles WHERE id = v_order.created_by;

  SELECT value INTO v_branch_tax
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'branch_tax_code';

  v_printer_id := public.resolve_branch_printer_for_type(
    v_order.tenant_id,
    v_order.branch_id,
    'provisional_bill'
  );

  IF v_printer_id IS NULL THEN
    RAISE EXCEPTION 'no active receipt printer for branch %', v_order.branch_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_qr_content IS NOT NULL AND length(trim(p_qr_content)) > 0 THEN
    SELECT value INTO v_qr_type
    FROM public.system_settings
    WHERE tenant_id = v_order.tenant_id AND key = 'payment_qr_type';
    v_qr_type := COALESCE(v_qr_type, 'vietqr');

    IF v_qr_type = 'vietqr' THEN
      SELECT value INTO v_vietqr_bank FROM public.system_settings
       WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_bank_code';
      SELECT value INTO v_vietqr_acc FROM public.system_settings
       WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_account_no';
      SELECT value INTO v_vietqr_name FROM public.system_settings
       WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_account_name';
    END IF;

    v_payment_qr := jsonb_build_object(
      'type',          v_qr_type,
      'content',       p_qr_content,
      'header_label',  COALESCE(p_qr_header_label, UPPER(v_qr_type)),
      'account_no',    v_vietqr_acc,
      'account_name',  v_vietqr_name,
      'amount',        v_order.total_amount,
      'description',   'DH ' || v_order.order_number
    );
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'item_name',    oi.item_name,
      'variant_name', oi.variant_name,
      'quantity',     oi.quantity,
      'unit_price',   oi.unit_price,
      'modifiers',    oi.modifiers,
      'sides',        oi.sides,
      'subtotal',     oi.subtotal,
      'discount_amount', oi.discount_amount,
      'note',         oi.note
    )
    ORDER BY oi.id
  )
  INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.status <> 'cancelled';

  v_payload := jsonb_build_object(
    'kind',             'provisional_bill',
    'branch_name',      COALESCE(v_branch.name, ''),
    'branch_address',   COALESCE(v_branch.address, ''),
    'branch_phone',     COALESCE(v_branch.phone, ''),
    'branch_tax_code',  COALESCE(v_branch_tax, ''),
    'order_number',     v_order.order_number,
    'order_type',       v_order.order_type,
    'table_number',     v_table_no,
    'customer_count',   v_order.customer_count,
    'cashier_name',     COALESCE(v_cashier_name, ''),
    'note',             v_order.note,
    'items',            COALESCE(v_items, '[]'::jsonb),
    'subtotal',         v_order.subtotal,
    'tax_amount',       v_order.tax_amount,
    'service_charge',   v_order.service_charge,
    'discount_amount',  COALESCE(v_order.discount_amount, 0) + COALESCE(v_order.item_discount_amount, 0),
    'total_amount',     v_order.total_amount,
    'payment_qr',       v_payment_qr,
    'created_at',       to_char(v_order.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS'),
    'printed_at',       to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'order:' || p_order_id::TEXT
    || ':provisional:' || extract(epoch from v_now)::BIGINT::TEXT;

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  )
  VALUES (
    v_order.tenant_id, v_order.branch_id, v_printer_id, 'provisional_bill',
    p_order_id, v_payload, v_idempotency, v_uid
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET payload = EXCLUDED.payload
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'order_id',   p_order_id,
    'job_id',     v_job_id,
    'printer_id', v_printer_id,
    'qr_type',    v_qr_type
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.enqueue_receipt_print(p_order_id bigint, p_cash_received numeric DEFAULT NULL::numeric, p_cash_change numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid          UUID;
  v_order        public.orders%ROWTYPE;
  v_branch       public.branches%ROWTYPE;
  v_table_no     INT;
  v_printer_id   BIGINT;
  v_cashier_name TEXT;
  v_branch_tax   TEXT;
  v_items        JSONB;
  v_payload      JSONB;
  v_idempotency  TEXT;
  v_job_id       BIGINT;
  v_now          TIMESTAMPTZ := now();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_permission_any('pos:print')
    OR public.has_permission_any('pos:reprint_receipt')
  ) THEN
    RAISE EXCEPTION 'permission denied: pos:print' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_branch FROM public.branches WHERE id = v_order.branch_id;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT full_name INTO v_cashier_name
  FROM public.profiles WHERE id = v_order.created_by;

  SELECT value INTO v_branch_tax
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'branch_tax_code';

  v_printer_id := public.resolve_branch_printer_for_type(
    v_order.tenant_id,
    v_order.branch_id,
    'receipt'
  );

  IF v_printer_id IS NULL THEN
    RAISE EXCEPTION 'no active receipt printer for branch %', v_order.branch_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_cash_received IS NOT NULL OR p_cash_change IS NOT NULL THEN
    UPDATE public.orders
       SET cash_received = p_cash_received,
           cash_change   = p_cash_change
     WHERE id = p_order_id;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'item_name',    oi.item_name,
      'variant_name', oi.variant_name,
      'quantity',     oi.quantity,
      'unit_price',   oi.unit_price,
      'modifiers',    oi.modifiers,
      'sides',        oi.sides,
      'subtotal',     oi.subtotal,
      'discount_amount', oi.discount_amount,
      'note',         oi.note
    )
    ORDER BY oi.id
  )
  INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.status <> 'cancelled';

  v_payload := jsonb_build_object(
    'kind',             'receipt',
    'branch_name',      COALESCE(v_branch.name, ''),
    'branch_address',   COALESCE(v_branch.address, ''),
    'branch_phone',     COALESCE(v_branch.phone, ''),
    'branch_tax_code',  COALESCE(v_branch_tax, ''),
    'order_number',     v_order.order_number,
    'order_type',       v_order.order_type,
    'table_number',     v_table_no,
    'customer_count',   v_order.customer_count,
    'cashier_name',     COALESCE(v_cashier_name, ''),
    'note',             v_order.note,
    'items',            COALESCE(v_items, '[]'::jsonb),
    'subtotal',         v_order.subtotal,
    'tax_amount',       v_order.tax_amount,
    'service_charge',   v_order.service_charge,
    'discount_amount',  COALESCE(v_order.discount_amount, 0) + COALESCE(v_order.item_discount_amount, 0),
    'total_amount',     v_order.total_amount,
    'payment_method',   v_order.payment_method,
    'cash_received',    p_cash_received,
    'cash_change',      p_cash_change,
    'created_at',       to_char(v_order.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS'),
    'printed_at',       to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'order:' || p_order_id::TEXT || ':receipt';

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  )
  VALUES (
    v_order.tenant_id, v_order.branch_id, v_printer_id, 'receipt',
    p_order_id, v_payload, v_idempotency, v_uid
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    payload    = EXCLUDED.payload,
    printer_id = EXCLUDED.printer_id,
    status = CASE
               WHEN public.print_jobs.status IN ('failed','expired','printed')
               THEN 'pending'
               ELSE public.print_jobs.status
             END,
    last_error       = NULL,
    claimed_by_agent = NULL,
    claimed_at       = NULL
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'order_id',   p_order_id,
    'job_id',     v_job_id,
    'printer_id', v_printer_id
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.get_pos_session_report(p_session_id bigint) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_session              RECORD;
  v_totals               RECORD;
  v_payment_mix          JSONB;
  v_top_items            JSONB;
  v_categories           JSONB;
  v_total_items          INT;
  v_hourly               JSONB;
  v_peak_hour            JSONB;
  v_aov_bins             JSONB;
  v_discount_count       INT;
  v_discount_total       NUMERIC(15,2);
  v_top_discount_orders  JSONB;
  v_void_item_count      INT;
BEGIN
  SELECT
    s.id, s.tenant_id, s.branch_id, s.terminal_id,
    s.opened_at, s.closed_at, s.opening_cash, s.closing_cash,
    s.expected_cash, s.cash_difference, s.status, s.note,
    s.variance_approval_note,
    t.name AS terminal_name,
    pop.full_name AS opened_by_name,
    pcl.full_name AS closed_by_name
  INTO v_session
  FROM public.pos_sessions s
  LEFT JOIN public.pos_terminals t  ON t.id  = s.terminal_id
  LEFT JOIN public.profiles pop     ON pop.id = s.opened_by
  LEFT JOIN public.profiles pcl     ON pcl.id = s.closed_by
  WHERE s.id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE payment_status = 'paid' AND status <> 'cancelled') AS paid_count,
    COUNT(*) FILTER (WHERE payment_status <> 'paid' AND status <> 'cancelled') AS unpaid_count,
    COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
    COALESCE(SUM(subtotal) FILTER (WHERE payment_status = 'paid' AND status <> 'cancelled'), 0) AS gross,
    COALESCE(SUM(COALESCE(discount_amount, 0) + COALESCE(item_discount_amount, 0)) FILTER (WHERE payment_status = 'paid' AND status <> 'cancelled'), 0) AS discount_total,
    COALESCE(SUM(tax_amount) FILTER (WHERE payment_status = 'paid' AND status <> 'cancelled'), 0) AS tax_total,
    COALESCE(SUM(service_charge) FILTER (WHERE payment_status = 'paid' AND status <> 'cancelled'), 0) AS service_total,
    COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid' AND status <> 'cancelled'), 0) AS net,
    COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid' AND status <> 'cancelled' AND payment_method = 'cash'), 0) AS cash_revenue,
    COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid' AND status <> 'cancelled' AND (payment_method IS NULL OR payment_method <> 'cash')), 0) AS noncash_revenue
  INTO v_totals
  FROM public.orders
  WHERE pos_session_id = p_session_id
    AND tenant_id = v_session.tenant_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('method', payment_method, 'count', cnt, 'amount', amount)
    ORDER BY amount DESC
  ), '[]'::JSONB)
  INTO v_payment_mix
  FROM (
    SELECT payment_method, COUNT(*)::INT AS cnt, COALESCE(SUM(total_amount), 0) AS amount
    FROM public.orders
    WHERE pos_session_id = p_session_id
      AND tenant_id = v_session.tenant_id
      AND payment_status = 'paid'
      AND status <> 'cancelled'
    GROUP BY payment_method
  ) pm;

  WITH paid_items AS (
    SELECT
      oi.menu_item_id, oi.item_name,
      mi.category_id, mc.name AS category_name,
      oi.quantity,
      oi.subtotal,
      oi.discount_amount,
      GREATEST(COALESCE(oi.subtotal, 0) - COALESCE(oi.discount_amount, 0), 0) AS net_subtotal,
      CASE
        WHEN COALESCE(oi.subtotal, 0) > 0
        THEN GREATEST(COALESCE(oi.subtotal, 0) - COALESCE(oi.discount_amount, 0), 0)
             / COALESCE(oi.subtotal, 0)
        ELSE 1
      END AS line_discount_scale,
      oi.modifiers,
      oi.sides
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    LEFT JOIN public.menu_items mi      ON mi.id = oi.menu_item_id
    LEFT JOIN public.menu_categories mc ON mc.id = mi.category_id
    WHERE o.pos_session_id = p_session_id
      AND o.tenant_id = v_session.tenant_id
      AND o.payment_status = 'paid'
      AND o.status <> 'cancelled'
      AND oi.status <> 'cancelled'
  ),
  main_agg AS (
    SELECT item_name AS name, 'main'::TEXT AS source,
      COALESCE(SUM(quantity), 0)::INT AS qty,
      COALESCE(SUM(net_subtotal), 0) AS revenue
    FROM paid_items
    GROUP BY item_name
  ),
  side_agg AS (
    SELECT
      COALESCE(s ->> 'name', 'Side')::TEXT AS name,
      'side'::TEXT AS source,
      COALESCE(SUM(COALESCE((s ->> 'quantity')::INT, 1) * pi.quantity), 0)::INT AS qty,
      COALESCE(SUM(COALESCE((s ->> 'price')::NUMERIC, 0) * COALESCE((s ->> 'quantity')::INT, 1) * pi.quantity * pi.line_discount_scale), 0) AS revenue
    FROM paid_items pi
    CROSS JOIN LATERAL jsonb_array_elements(pi.sides) AS s
    GROUP BY s ->> 'name'
  ),
  mod_agg AS (
    SELECT
      COALESCE(m ->> 'name', 'Modifier')::TEXT AS name,
      'modifier'::TEXT AS source,
      COALESCE(SUM(pi.quantity), 0)::INT AS qty,
      COALESCE(SUM(COALESCE((m ->> 'price')::NUMERIC, 0) * pi.quantity * pi.line_discount_scale), 0) AS revenue
    FROM paid_items pi
    CROSS JOIN LATERAL jsonb_array_elements(pi.modifiers) AS m
    GROUP BY m ->> 'name'
  ),
  all_items AS (
    SELECT name, source, qty, revenue FROM main_agg
    UNION ALL
    SELECT name, source, qty, revenue FROM side_agg
    UNION ALL
    SELECT name, source, qty, revenue FROM mod_agg
  ),
  cat_agg AS (
    SELECT
      COALESCE(category_id, 0) AS category_id,
      COALESCE(category_name, 'Khác') AS category_name,
      COALESCE(SUM(quantity), 0)::INT AS qty,
      COALESCE(SUM(net_subtotal), 0) AS revenue
    FROM paid_items
    GROUP BY category_id, category_name
  )
  SELECT
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'source', source, 'qty', qty, 'revenue', revenue) ORDER BY revenue DESC, qty DESC, name), '[]'::JSONB)
     FROM (SELECT name, source, qty, revenue FROM all_items ORDER BY revenue DESC, qty DESC, name LIMIT 10) ti),
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('category_id', category_id, 'category_name', category_name, 'qty', qty, 'revenue', revenue) ORDER BY revenue DESC), '[]'::JSONB)
     FROM cat_agg),
    COALESCE((SELECT SUM(qty) FROM all_items), 0)::INT
  INTO v_top_items, v_categories, v_total_items;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('hour', hour, 'order_count', cnt, 'revenue', revenue)
    ORDER BY hour
  ), '[]'::JSONB)
  INTO v_hourly
  FROM (
    SELECT
      EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::INT AS hour,
      COUNT(*)::INT AS cnt,
      COALESCE(SUM(total_amount), 0) AS revenue
    FROM public.orders
    WHERE pos_session_id = p_session_id
      AND tenant_id = v_session.tenant_id
      AND payment_status = 'paid'
      AND status <> 'cancelled'
    GROUP BY 1
  ) h;

  SELECT
    CASE WHEN cnt > 0 THEN
      jsonb_build_object('hour', hour, 'order_count', cnt, 'revenue', revenue)
    ELSE NULL END
  INTO v_peak_hour
  FROM (
    SELECT
      EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::INT AS hour,
      COUNT(*)::INT AS cnt,
      COALESCE(SUM(total_amount), 0) AS revenue
    FROM public.orders
    WHERE pos_session_id = p_session_id
      AND tenant_id = v_session.tenant_id
      AND payment_status = 'paid'
      AND status <> 'cancelled'
    GROUP BY 1
    ORDER BY revenue DESC, cnt DESC
    LIMIT 1
  ) p;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('label', label, 'count', cnt) ORDER BY ord
  ), '[]'::JSONB)
  INTO v_aov_bins
  FROM (
    SELECT label, ord, COUNT(*)::INT AS cnt
    FROM (
      SELECT
        CASE
          WHEN total_amount <= 50000  THEN '≤50.000đ'
          WHEN total_amount <= 100000 THEN '50.000–100.000đ'
          WHEN total_amount <= 200000 THEN '100.000–200.000đ'
          WHEN total_amount <= 500000 THEN '200.000–500.000đ'
          ELSE '>500.000đ'
        END AS label,
        CASE
          WHEN total_amount <= 50000  THEN 1
          WHEN total_amount <= 100000 THEN 2
          WHEN total_amount <= 200000 THEN 3
          WHEN total_amount <= 500000 THEN 4
          ELSE 5
        END AS ord
      FROM public.orders
      WHERE pos_session_id = p_session_id
        AND tenant_id = v_session.tenant_id
        AND payment_status = 'paid'
        AND status <> 'cancelled'
    ) b
    GROUP BY label, ord
  ) g;

  SELECT COUNT(*)::INT, COALESCE(SUM(COALESCE(discount_amount, 0) + COALESCE(item_discount_amount, 0)), 0)
  INTO v_discount_count, v_discount_total
  FROM public.orders
  WHERE pos_session_id = p_session_id
    AND tenant_id = v_session.tenant_id
    AND (COALESCE(discount_amount, 0) + COALESCE(item_discount_amount, 0)) > 0
    AND status <> 'cancelled';

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'order_id', order_id, 'order_number', order_number,
      'amount', amount, 'note', note, 'type', type, 'value', value
    ) ORDER BY amount DESC
  ), '[]'::JSONB)
  INTO v_top_discount_orders
  FROM (
    SELECT
      id AS order_id, order_number,
      (COALESCE(discount_amount, 0) + COALESCE(item_discount_amount, 0)) AS amount,
      discount_note AS note,
      discount_type AS type, discount_value AS value
    FROM public.orders
    WHERE pos_session_id = p_session_id
      AND tenant_id = v_session.tenant_id
      AND (COALESCE(discount_amount, 0) + COALESCE(item_discount_amount, 0)) > 0
      AND status <> 'cancelled'
    ORDER BY (COALESCE(discount_amount, 0) + COALESCE(item_discount_amount, 0)) DESC
    LIMIT 10
  ) d;

  SELECT COUNT(*)::INT
  INTO v_void_item_count
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.pos_session_id = p_session_id
    AND o.tenant_id = v_session.tenant_id
    AND oi.status = 'cancelled';

  RETURN jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id, 'opened_at', v_session.opened_at,
      'closed_at', v_session.closed_at, 'status', v_session.status,
      'terminal_name', v_session.terminal_name,
      'opened_by_name', v_session.opened_by_name,
      'closed_by_name', v_session.closed_by_name,
      'opening_cash', v_session.opening_cash,
      'closing_cash', v_session.closing_cash,
      'expected_cash', v_session.expected_cash,
      'cash_difference', v_session.cash_difference,
      'note', v_session.note,
      'variance_approval_note', v_session.variance_approval_note
    ),
    'totals', jsonb_build_object(
      'gross_revenue', v_totals.gross,
      'discount_total', v_totals.discount_total,
      'tax_total', v_totals.tax_total,
      'service_charge_total', v_totals.service_total,
      'net_revenue', v_totals.net,
      'cash_revenue', v_totals.cash_revenue,
      'noncash_revenue', v_totals.noncash_revenue,
      'paid_order_count', v_totals.paid_count,
      'unpaid_order_count', v_totals.unpaid_count,
      'cancelled_order_count', v_totals.cancelled_count,
      'void_item_count', v_void_item_count,
      'total_items', v_total_items,
      'aov', CASE WHEN v_totals.paid_count > 0 THEN ROUND(v_totals.net / v_totals.paid_count, 2) ELSE 0 END
    ),
    'payment_mix', v_payment_mix,
    'top_items', v_top_items,
    'category_breakdown', v_categories,
    'aov_bins', v_aov_bins,
    'hourly', v_hourly,
    'peak_hour', v_peak_hour,
    'discounts', jsonb_build_object(
      'count', v_discount_count, 'total', v_discount_total,
      'top_orders', v_top_discount_orders
    ),
    'generated_at', now()
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.get_orders_for_day(p_branch_id bigint, p_date date) RETURNS TABLE(order_id bigint, order_number text, branch_id bigint, branch_name text, paid_at timestamp with time zone, paid_hour integer, order_type text, customer_count integer, subtotal numeric, discount_amount numeric, tax_amount numeric, total_amount numeric, payment_method text, item_count bigint, invoice_status text, invoice_number text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid    UUID;
  v_tenant BIGINT;
BEGIN
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_id required for drill-down'
      USING ERRCODE = '22023';
  END IF;

  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
    FROM public.profiles pr WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'finance:view') THEN
    RAISE EXCEPTION 'permission denied: finance:view required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      o.id AS order_id,
      o.order_number,
      o.branch_id,
      b.name AS branch_name,
      p.paid_at,
      EXTRACT(HOUR FROM (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::INT
        AS paid_hour,
      o.order_type,
      o.customer_count,
      o.subtotal,
      (COALESCE(o.discount_amount, 0) + COALESCE(o.item_discount_amount, 0)) AS discount_amount,
      o.tax_amount,
      o.total_amount,
      o.payment_method,
      (SELECT COUNT(*) FROM public.order_items oi
        WHERE oi.order_id = o.id AND oi.status <> 'cancelled')::BIGINT
        AS item_count,
      ti.status         AS invoice_status,
      ti.invoice_number
    FROM public.orders o
    JOIN public.branches b
      ON b.id = o.branch_id
     AND b.tenant_id = o.tenant_id
    JOIN public.payments p
      ON p.order_id  = o.id
     AND p.tenant_id = o.tenant_id
     AND p.status    = 'completed'
     AND p.paid_at IS NOT NULL
    LEFT JOIN public.tax_invoices ti
      ON ti.order_id  = o.id
     AND ti.tenant_id = o.tenant_id
     AND ti.status NOT IN ('cancelled', 'replaced')
    WHERE o.tenant_id = v_tenant
      AND o.branch_id = p_branch_id
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = p_date
    ORDER BY p.paid_at;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_revenue_by_cashier(p_branch_id bigint DEFAULT NULL::bigint, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS TABLE(cashier_id uuid, cashier_name text, order_count bigint, net_revenue numeric, cash_revenue numeric, qr_revenue numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_uid UUID;
  v_tenant BIGINT;
  v_days INT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc TIMESTAMPTZ;
  v_has_tenant_scope BOOLEAN;
  v_branch_ids BIGINT[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
  FROM public.profiles pr
  WHERE pr.id = v_uid;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'start/end required' USING ERRCODE = '22023';
  END IF;
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'start > end' USING ERRCODE = '22023';
  END IF;

  v_days := (p_end_date - p_start_date) + 1;
  IF v_days > 90 THEN
    RAISE EXCEPTION 'range > 90 days' USING ERRCODE = '22023';
  END IF;

  SELECT fs.has_tenant_scope, fs.branch_ids
    INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') fs;

  IF p_branch_id IS NULL THEN
    IF NOT (v_has_tenant_scope OR cardinality(v_branch_ids) > 0) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_has_tenant_scope OR p_branch_id = ANY(v_branch_ids)) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
  WITH scoped_payments AS MATERIALIZED (
    SELECT
      p.id AS payment_id,
      p.method,
      p.amount,
      o.id AS order_id,
      o.subtotal,
      (COALESCE(o.discount_amount, 0) + COALESCE(o.item_discount_amount, 0)) AS discount_amount,
      COALESCE(ps.opened_by, p.created_by) AS cashier_id
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
     AND o.branch_id = p.branch_id
    LEFT JOIN public.pos_sessions ps
      ON ps.id = o.pos_session_id
     AND ps.tenant_id = o.tenant_id
     AND ps.branch_id = o.branch_id
    WHERE p.tenant_id = v_tenant
      AND p.status = 'completed'
      AND p.paid_at >= v_start_utc
      AND p.paid_at < v_end_utc
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (v_has_tenant_scope OR o.branch_id = ANY(v_branch_ids))
        )
      )
  ),
  order_rows AS (
    SELECT DISTINCT ON (sp.order_id)
      sp.cashier_id,
      sp.order_id,
      sp.subtotal,
      sp.discount_amount
    FROM scoped_payments sp
    ORDER BY sp.order_id, sp.payment_id DESC
  ),
  orders_by_cashier AS (
    SELECT
      o.cashier_id,
      COUNT(*)::BIGINT AS order_count,
      COALESCE(SUM(o.subtotal - o.discount_amount), 0)::NUMERIC AS net_revenue
    FROM order_rows o
    GROUP BY o.cashier_id
  ),
  payments_by_cashier AS (
    SELECT
      sp.cashier_id,
      COALESCE(SUM(sp.amount) FILTER (WHERE sp.method = 'cash'), 0)::NUMERIC AS cash_revenue,
      COALESCE(SUM(sp.amount) FILTER (WHERE sp.method IN ('vietqr', 'momo')), 0)::NUMERIC AS qr_revenue
    FROM scoped_payments sp
    GROUP BY sp.cashier_id
  )
  SELECT
    ob.cashier_id,
    COALESCE(pr.full_name, '— Không xác định')::TEXT AS cashier_name,
    ob.order_count,
    ob.net_revenue,
    COALESCE(pb.cash_revenue, 0)::NUMERIC AS cash_revenue,
    COALESCE(pb.qr_revenue, 0)::NUMERIC AS qr_revenue
  FROM orders_by_cashier ob
  LEFT JOIN payments_by_cashier pb ON pb.cashier_id = ob.cashier_id
  LEFT JOIN public.profiles pr ON pr.id = ob.cashier_id
  ORDER BY ob.net_revenue DESC;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_revenue_by_hour(p_branch_id bigint DEFAULT NULL::bigint, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS TABLE(dow smallint, hour smallint, order_count bigint, net_revenue numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID;
  v_tenant BIGINT;
  v_days INT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc TIMESTAMPTZ;
  v_has_tenant_scope BOOLEAN;
  v_branch_ids BIGINT[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
  FROM public.profiles pr
  WHERE pr.id = v_uid;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'start/end required' USING ERRCODE = '22023';
  END IF;
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'start > end' USING ERRCODE = '22023';
  END IF;

  v_days := (p_end_date - p_start_date) + 1;
  IF v_days > 90 THEN
    RAISE EXCEPTION 'range > 90 days' USING ERRCODE = '22023';
  END IF;

  SELECT fs.has_tenant_scope, fs.branch_ids
    INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') fs;

  IF p_branch_id IS NULL THEN
    IF NOT (v_has_tenant_scope OR cardinality(v_branch_ids) > 0) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_has_tenant_scope OR p_branch_id = ANY(v_branch_ids)) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
  WITH paid AS MATERIALIZED (
    SELECT
      (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS paid_local,
      o.id AS order_id,
      o.subtotal,
      (COALESCE(o.discount_amount, 0) + COALESCE(o.item_discount_amount, 0)) AS discount_amount
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
     AND o.branch_id = p.branch_id
    WHERE p.tenant_id = v_tenant
      AND p.status = 'completed'
      AND p.paid_at >= v_start_utc
      AND p.paid_at < v_end_utc
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (v_has_tenant_scope OR o.branch_id = ANY(v_branch_ids))
        )
      )
  )
  SELECT
    EXTRACT(DOW FROM paid.paid_local)::SMALLINT AS dow,
    EXTRACT(HOUR FROM paid.paid_local)::SMALLINT AS hour,
    COUNT(DISTINCT paid.order_id)::BIGINT AS order_count,
    COALESCE(SUM(paid.subtotal - paid.discount_amount), 0)::NUMERIC AS net_revenue
  FROM paid
  GROUP BY 1, 2
  ORDER BY 1, 2;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_revenue_kpis(p_branch_id bigint, p_start_date date, p_end_date date) RETURNS TABLE(net_revenue numeric, subtotal_revenue numeric, discount_amount numeric, total_tax numeric, vat_8_amount numeric, vat_10_amount numeric, order_count bigint, total_covers bigint, cash_revenue numeric, vietqr_revenue numeric, momo_revenue numeric, dine_in_revenue numeric, takeaway_revenue numeric, voided_amount numeric, voided_count bigint, refreshed_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_uid UUID;
  v_tenant BIGINT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc TIMESTAMPTZ;
  v_has_tenant_scope BOOLEAN;
  v_branch_ids BIGINT[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
  FROM public.profiles pr
  WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  SELECT fs.has_tenant_scope, fs.branch_ids
    INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') fs;

  IF p_branch_id IS NULL THEN
    IF NOT (v_has_tenant_scope OR cardinality(v_branch_ids) > 0) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_has_tenant_scope OR p_branch_id = ANY(v_branch_ids)) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
  WITH paid_orders AS MATERIALIZED (
    SELECT
      o.id,
      o.branch_id,
      o.tenant_id,
      o.total_amount,
      o.subtotal,
      (COALESCE(o.discount_amount, 0) + COALESCE(o.item_discount_amount, 0)) AS discount_amount,
      o.tax_amount,
      o.customer_count,
      o.order_type,
      p.method
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
     AND o.branch_id = p.branch_id
    WHERE p.tenant_id = v_tenant
      AND p.status = 'completed'
      AND p.paid_at >= v_start_utc
      AND p.paid_at < v_end_utc
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (v_has_tenant_scope OR o.branch_id = ANY(v_branch_ids))
        )
      )
  ),
  sales AS (
    SELECT
      COALESCE(SUM(total_amount), 0) AS net_revenue,
      COALESCE(SUM(subtotal), 0) AS subtotal_revenue,
      COALESCE(SUM(discount_amount), 0) AS discount_amount,
      COALESCE(SUM(tax_amount), 0) AS total_tax,
      COUNT(*)::BIGINT AS order_count,
      COALESCE(SUM(customer_count), 0)::BIGINT AS total_covers,
      COALESCE(SUM(total_amount) FILTER (WHERE method = 'cash'), 0) AS cash_revenue,
      COALESCE(SUM(total_amount) FILTER (WHERE method = 'vietqr'), 0) AS vietqr_revenue,
      COALESCE(SUM(total_amount) FILTER (WHERE method = 'momo'), 0) AS momo_revenue,
      COALESCE(SUM(total_amount) FILTER (WHERE order_type = 'dine_in'), 0) AS dine_in_revenue,
      COALESCE(SUM(total_amount) FILTER (WHERE order_type = 'takeaway'), 0) AS takeaway_revenue
    FROM paid_orders
  ),
  vat_split AS (
    SELECT
      COALESCE(SUM(
        CASE WHEN ROUND(oi.vat_rate::numeric, 2) = 8.00
          THEN (GREATEST(COALESCE(oi.subtotal, 0) - COALESCE(oi.discount_amount, 0), 0) * scaled.scale)
               - ((GREATEST(COALESCE(oi.subtotal, 0) - COALESCE(oi.discount_amount, 0), 0) * scaled.scale) / (1 + oi.vat_rate / 100))
          ELSE 0
        END
      ), 0) AS vat_8_amount,
      COALESCE(SUM(
        CASE WHEN ROUND(oi.vat_rate::numeric, 2) = 10.00
          THEN (GREATEST(COALESCE(oi.subtotal, 0) - COALESCE(oi.discount_amount, 0), 0) * scaled.scale)
               - ((GREATEST(COALESCE(oi.subtotal, 0) - COALESCE(oi.discount_amount, 0), 0) * scaled.scale) / (1 + oi.vat_rate / 100))
          ELSE 0
        END
      ), 0) AS vat_10_amount
    FROM (
      SELECT
        po.id AS order_id,
        po.tenant_id,
        CASE
          WHEN SUM(GREATEST(COALESCE(oi2.subtotal, 0) - COALESCE(oi2.discount_amount, 0), 0)) > 0
          THEN po.total_amount / SUM(GREATEST(COALESCE(oi2.subtotal, 0) - COALESCE(oi2.discount_amount, 0), 0))
          ELSE 1
        END AS scale
      FROM paid_orders po
      JOIN public.order_items oi2
        ON oi2.tenant_id = po.tenant_id
       AND oi2.order_id = po.id
       AND oi2.status <> 'cancelled'
      GROUP BY po.id, po.tenant_id, po.total_amount
    ) scaled
    JOIN public.order_items oi
      ON oi.tenant_id = scaled.tenant_id
     AND oi.order_id = scaled.order_id
     AND oi.status <> 'cancelled'
  ),
  refunds AS (
    SELECT
      COALESCE(SUM(p.amount), 0) AS voided_amount,
      COUNT(DISTINCT p.order_id)::BIGINT AS voided_count
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
     AND o.branch_id = p.branch_id
    WHERE p.tenant_id = v_tenant
      AND p.status = 'refunded'
      AND p.paid_at >= v_start_utc
      AND p.paid_at < v_end_utc
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (v_has_tenant_scope OR o.branch_id = ANY(v_branch_ids))
        )
      )
  )
  SELECT
    sales.net_revenue,
    sales.subtotal_revenue,
    sales.discount_amount,
    sales.total_tax,
    vat_split.vat_8_amount,
    vat_split.vat_10_amount,
    sales.order_count,
    sales.total_covers,
    sales.cash_revenue,
    sales.vietqr_revenue,
    sales.momo_revenue,
    sales.dine_in_revenue,
    sales.takeaway_revenue,
    refunds.voided_amount,
    refunds.voided_count,
    now() AS refreshed_at
  FROM sales
  CROSS JOIN vat_split
  CROSS JOIN refunds;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_revenue_rollup(p_branch_id bigint, p_start_date date, p_end_date date, p_granularity text) RETURNS TABLE(period_start date, period_end date, period_label text, branch_id bigint, order_count bigint, total_revenue numeric, total_tax numeric, subtotal_revenue numeric, discount_amount numeric, cash_revenue numeric, vietqr_revenue numeric, momo_revenue numeric, dine_in_revenue numeric, takeaway_revenue numeric, total_covers bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID;
  v_tenant BIGINT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc TIMESTAMPTZ;
  v_has_tenant_scope BOOLEAN;
  v_branch_ids BIGINT[];
BEGIN
  IF p_granularity NOT IN ('day', 'week', 'month') THEN
    RAISE EXCEPTION 'invalid_granularity (expected day/week/month)'
      USING ERRCODE = '22023';
  END IF;

  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
  FROM public.profiles pr
  WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  SELECT fs.has_tenant_scope, fs.branch_ids
    INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') fs;

  IF p_branch_id IS NULL THEN
    IF NOT (v_has_tenant_scope OR cardinality(v_branch_ids) > 0) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_has_tenant_scope OR p_branch_id = ANY(v_branch_ids)) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
  WITH live_daily AS (
    SELECT
      (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS paid_date,
      o.branch_id,
      COUNT(DISTINCT o.id)::BIGINT AS order_count,
      COALESCE(SUM(o.total_amount), 0) AS total_revenue,
      COALESCE(SUM(o.tax_amount), 0) AS total_tax,
      COALESCE(SUM(o.subtotal), 0) AS subtotal_revenue,
      COALESCE(SUM(COALESCE(o.discount_amount, 0) + COALESCE(o.item_discount_amount, 0)), 0) AS discount_amount,
      COALESCE(SUM(o.total_amount) FILTER (WHERE p.method = 'cash'), 0) AS cash_revenue,
      COALESCE(SUM(o.total_amount) FILTER (WHERE p.method = 'vietqr'), 0) AS vietqr_revenue,
      COALESCE(SUM(o.total_amount) FILTER (WHERE p.method = 'momo'), 0) AS momo_revenue,
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.order_type = 'dine_in'), 0) AS dine_in_revenue,
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.order_type = 'takeaway'), 0) AS takeaway_revenue,
      COALESCE(SUM(o.customer_count), 0)::BIGINT AS total_covers
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
     AND o.branch_id = p.branch_id
    WHERE p.tenant_id = v_tenant
      AND p.status = 'completed'
      AND p.paid_at >= v_start_utc
      AND p.paid_at < v_end_utc
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (v_has_tenant_scope OR o.branch_id = ANY(v_branch_ids))
        )
      )
    GROUP BY 1, o.branch_id
  ),
  bucketed AS (
    SELECT
      CASE p_granularity
        WHEN 'day' THEN d.paid_date
        WHEN 'week' THEN date_trunc('week', d.paid_date)::date
        WHEN 'month' THEN date_trunc('month', d.paid_date)::date
      END AS p_start,
      CASE p_granularity
        WHEN 'day' THEN d.paid_date
        WHEN 'week' THEN (date_trunc('week', d.paid_date) + INTERVAL '6 days')::date
        WHEN 'month' THEN (date_trunc('month', d.paid_date) + INTERVAL '1 month - 1 day')::date
      END AS p_end,
      d.*
    FROM live_daily d
  )
  SELECT
    b.p_start AS period_start,
    b.p_end AS period_end,
    CASE p_granularity
      WHEN 'day' THEN to_char(b.p_start, 'DD/MM/YYYY')
      WHEN 'week' THEN
        'Tuần ' || to_char(b.p_start, 'IW') || ' ('
          || to_char(b.p_start, 'DD/MM') || '-'
          || to_char(b.p_end, 'DD/MM/YYYY') || ')'
      WHEN 'month' THEN 'Tháng ' || to_char(b.p_start, 'MM/YYYY')
    END AS period_label,
    b.branch_id,
    COALESCE(SUM(b.order_count), 0)::BIGINT AS order_count,
    COALESCE(SUM(b.total_revenue), 0) AS total_revenue,
    COALESCE(SUM(b.total_tax), 0) AS total_tax,
    COALESCE(SUM(b.subtotal_revenue), 0) AS subtotal_revenue,
    COALESCE(SUM(b.discount_amount), 0) AS discount_amount,
    COALESCE(SUM(b.cash_revenue), 0) AS cash_revenue,
    COALESCE(SUM(b.vietqr_revenue), 0) AS vietqr_revenue,
    COALESCE(SUM(b.momo_revenue), 0) AS momo_revenue,
    COALESCE(SUM(b.dine_in_revenue), 0) AS dine_in_revenue,
    COALESCE(SUM(b.takeaway_revenue), 0) AS takeaway_revenue,
    COALESCE(SUM(b.total_covers), 0)::BIGINT AS total_covers
  FROM bucketed b
  GROUP BY b.p_start, b.p_end, b.branch_id
  ORDER BY b.p_start, b.branch_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.mark_kds_item_out_of_stock(p_ticket_id bigint, p_disable_for_day boolean DEFAULT true, p_reason text DEFAULT 'Hết món'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid             UUID := auth.uid();
  v_reason          TEXT := COALESCE(NULLIF(trim(p_reason), ''), 'Hết món');
  v_row             RECORD;
  v_subtotal        NUMERIC(15,2);
  v_discount_amount NUMERIC(15,2);
  v_limit           RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('kds:mark_ready') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  IF length(v_reason) < 2 THEN
    RAISE EXCEPTION 'reason too short' USING ERRCODE = '22023';
  END IF;

  SELECT
    kt.id AS ticket_id,
    kt.tenant_id,
    kt.branch_id,
    kt.status AS ticket_status,
    kt.order_id,
    kt.order_item_id,
    oi.menu_item_id,
    oi.item_name,
    oi.status AS item_status,
    o.order_number,
    o.status AS order_status,
    o.payment_status,
    o.service_charge,
    o.discount_type,
    o.discount_value
  INTO v_row
  FROM public.kds_tickets kt
  JOIN public.order_items oi
    ON oi.id = kt.order_item_id
   AND oi.tenant_id = kt.tenant_id
  JOIN public.orders o
    ON o.id = kt.order_id
   AND o.tenant_id = kt.tenant_id
  WHERE kt.id = p_ticket_id
    AND kt.tenant_id = public.auth_tenant_id()
    AND public.can_access_branch(kt.branch_id)
  FOR UPDATE OF kt, oi, o;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_row.order_id);

  IF v_row.order_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order_terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_row.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order_already_paid' USING ERRCODE = '22023';
  END IF;

  IF v_row.ticket_status NOT IN ('pending', 'preparing')
     OR v_row.item_status NOT IN ('pending', 'preparing') THEN
    RAISE EXCEPTION 'item_not_out_of_stockable' USING ERRCODE = '22023';
  END IF;

  UPDATE public.order_items
  SET status = 'cancelled',
      cancel_reason = 'kds_out_of_stock: ' || v_reason,
      updated_at = now()
  WHERE id = v_row.order_item_id
    AND tenant_id = v_row.tenant_id;

  UPDATE public.kds_tickets
  SET status = 'cancelled',
      bumped_at = now(),
      bumped_by = v_uid,
      updated_at = now()
  WHERE id = v_row.ticket_id
    AND tenant_id = v_row.tenant_id;

  SELECT rt.subtotal, rt.order_discount_amount
  INTO v_subtotal, v_discount_amount
  FROM private.recompute_order_totals(v_row.order_id) rt;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_row.tenant_id,
    v_row.order_id,
    v_row.order_status,
    v_row.order_status,
    v_uid,
    'kds_out_of_stock_item ' || v_row.order_item_id::TEXT || ': ' || v_reason
  );

  IF p_disable_for_day THEN
    INSERT INTO public.branch_menu_item_daily_limits (
      tenant_id,
      branch_id,
      menu_item_id,
      limit_date,
      limit_quantity,
      is_disabled,
      sold_today
    )
    VALUES (
      v_row.tenant_id,
      v_row.branch_id,
      v_row.menu_item_id,
      (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
      NULL,
      TRUE,
      0
    )
    ON CONFLICT (branch_id, menu_item_id, limit_date)
    DO UPDATE SET
      is_disabled = TRUE,
      updated_at = now()
    RETURNING limit_quantity, is_disabled, sold_today
    INTO v_limit;
  ELSE
    SELECT limit_quantity, is_disabled, sold_today
    INTO v_limit
    FROM public.branch_menu_item_daily_limits
    WHERE branch_id = v_row.branch_id
      AND menu_item_id = v_row.menu_item_id
      AND limit_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

    IF NOT FOUND THEN
      SELECT NULL::INT AS limit_quantity,
             FALSE AS is_disabled,
             0::INT AS sold_today
      INTO v_limit;
    END IF;
  END IF;

  INSERT INTO public.notifications (
    tenant_id,
    target_branch_id,
    target_roles,
    kind,
    severity,
    title,
    body,
    entity_type,
    entity_id,
    action_url,
    dedup_key,
    meta
  )
  VALUES (
    v_row.tenant_id,
    v_row.branch_id,
    ARRAY['cashier', 'waiter', 'branch_manager']::TEXT[],
    'pos.kds_out_of_stock',
    'warning',
    format('Bếp báo hết món #%s', v_row.order_number),
    format('%s cần đổi món hoặc bỏ khỏi đơn.', v_row.item_name),
    'order_item',
    v_row.order_item_id,
    format('/br/%s/pos?order=%s', v_row.branch_id, v_row.order_id),
    format('kds_out_of_stock:%s', v_row.ticket_id),
    jsonb_build_object(
      'order_id', v_row.order_id,
      'order_number', v_row.order_number,
      'order_item_id', v_row.order_item_id,
      'menu_item_id', v_row.menu_item_id,
      'item_name', v_row.item_name,
      'reason', v_reason,
      'disabled_for_day', p_disable_for_day
    )
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET
    severity = EXCLUDED.severity,
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    action_url = EXCLUDED.action_url,
    meta = EXCLUDED.meta,
    created_at = now(),
    expires_at = NULL;

  PERFORM public.check_order_ready(v_row.order_id);

  RETURN jsonb_build_object(
    'ticket_id', v_row.ticket_id,
    'order_id', v_row.order_id,
    'order_item_id', v_row.order_item_id,
    'menu_item_id', v_row.menu_item_id,
    'item_name', v_row.item_name,
    'disabled_for_day', p_disable_for_day,
    'limit_quantity', v_limit.limit_quantity,
    'is_disabled', COALESCE(v_limit.is_disabled, p_disable_for_day),
    'sold_today', COALESCE(v_limit.sold_today, 0)
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.merge_orders(p_source_order_id bigint, p_target_order_id bigint, p_idempotency_key uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid                  UUID;
  v_prof_tenant          BIGINT;
  v_prof_branch          BIGINT;
  v_prof_role            TEXT;
  v_source               RECORD;
  v_target               RECORD;
  v_lock_lo              BIGINT;
  v_lock_hi              BIGINT;
  v_flag_enabled         TEXT;
  v_moved_count          INT;
  v_target_subtotal      NUMERIC(15,2);
  v_target_discount_type   TEXT;
  v_target_discount_value  NUMERIC(15,2);
  v_target_discount_note   TEXT;
  v_target_discount_amount NUMERIC(15,2);
  v_target_total           NUMERIC(15,2);
  v_source_total           NUMERIC(15,2);
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN
     ('owner', 'super_manager', 'area_manager', 'branch_manager', 'cashier', 'waiter')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_source_order_id = p_target_order_id THEN
    RAISE EXCEPTION 'merge_self' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT t.id INTO v_lock_lo
    FROM public.orders t
    WHERE t.id = p_target_order_id
      AND t.merge_request_key = p_idempotency_key
    LIMIT 1;
    IF FOUND THEN
      SELECT subtotal, total_amount INTO v_target_subtotal, v_target_total
      FROM public.orders WHERE id = p_target_order_id;
      RETURN jsonb_build_object(
        'source_order_id',  p_source_order_id,
        'target_order_id',  p_target_order_id,
        'target_subtotal',  COALESCE(v_target_subtotal, 0),
        'target_total',     COALESCE(v_target_total, 0),
        'idempotent',       true
      );
    END IF;
  END IF;

  v_lock_lo := LEAST(p_source_order_id, p_target_order_id);
  v_lock_hi := GREATEST(p_source_order_id, p_target_order_id);
  PERFORM pg_advisory_xact_lock(v_lock_lo);
  PERFORM pg_advisory_xact_lock(v_lock_hi);

  IF v_lock_lo = p_source_order_id THEN
    SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
           o.payment_status, o.subtotal, o.service_charge,
           o.discount_type, o.discount_value, o.discount_amount, o.discount_note,
           o.merged_into_order_id, o.note, o.customer_count, o.order_number
    INTO v_source FROM public.orders o WHERE o.id = p_source_order_id FOR UPDATE;

    SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
           o.payment_status, o.subtotal, o.service_charge,
           o.discount_type, o.discount_value, o.discount_amount, o.discount_note,
           o.merged_into_order_id, o.note, o.customer_count, o.order_number
    INTO v_target FROM public.orders o WHERE o.id = p_target_order_id FOR UPDATE;
  ELSE
    SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
           o.payment_status, o.subtotal, o.service_charge,
           o.discount_type, o.discount_value, o.discount_amount, o.discount_note,
           o.merged_into_order_id, o.note, o.customer_count, o.order_number
    INTO v_target FROM public.orders o WHERE o.id = p_target_order_id FOR UPDATE;

    SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
           o.payment_status, o.subtotal, o.service_charge,
           o.discount_type, o.discount_value, o.discount_amount, o.discount_note,
           o.merged_into_order_id, o.note, o.customer_count, o.order_number
    INTO v_source FROM public.orders o WHERE o.id = p_source_order_id FOR UPDATE;
  END IF;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'source order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'target order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_source.tenant_id <> v_prof_tenant OR v_target.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_source.branch_id <> v_target.branch_id THEN
    RAISE EXCEPTION 'merge_different_branch' USING ERRCODE = '22023';
  END IF;

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_source.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_source.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_source.tenant_id AND key = 'pos_split_merge_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RAISE EXCEPTION 'split_merge_disabled' USING ERRCODE = 'P0001';
  END IF;

  IF v_source.order_type <> 'dine_in' OR v_target.order_type <> 'dine_in' THEN
    RAISE EXCEPTION 'merge_dine_in_only' USING ERRCODE = '22023';
  END IF;

  IF v_source.table_id IS NULL OR v_target.table_id IS NULL
     OR v_source.table_id <> v_target.table_id
  THEN
    RAISE EXCEPTION 'merge_different_tables' USING ERRCODE = '22023';
  END IF;

  IF v_source.status IN ('completed', 'cancelled')
     OR v_target.status IN ('completed', 'cancelled')
  THEN
    RAISE EXCEPTION 'merge_terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_source.payment_status, 'unpaid') = 'paid'
     OR COALESCE(v_target.payment_status, 'unpaid') = 'paid'
  THEN
    RAISE EXCEPTION 'merge_paid' USING ERRCODE = '22023';
  END IF;

  IF v_source.merged_into_order_id IS NOT NULL OR v_target.merged_into_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'merge_already_merged' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.payments
  WHERE order_id IN (p_source_order_id, p_target_order_id)
    AND status NOT IN ('failed', 'completed');
  IF FOUND THEN
    RAISE EXCEPTION 'merge_payment_pending' USING ERRCODE = '22023';
  END IF;

  IF (v_source.discount_type = 'pct' AND COALESCE(v_source.discount_amount, 0) > 0)
     OR (v_target.discount_type = 'pct' AND COALESCE(v_target.discount_amount, 0) > 0)
  THEN
    RAISE EXCEPTION 'merge_pct_discount_blocked' USING ERRCODE = '22023';
  END IF;

  IF v_source.discount_type = 'vnd' AND v_target.discount_type = 'vnd' THEN
    v_target_discount_type  := 'vnd';
    v_target_discount_value := COALESCE(v_source.discount_value, 0)
                             + COALESCE(v_target.discount_value, 0);
    v_target_discount_note  := COALESCE(v_target.discount_note, '')
      || ' + ' || COALESCE(v_source.discount_note, '');
  ELSIF v_source.discount_type = 'vnd' AND v_target.discount_type IS NULL THEN
    v_target_discount_type  := 'vnd';
    v_target_discount_value := v_source.discount_value;
    v_target_discount_note  := v_source.discount_note;
  ELSIF v_target.discount_type = 'vnd' AND v_source.discount_type IS NULL THEN
    v_target_discount_type  := 'vnd';
    v_target_discount_value := v_target.discount_value;
    v_target_discount_note  := v_target.discount_note;
  ELSE
    v_target_discount_type  := NULL;
    v_target_discount_value := NULL;
    v_target_discount_note  := NULL;
  END IF;

  UPDATE public.order_items
     SET order_id   = p_target_order_id,
         updated_at = now()
   WHERE order_id = p_source_order_id
     AND status <> 'cancelled';
  GET DIAGNOSTICS v_moved_count = ROW_COUNT;

  UPDATE public.kds_tickets
     SET order_id   = p_target_order_id,
         updated_at = now()
   WHERE order_id = p_source_order_id;

  UPDATE public.orders
     SET discount_type        = v_target_discount_type,
         discount_value       = v_target_discount_value,
         discount_note        = v_target_discount_note,
         customer_count       = GREATEST(v_target.customer_count, v_source.customer_count),
         note                 = CASE
                                  WHEN v_source.note IS NOT NULL AND length(trim(v_source.note)) > 0
                                  THEN COALESCE(v_target.note || E'\n', '')
                                       || '[Gộp từ ' || v_source.order_number || ']: ' || v_source.note
                                  ELSE v_target.note
                                END,
         merge_request_key    = p_idempotency_key,
         updated_at           = now()
   WHERE id = p_target_order_id;

  SELECT rt.subtotal, rt.order_discount_amount, rt.total_amount
  INTO v_target_subtotal, v_target_discount_amount, v_target_total
  FROM private.recompute_order_totals(p_target_order_id) rt;

  v_source_total := 0 + COALESCE(v_source.service_charge, 0);

  UPDATE public.orders
     SET status               = 'cancelled',
         subtotal             = 0,
         discount_type        = NULL,
         discount_value       = NULL,
         discount_note        = NULL,
         discount_amount      = 0,
         item_discount_amount = 0,
         total_amount         = v_source_total,
         merged_into_order_id = p_target_order_id,
         updated_at           = now()
   WHERE id = p_source_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES
    (v_source.tenant_id, p_source_order_id, v_source.status, 'cancelled', v_uid,
     'merged_into: ' || v_target.order_number || ' (#' || p_target_order_id::TEXT
       || '), moved ' || v_moved_count::TEXT || ' items'),
    (v_target.tenant_id, p_target_order_id, v_target.status, v_target.status, v_uid,
     'merged_from: ' || v_source.order_number || ' (#' || p_source_order_id::TEXT
       || '), received ' || v_moved_count::TEXT || ' items');

  RETURN jsonb_build_object(
    'source_order_id',  p_source_order_id,
    'target_order_id',  p_target_order_id,
    'moved_count',      v_moved_count,
    'target_subtotal',  v_target_subtotal,
    'target_total',     v_target_total
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.print_template_shift_summary_blocks(p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_out JSONB := '[]'::jsonb;
  v_paid NUMERIC := public.print_template_payload_number(p_payload, 'paid_order_count');
  v_unpaid NUMERIC := public.print_template_payload_number(p_payload, 'unpaid_order_count');
  v_cancelled NUMERIC := public.print_template_payload_number(p_payload, 'cancelled_order_count');
  v_revenue NUMERIC := public.print_template_payload_number(p_payload, 'total_revenue');
  v_discount NUMERIC := public.print_template_payload_number(p_payload, 'discount_total');
BEGIN
  v_out := v_out || jsonb_build_array(
    public.print_template_divider_block('='),
    public.print_template_text_block('TỔNG KẾT CA', 'center', true),
    public.print_template_divider_block('-'),
    public.print_template_row_block(
      'TỔNG ĐÃ THU',
      public.print_template_money(v_revenue),
      true,
      true
    ),
    public.print_template_row_block(
      'Đơn đã thu tiền',
      trim(to_char(v_paid, 'FM999999')) || ' đơn'
    )
  );

  IF v_discount > 0 THEN
    v_out := v_out || jsonb_build_array(
      public.print_template_row_block(
        'Chiết khấu',
        '-' || public.print_template_money(v_discount)
      )
    );
  END IF;

  IF v_unpaid > 0 THEN
    v_out := v_out || jsonb_build_array(
      public.print_template_row_block(
        'Đơn chưa thu/chuyển ca',
        trim(to_char(v_unpaid, 'FM999999')) || ' đơn'
      )
    );
  END IF;

  IF v_cancelled > 0 THEN
    v_out := v_out || jsonb_build_array(
      public.print_template_row_block(
        'Đơn đã hủy',
        trim(to_char(v_cancelled, 'FM999999')) || ' đơn'
      )
    );
  END IF;

  RETURN v_out;
END;
$$;


CREATE OR REPLACE FUNCTION public.reduce_order_item_quantity(p_order_item_id bigint, p_new_quantity integer, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid           UUID;
  v_prof_tenant   BIGINT;
  v_prof_branch   BIGINT;
  v_prof_role     TEXT;
  v_item          public.order_items%ROWTYPE;
  v_order         public.orders%ROWTYPE;
  v_old_qty       INT;
  v_qty_diff      INT;
  v_new_subtotal  NUMERIC(15,2);
  v_subtotal_sum  NUMERIC(15,2);
  v_disc_amount   NUMERIC(15,2);
  v_total_amount  NUMERIC(15,2);
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN ('branch_manager', 'cashier', 'waiter') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'reason too short' USING ERRCODE = '22023';
  END IF;

  IF p_new_quantity IS NULL OR p_new_quantity < 1 THEN
    RAISE EXCEPTION 'new quantity must be >= 1' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_item.order_id);

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_branch IS NULL OR v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:void_order') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_item.status IN ('served', 'cancelled') THEN
    RAISE EXCEPTION 'item not reducible' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  v_old_qty := v_item.quantity;

  IF p_new_quantity >= v_old_qty THEN
    RAISE EXCEPTION 'no reduction needed' USING ERRCODE = '22023';
  END IF;

  v_qty_diff := v_old_qty - p_new_quantity;
  v_new_subtotal := v_item.unit_price * p_new_quantity;

  UPDATE public.order_items
  SET quantity   = p_new_quantity,
      subtotal   = v_new_subtotal,
      updated_at = now()
  WHERE id = p_order_item_id;

  UPDATE public.kds_tickets
  SET updated_at = now()
  WHERE order_item_id = p_order_item_id
    AND tenant_id = v_item.tenant_id
    AND status NOT IN ('served', 'cancelled');

  IF v_item.menu_item_id IS NOT NULL THEN
    UPDATE public.branch_menu_item_daily_limits
    SET sold_today = GREATEST(sold_today - v_qty_diff, 0),
        updated_at = now()
    WHERE branch_id = v_order.branch_id
      AND menu_item_id = v_item.menu_item_id
      AND limit_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  END IF;

  PERFORM private.recompute_order_item_discount(p_order_item_id);

  SELECT rt.subtotal, rt.order_discount_amount, rt.total_amount
  INTO v_subtotal_sum, v_disc_amount, v_total_amount
  FROM private.recompute_order_totals(v_item.order_id) rt;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_item.tenant_id, v_item.order_id, v_order.status, v_order.status, v_uid,
    'reduce_item ' || p_order_item_id::text
      || ': ' || v_old_qty::text || '->' || p_new_quantity::text
      || ': ' || p_reason
  );

  RETURN jsonb_build_object(
    'order_id',           v_item.order_id,
    'order_item_id',      p_order_item_id,
    'old_quantity',       v_old_qty,
    'new_quantity',       p_new_quantity,
    'qty_reduced',        v_qty_diff,
    'subtotal',           v_subtotal_sum,
    'discount_amount',    v_disc_amount,
    'total_amount',       v_total_amount,
    'was_sent_to_kitchen', v_item.sent_to_kitchen_at IS NOT NULL
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.set_order_service_charge(p_order_id bigint, p_amount numeric, p_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid          UUID;
  v_prof_tenant  BIGINT;
  v_prof_branch  BIGINT;
  v_prof_role    TEXT;
  v_order        RECORD;
  v_note_trim    TEXT;
  v_amount       NUMERIC(15,2);
  v_total_amount NUMERIC(15,2);
  v_has_pending  BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN
     ('owner', 'super_manager', 'area_manager', 'branch_manager', 'cashier', 'waiter')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'service_charge_invalid_amount' USING ERRCODE = '22023';
  END IF;

  IF p_amount > 50000000 THEN
    RAISE EXCEPTION 'service_charge_amount_too_large' USING ERRCODE = '22023';
  END IF;

  v_note_trim := COALESCE(trim(p_note), '');
  IF length(v_note_trim) < 3 THEN
    RAISE EXCEPTION 'service_charge_note_required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT o.id, o.tenant_id, o.branch_id, o.status, o.payment_status,
         o.subtotal, o.tax_amount, o.service_charge, o.discount_amount
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_order.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.order_id = p_order_id
      AND p.tenant_id = v_order.tenant_id
      AND p.branch_id = v_order.branch_id
      AND p.status = 'pending'
  )
  INTO v_has_pending;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'pending' OR v_has_pending THEN
    RAISE EXCEPTION 'service_charge_payment_pending' USING ERRCODE = '22023';
  END IF;

  v_amount := ROUND(p_amount::NUMERIC, 2);
  UPDATE public.orders
     SET service_charge = v_amount,
         updated_at     = now()
   WHERE id = p_order_id;

  SELECT rt.total_amount
  INTO v_total_amount
  FROM private.recompute_order_totals(p_order_id) rt;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  ) VALUES (
    v_order.tenant_id,
    p_order_id,
    v_order.status,
    v_order.status,
    v_uid,
    CASE
      WHEN v_amount = 0 THEN 'service_charge_cleared'
      ELSE 'service_charge_set: ' || v_amount::TEXT || 'đ'
    END || ' :: ' || v_note_trim
  );

  RETURN jsonb_build_object(
    'order_id',       p_order_id,
    'service_charge', v_amount,
    'total_amount',   v_total_amount
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.split_order(p_source_order_id bigint, p_item_partials jsonb, p_idempotency_key uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid                  UUID;
  v_prof_tenant          BIGINT;
  v_prof_branch          BIGINT;
  v_prof_role            TEXT;
  v_source               RECORD;
  v_active_total_rows    INT;
  v_full_move_count      INT := 0;
  v_total_units_moved    INT := 0;
  v_remaining_rows       INT;
  v_new_order_id         BIGINT;
  v_new_order_number     TEXT;
  v_seq                  INT;
  v_date_part            TEXT;
  v_flag_enabled         TEXT;
  v_existing_id          BIGINT;
  v_existing_number      TEXT;
  v_source_subtotal      NUMERIC(15,2);
  v_source_discount      NUMERIC(15,2);
  v_source_total         NUMERIC(15,2);
  v_new_subtotal         NUMERIC(15,2);
  v_new_total            NUMERIC(15,2);
  v_partial              JSONB;
  v_partial_item_id      BIGINT;
  v_partial_qty          INT;
  v_src_row              public.order_items%ROWTYPE;
  v_new_item_id          BIGINT;
  v_branch_code          TEXT;
  v_new_item_discount_value    NUMERIC(15,2);
  v_source_item_discount_value NUMERIC(15,2);
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'office')
    INTO v_prof_tenant, v_prof_branch, v_prof_role
    FROM public.profiles p
    LEFT JOIN public.positions po ON po.id = p.position_id
   WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN
     ('owner', 'super_manager', 'area_manager', 'branch_manager', 'cashier', 'waiter')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_item_partials IS NULL
     OR jsonb_typeof(p_item_partials) <> 'array'
     OR jsonb_array_length(p_item_partials) = 0
  THEN
    RAISE EXCEPTION 'split_no_items' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT o.id, o.order_number INTO v_existing_id, v_existing_number
      FROM public.orders o
     WHERE o.split_from_order_id = p_source_order_id
       AND o.idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'source_order_id',  p_source_order_id,
        'new_order_id',     v_existing_id,
        'new_order_number', v_existing_number,
        'idempotent',       true
      );
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(p_source_order_id);

  SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
         o.payment_status, o.pos_session_id, o.service_charge,
         o.discount_type, o.discount_value
    INTO v_source
    FROM public.orders o
   WHERE o.id = p_source_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_source.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    SELECT b.code INTO v_branch_code
      FROM public.branches b
     WHERE b.id = v_source.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_source.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  ELSE
    SELECT b.code INTO v_branch_code
      FROM public.branches b
     WHERE b.id = v_source.branch_id AND b.tenant_id = v_prof_tenant;
  END IF;

  SELECT value INTO v_flag_enabled
    FROM public.system_settings
   WHERE tenant_id = v_source.tenant_id AND key = 'pos_split_merge_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RAISE EXCEPTION 'split_merge_disabled' USING ERRCODE = 'P0001';
  END IF;

  IF v_source.status NOT IN ('new', 'confirmed', 'preparing', 'ready', 'served') THEN
    RAISE EXCEPTION 'split_source_not_eligible' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_source.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'split_source_paid' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.payments
   WHERE order_id = p_source_order_id AND status NOT IN ('failed', 'completed');
  IF FOUND THEN
    RAISE EXCEPTION 'split_payment_pending' USING ERRCODE = '22023';
  END IF;

  FOR v_partial IN SELECT value FROM jsonb_array_elements(p_item_partials)
  LOOP
    v_partial_item_id := NULLIF(v_partial ->> 'item_id', '')::BIGINT;
    v_partial_qty := NULLIF(v_partial ->> 'quantity', '')::INT;

    IF v_partial_item_id IS NULL OR v_partial_qty IS NULL OR v_partial_qty < 1 THEN
      RAISE EXCEPTION 'split_items_invalid' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_src_row
      FROM public.order_items
     WHERE id = v_partial_item_id
       AND order_id = p_source_order_id
       AND status <> 'cancelled'
       FOR UPDATE;

    IF NOT FOUND OR v_partial_qty > v_src_row.quantity THEN
      RAISE EXCEPTION 'split_items_invalid' USING ERRCODE = '22023';
    END IF;

    IF v_partial_qty = v_src_row.quantity THEN
      v_full_move_count := v_full_move_count + 1;
    END IF;

    v_total_units_moved := v_total_units_moved + v_partial_qty;
  END LOOP;

  SELECT COUNT(*) INTO v_active_total_rows
    FROM public.order_items
   WHERE order_id = p_source_order_id AND status <> 'cancelled';

  v_remaining_rows := v_active_total_rows - v_full_move_count;
  IF v_remaining_rows < 1 THEN
    RAISE EXCEPTION 'split_would_empty_source' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.order_daily_counters (
    tenant_id, branch_id, counter_date, last_seq
  )
  VALUES (
    v_source.tenant_id,
    v_source.branch_id,
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
    1
  )
  ON CONFLICT (tenant_id, branch_id, counter_date)
  DO UPDATE SET
    last_seq   = public.order_daily_counters.last_seq + 1,
    updated_at = now()
  RETURNING last_seq INTO v_seq;

  v_date_part := to_char(
    CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD'
  );

  IF v_source.order_type = 'dine_in' THEN
    v_new_order_number := 'TC-' || v_date_part || '-' || lpad(v_seq::TEXT, 3, '0');
  ELSE
    v_new_order_number := 'MV-' || v_date_part || '-' || lpad(v_seq::TEXT, 3, '0');
  END IF;

  IF v_branch_code IS NOT NULL THEN
    v_new_order_number := v_new_order_number || '-' || v_branch_code;
  END IF;

  INSERT INTO public.orders (
    tenant_id, branch_id, table_id, order_number, order_type,
    status, subtotal, total_amount, customer_count, note, created_by,
    pos_session_id, idempotency_key, split_from_order_id
  )
  VALUES (
    v_source.tenant_id, v_source.branch_id, v_source.table_id,
    v_new_order_number, v_source.order_type,
    v_source.status,
    0, 0, 1, NULL, v_uid,
    v_source.pos_session_id, p_idempotency_key, p_source_order_id
  )
  RETURNING id INTO v_new_order_id;

  FOR v_partial IN SELECT value FROM jsonb_array_elements(p_item_partials)
  LOOP
    v_partial_item_id := (v_partial ->> 'item_id')::BIGINT;
    v_partial_qty := (v_partial ->> 'quantity')::INT;

    SELECT * INTO v_src_row
      FROM public.order_items
     WHERE id = v_partial_item_id;

    IF v_partial_qty = v_src_row.quantity THEN
      UPDATE public.order_items
         SET order_id   = v_new_order_id,
             updated_at = now()
       WHERE id = v_partial_item_id
         AND order_id = p_source_order_id;

      UPDATE public.kds_tickets
         SET order_id   = v_new_order_id,
             updated_at = now()
       WHERE order_item_id = v_partial_item_id
         AND order_id = p_source_order_id;
    ELSE
      PERFORM set_config('comtammatu.skip_quota_enforcement', 'true', true);
      INSERT INTO public.order_items (
        tenant_id, order_id, menu_item_id, variant_id,
        item_name, variant_name, quantity, unit_price,
        modifiers, sides, subtotal, note, status,
        sent_to_kitchen_at
      )
      VALUES (
        v_src_row.tenant_id, v_new_order_id,
        v_src_row.menu_item_id, v_src_row.variant_id,
        v_src_row.item_name, v_src_row.variant_name,
        v_partial_qty, v_src_row.unit_price,
        v_src_row.modifiers, v_src_row.sides,
        v_src_row.unit_price * v_partial_qty,
        v_src_row.note, v_src_row.status,
        v_src_row.sent_to_kitchen_at
      )
      RETURNING id INTO v_new_item_id;
      PERFORM set_config('comtammatu.skip_quota_enforcement', 'false', true);

      UPDATE public.order_items
         SET quantity   = v_src_row.quantity - v_partial_qty,
             subtotal   = v_src_row.unit_price * (v_src_row.quantity - v_partial_qty),
             updated_at = now()
       WHERE id = v_partial_item_id;

      IF v_src_row.discount_type = 'pct' AND COALESCE(v_src_row.discount_amount, 0) > 0 THEN
        UPDATE public.order_items
           SET discount_type   = CASE WHEN public.compute_discount_amount('pct', v_src_row.discount_value, v_src_row.unit_price * v_partial_qty) > 0 THEN 'pct' ELSE NULL END,
               discount_value  = CASE WHEN public.compute_discount_amount('pct', v_src_row.discount_value, v_src_row.unit_price * v_partial_qty) > 0 THEN v_src_row.discount_value ELSE NULL END,
               discount_note   = CASE WHEN public.compute_discount_amount('pct', v_src_row.discount_value, v_src_row.unit_price * v_partial_qty) > 0 THEN v_src_row.discount_note ELSE NULL END,
               discount_amount = public.compute_discount_amount('pct', v_src_row.discount_value, v_src_row.unit_price * v_partial_qty),
               updated_at      = now()
         WHERE id = v_new_item_id;

        UPDATE public.order_items
           SET discount_type   = CASE WHEN public.compute_discount_amount('pct', v_src_row.discount_value, v_src_row.unit_price * (v_src_row.quantity - v_partial_qty)) > 0 THEN 'pct' ELSE NULL END,
               discount_value  = CASE WHEN public.compute_discount_amount('pct', v_src_row.discount_value, v_src_row.unit_price * (v_src_row.quantity - v_partial_qty)) > 0 THEN v_src_row.discount_value ELSE NULL END,
               discount_note   = CASE WHEN public.compute_discount_amount('pct', v_src_row.discount_value, v_src_row.unit_price * (v_src_row.quantity - v_partial_qty)) > 0 THEN v_src_row.discount_note ELSE NULL END,
               discount_amount = public.compute_discount_amount('pct', v_src_row.discount_value, v_src_row.unit_price * (v_src_row.quantity - v_partial_qty)),
               updated_at      = now()
         WHERE id = v_partial_item_id;

        PERFORM private.recompute_order_item_discount(v_new_item_id);
        PERFORM private.recompute_order_item_discount(v_partial_item_id);
      ELSIF v_src_row.discount_type = 'vnd' AND COALESCE(v_src_row.discount_amount, 0) > 0 THEN
        v_new_item_discount_value := LEAST(
          ROUND(COALESCE(v_src_row.discount_value, 0) * v_partial_qty / NULLIF(v_src_row.quantity, 0), 2),
          v_src_row.unit_price * v_partial_qty
        );
        v_source_item_discount_value := LEAST(
          GREATEST(COALESCE(v_src_row.discount_value, 0) - COALESCE(v_new_item_discount_value, 0), 0),
          v_src_row.unit_price * (v_src_row.quantity - v_partial_qty)
        );

        UPDATE public.order_items
           SET discount_type   = CASE WHEN COALESCE(v_new_item_discount_value, 0) > 0 THEN 'vnd' ELSE NULL END,
               discount_value  = CASE WHEN COALESCE(v_new_item_discount_value, 0) > 0 THEN v_new_item_discount_value ELSE NULL END,
               discount_note   = CASE WHEN COALESCE(v_new_item_discount_value, 0) > 0 THEN v_src_row.discount_note ELSE NULL END,
               discount_amount = public.compute_discount_amount('vnd', v_new_item_discount_value, v_src_row.unit_price * v_partial_qty),
               updated_at      = now()
         WHERE id = v_new_item_id;

        UPDATE public.order_items
           SET discount_type   = CASE WHEN COALESCE(v_source_item_discount_value, 0) > 0 THEN 'vnd' ELSE NULL END,
               discount_value  = CASE WHEN COALESCE(v_source_item_discount_value, 0) > 0 THEN v_source_item_discount_value ELSE NULL END,
               discount_note   = CASE WHEN COALESCE(v_source_item_discount_value, 0) > 0 THEN v_src_row.discount_note ELSE NULL END,
               discount_amount = public.compute_discount_amount('vnd', v_source_item_discount_value, v_src_row.unit_price * (v_src_row.quantity - v_partial_qty)),
               updated_at      = now()
         WHERE id = v_partial_item_id;

        PERFORM private.recompute_order_item_discount(v_new_item_id);
        PERFORM private.recompute_order_item_discount(v_partial_item_id);
      END IF;

      INSERT INTO public.kds_tickets (
        tenant_id, branch_id, station_id, order_id, order_item_id,
        status, bumped_at, bumped_by, created_at
      )
      SELECT
        kt.tenant_id, kt.branch_id, kt.station_id,
        v_new_order_id, v_new_item_id,
        kt.status, kt.bumped_at, kt.bumped_by, kt.created_at
      FROM public.kds_tickets kt
      WHERE kt.order_item_id = v_partial_item_id
        AND kt.order_id = p_source_order_id;
    END IF;
  END LOOP;

  SELECT rt.subtotal, rt.order_discount_amount, rt.total_amount
  INTO v_source_subtotal, v_source_discount, v_source_total
  FROM private.recompute_order_totals(p_source_order_id) rt;

  SELECT rt.subtotal, rt.total_amount
  INTO v_new_subtotal, v_new_total
  FROM private.recompute_order_totals(v_new_order_id) rt;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES
    (v_source.tenant_id, p_source_order_id, v_source.status, v_source.status, v_uid,
     'split_to: ' || v_new_order_number
       || ' (moved ' || v_total_units_moved::TEXT || ' units across '
       || jsonb_array_length(p_item_partials)::TEXT || ' lines)'),
    (v_source.tenant_id, v_new_order_id, NULL, v_source.status, v_uid,
     'split_from: order#' || p_source_order_id::TEXT);

  RETURN jsonb_build_object(
    'source_order_id',  p_source_order_id,
    'new_order_id',     v_new_order_id,
    'new_order_number', v_new_order_number,
    'moved_count',      v_total_units_moved,
    'source_subtotal',  v_source_subtotal,
    'source_total',     v_source_total,
    'new_subtotal',     v_new_subtotal,
    'new_total',        v_new_total
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.void_order_item(p_order_item_id bigint, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid             UUID;
  v_prof_tenant     BIGINT;
  v_prof_branch     BIGINT;
  v_prof_role       TEXT;
  v_item            RECORD;
  v_order           RECORD;
  v_subtotal        NUMERIC(15,2);
  v_discount_amount NUMERIC(15,2);
  v_all_cancelled   BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN ('branch_manager', 'cashier', 'waiter') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_item.order_id);

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_branch IS NULL OR v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:void_order') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_item.status IN ('served', 'cancelled') THEN
    RAISE EXCEPTION 'item not voidable' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  UPDATE public.order_items
  SET status = 'cancelled',
      cancel_reason = p_reason,
      updated_at = now()
  WHERE id = p_order_item_id;

  UPDATE public.kds_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE order_item_id = p_order_item_id AND tenant_id = v_item.tenant_id;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.order_items WHERE order_id = v_item.order_id AND status <> 'cancelled'
  ) INTO v_all_cancelled;

  IF v_all_cancelled THEN
    UPDATE public.orders
    SET
      status          = 'cancelled',
      subtotal        = 0,
      discount_type   = NULL,
      discount_value  = NULL,
      discount_note   = NULL,
      discount_amount = 0,
      item_discount_amount = 0,
      total_amount    = 0 + COALESCE(service_charge, 0),
      updated_at      = now()
    WHERE id = v_item.order_id;

    INSERT INTO public.order_status_history (
      tenant_id, order_id, from_status, to_status, changed_by, note
    )
    VALUES (
      v_item.tenant_id, v_item.order_id, v_order.status, 'cancelled', v_uid,
      'auto_cancel_all_items_voided: ' || p_reason
    );
  ELSE
    SELECT rt.subtotal, rt.order_discount_amount
    INTO v_subtotal, v_discount_amount
    FROM private.recompute_order_totals(v_item.order_id) rt;

    INSERT INTO public.order_status_history (
      tenant_id, order_id, from_status, to_status, changed_by, note
    )
    VALUES (
      v_item.tenant_id, v_item.order_id, v_order.status, v_order.status, v_uid,
      'void_item ' || p_order_item_id::text || ': ' || p_reason
    );
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_item.order_id,
    'auto_cancelled_order', v_all_cancelled,
    'was_sent_to_kitchen', v_item.sent_to_kitchen_at IS NOT NULL
  );
END;
$$;


COMMENT ON FUNCTION public._compute_vat_breakdown(p_order_ids bigint[]) IS 'Per-line VAT aggregation across input orders. Scale starts from item net after order_items.discount_amount; order-level discount and service scaling are absorbed by total_amount over items_sum.';
COMMENT ON FUNCTION public.apply_order_discount(p_order_id bigint, p_type text, p_value numeric, p_note text) IS 'Set order-level discount with required note. Order-level discount applies to remaining subtotal after item discounts and blocks paid, terminal, or pending-payment orders.';
COMMENT ON FUNCTION public.apply_order_item_discount(p_order_item_id bigint, p_type text, p_value numeric, p_note text) IS 'Set one POS order_items line discount with required note. Recomputes orders.item_discount_amount, order-level discount, and total_amount atomically.';
COMMENT ON FUNCTION public.clear_order_item_discount(p_order_item_id bigint, p_note text) IS 'Clear one POS order_items line discount with required audit note. Recomputes orders.item_discount_amount, order-level discount, and total_amount atomically.';
COMMENT ON FUNCTION private.recompute_order_item_discount(p_order_item_id bigint) IS 'Internal POS line-discount recompute from order_items discount metadata and current subtotal.';
COMMENT ON FUNCTION private.recompute_order_totals(p_order_id bigint) IS 'Internal POS money recompute. subtotal=sum active items, item_discount_amount=sum active item discounts, order discount applies to remaining subtotal.';
COMMENT ON FUNCTION public.compute_discount_amount(p_type text, p_value numeric, p_subtotal numeric) IS 'Single source of truth for discount math. pct uses FLOOR(subtotal*pct/100), vnd is clamped to subtotal, null or zero inputs return 0.';
COMMENT ON FUNCTION public.merge_orders(p_source_order_id bigint, p_target_order_id bigint, p_idempotency_key uuid) IS 'Merge source into target while preserving item discounts. Order VND discounts are combined then recomputed after item discounts.';
COMMENT ON FUNCTION public.reduce_order_item_quantity(p_order_item_id bigint, p_new_quantity integer, p_reason text) IS 'Reduce sent item quantity and recompute item/order discount totals through private helpers.';


DROP MATERIALIZED VIEW IF EXISTS public.mv_top_items;
DROP MATERIALIZED VIEW IF EXISTS public.mv_daily_revenue;

CREATE MATERIALIZED VIEW public.mv_daily_revenue AS
 SELECT ((p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::date AS date,
    o.branch_id,
    o.tenant_id,
    count(*) AS order_count,
    COALESCE(sum(o.total_amount), (0)::numeric) AS total_revenue,
    COALESCE(sum(o.tax_amount), (0)::numeric) AS total_tax,
    COALESCE(sum(o.subtotal), (0)::numeric) AS subtotal_revenue,
    COALESCE(sum(COALESCE(o.discount_amount, (0)::numeric) + COALESCE(o.item_discount_amount, (0)::numeric)), (0)::numeric) AS discount_amount,
    COALESCE(sum(o.total_amount) FILTER (WHERE (o.payment_method = 'cash'::text)), (0)::numeric) AS cash_revenue,
    COALESCE(sum(o.total_amount) FILTER (WHERE (o.payment_method = 'vietqr'::text)), (0)::numeric) AS vietqr_revenue,
    COALESCE(sum(o.total_amount) FILTER (WHERE (o.payment_method = 'momo'::text)), (0)::numeric) AS momo_revenue,
    COALESCE(sum(o.total_amount) FILTER (WHERE (o.order_type = 'dine_in'::text)), (0)::numeric) AS dine_in_revenue,
    COALESCE(sum(o.total_amount) FILTER (WHERE (o.order_type = 'takeaway'::text)), (0)::numeric) AS takeaway_revenue,
    COALESCE(sum(o.customer_count), (0)::bigint) AS total_covers
   FROM (public.orders o
     JOIN public.payments p ON (((p.order_id = o.id) AND (p.tenant_id = o.tenant_id) AND (p.status = 'completed'::text) AND (p.paid_at IS NOT NULL))))
  WHERE ((o.status <> 'cancelled'::text) AND (o.payment_status = 'paid'::text))
  GROUP BY (((p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::date), o.branch_id, o.tenant_id
  WITH NO DATA;

CREATE MATERIALIZED VIEW public.mv_top_items AS
 SELECT (date_trunc('week'::text, o.created_at))::date AS period_start,
    ((date_trunc('week'::text, o.created_at) + '6 days'::interval))::date AS period_end,
    o.branch_id,
    o.tenant_id,
    oi.menu_item_id,
    max(oi.item_name) AS item_name,
    sum(oi.quantity) AS quantity_sold,
    sum(GREATEST(COALESCE(oi.subtotal, (0)::numeric) - COALESCE(oi.discount_amount, (0)::numeric), (0)::numeric)) AS revenue
   FROM (public.order_items oi
     JOIN public.orders o ON ((oi.order_id = o.id)))
  WHERE ((o.status <> 'cancelled'::text) AND (oi.status <> 'cancelled'::text))
  GROUP BY ((date_trunc('week'::text, o.created_at))::date), (((date_trunc('week'::text, o.created_at) + '6 days'::interval))::date), o.branch_id, o.tenant_id, oi.menu_item_id
  WITH NO DATA;

CREATE INDEX IF NOT EXISTS idx_mv_daily_revenue_branch_date ON public.mv_daily_revenue USING btree (branch_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_revenue_pk ON public.mv_daily_revenue USING btree (date, branch_id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_top_items_pk ON public.mv_top_items USING btree (period_start, branch_id, tenant_id, menu_item_id);

COMMIT;
