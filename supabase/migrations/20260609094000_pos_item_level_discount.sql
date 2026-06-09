-- POS item-level discounts.
--
-- Contract:
-- - orders.discount_amount remains the TOTAL discount used by payment,
--   reports, receipts, shift-close, and HĐĐT.
-- - orders.order_discount_amount is the existing whole-order discount source.
-- - orders.item_discount_amount is the sum of active order_items discounts.
-- - order_items subtotal stays gross/list-price; item discount is separate.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS item_discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0;

UPDATE public.orders
SET order_discount_amount = COALESCE(discount_amount, 0),
    item_discount_amount = 0
WHERE COALESCE(order_discount_amount, 0) = 0
  AND COALESCE(item_discount_amount, 0) = 0
  AND COALESCE(discount_amount, 0) > 0;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS discount_type TEXT,
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_note TEXT;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_discount_metadata_paired;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_discount_metadata_paired;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_discount_amount_source_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_discount_sources_nonnegative_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_discount_sources_nonnegative_check
    CHECK (
      discount_amount >= 0
      AND order_discount_amount >= 0
      AND item_discount_amount >= 0
    ),
  ADD CONSTRAINT orders_discount_amount_source_check
    CHECK (discount_amount = order_discount_amount + item_discount_amount),
  ADD CONSTRAINT orders_order_discount_metadata_paired
    CHECK (
      (
        order_discount_amount = 0
        AND discount_type IS NULL
        AND discount_value IS NULL
        AND discount_note IS NULL
      )
      OR
      (
        order_discount_amount > 0
        AND discount_type IS NOT NULL
        AND discount_value IS NOT NULL
        AND discount_note IS NOT NULL
        AND length(trim(discount_note)) >= 3
      )
    );

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_discount_metadata_paired;
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_discount_type_check;
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_discount_value_check;
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_discount_amount_check;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_discount_type_check
    CHECK (discount_type IS NULL OR discount_type IN ('pct', 'vnd')),
  ADD CONSTRAINT order_items_discount_value_check
    CHECK (discount_value IS NULL OR discount_value >= 0),
  ADD CONSTRAINT order_items_discount_amount_check
    CHECK (discount_amount >= 0 AND discount_amount <= subtotal),
  ADD CONSTRAINT order_items_discount_metadata_paired
    CHECK (
      (
        discount_amount = 0
        AND discount_type IS NULL
        AND discount_value IS NULL
        AND discount_note IS NULL
      )
      OR
      (
        discount_amount > 0
        AND discount_type IS NOT NULL
        AND discount_value IS NOT NULL
        AND discount_note IS NOT NULL
        AND length(trim(discount_note)) >= 3
      )
    );

COMMENT ON COLUMN public.orders.order_discount_amount IS
  'Whole-order discount amount derived from orders.discount_type/value. Part of orders.discount_amount.';
COMMENT ON COLUMN public.orders.item_discount_amount IS
  'Sum of active order_items.discount_amount. Part of orders.discount_amount.';
COMMENT ON COLUMN public.order_items.discount_type IS
  'Item-level discount type: pct or vnd. Null when no item discount.';
COMMENT ON COLUMN public.order_items.discount_value IS
  'Item-level discount input value. pct is percent; vnd is clamped to item subtotal.';
COMMENT ON COLUMN public.order_items.discount_amount IS
  'Item-level discount amount in VND, kept separate from gross subtotal.';
COMMENT ON COLUMN public.order_items.discount_note IS
  'Item-level discount reason, required when discount_amount > 0.';

CREATE OR REPLACE FUNCTION public.pos_normalize_order_item_discount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_discount NUMERIC(15,2);
BEGIN
  IF NEW.discount_type IS NULL OR NEW.discount_value IS NULL THEN
    NEW.discount_type := NULL;
    NEW.discount_value := NULL;
    NEW.discount_note := NULL;
    NEW.discount_amount := 0;
    RETURN NEW;
  END IF;

  IF NEW.discount_type NOT IN ('pct', 'vnd') THEN
    RETURN NEW;
  END IF;

  IF NEW.discount_type = 'pct' THEN
    NEW.discount_value := LEAST(GREATEST(COALESCE(NEW.discount_value, 0), 0), 100);
  ELSE
    NEW.discount_value := LEAST(GREATEST(COALESCE(NEW.discount_value, 0), 0), COALESCE(NEW.subtotal, 0));
  END IF;

  v_discount := public.compute_discount_amount(
    NEW.discount_type,
    NEW.discount_value,
    COALESCE(NEW.subtotal, 0)
  );

  IF v_discount <= 0 THEN
    NEW.discount_type := NULL;
    NEW.discount_value := NULL;
    NEW.discount_note := NULL;
    NEW.discount_amount := 0;
  ELSE
    NEW.discount_amount := v_discount;
    NEW.discount_note := NULLIF(trim(COALESCE(NEW.discount_note, '')), '');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_normalize_order_discount_totals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_item_discount NUMERIC(15,2) := 0;
  v_order_discount NUMERIC(15,2) := 0;
  v_discount_base NUMERIC(15,2) := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_item_discount := COALESCE(NEW.item_discount_amount, 0);
  ELSE
    SELECT COALESCE(SUM(LEAST(COALESCE(oi.discount_amount, 0), COALESCE(oi.subtotal, 0))), 0)
    INTO v_item_discount
    FROM public.order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.tenant_id = NEW.tenant_id
      AND oi.status <> 'cancelled';
  END IF;

  IF NEW.status = 'cancelled' THEN
    NEW.item_discount_amount := 0;
    NEW.order_discount_amount := 0;
    NEW.discount_amount := 0;
    NEW.discount_type := NULL;
    NEW.discount_value := NULL;
    NEW.discount_note := NULL;
    NEW.total_amount := GREATEST(0, COALESCE(NEW.service_charge, 0));
    RETURN NEW;
  END IF;

  v_item_discount := LEAST(GREATEST(v_item_discount, 0), COALESCE(NEW.subtotal, 0));
  v_discount_base := GREATEST(COALESCE(NEW.subtotal, 0) - v_item_discount, 0);

  IF NEW.discount_type IS NOT NULL AND NEW.discount_value IS NOT NULL THEN
    IF NEW.discount_type = 'pct' THEN
      NEW.discount_value := LEAST(GREATEST(COALESCE(NEW.discount_value, 0), 0), 100);
    ELSIF NEW.discount_type = 'vnd' THEN
      NEW.discount_value := LEAST(GREATEST(COALESCE(NEW.discount_value, 0), 0), v_discount_base);
    END IF;

    v_order_discount := public.compute_discount_amount(
      NEW.discount_type,
      NEW.discount_value,
      v_discount_base
    );
  END IF;

  IF v_order_discount <= 0 THEN
    NEW.order_discount_amount := 0;
    NEW.discount_type := NULL;
    NEW.discount_value := NULL;
    NEW.discount_note := NULL;
  ELSE
    NEW.order_discount_amount := v_order_discount;
    NEW.discount_note := NULLIF(trim(COALESCE(NEW.discount_note, '')), '');
  END IF;

  NEW.item_discount_amount := v_item_discount;
  NEW.discount_amount := COALESCE(NEW.order_discount_amount, 0) + v_item_discount;
  NEW.total_amount := GREATEST(
    0,
    COALESCE(NEW.subtotal, 0)
      + COALESCE(NEW.service_charge, 0)
      - COALESCE(NEW.discount_amount, 0)
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_touch_order_discount_totals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_order_id BIGINT;
  v_tenant_id BIGINT;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  v_tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id);

  IF v_order_id IS NOT NULL THEN
    UPDATE public.orders
       SET updated_at = now()
     WHERE id = v_order_id
       AND tenant_id = v_tenant_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_normalize_discount ON public.order_items;
CREATE TRIGGER trg_order_items_normalize_discount
BEFORE INSERT OR UPDATE OF subtotal, discount_type, discount_value, discount_note
ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.pos_normalize_order_item_discount();

DROP TRIGGER IF EXISTS trg_orders_normalize_discount_totals ON public.orders;
CREATE TRIGGER trg_orders_normalize_discount_totals
BEFORE INSERT OR UPDATE OF subtotal, service_charge, discount_type, discount_value, discount_note, order_discount_amount, item_discount_amount, discount_amount, status, updated_at
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.pos_normalize_order_discount_totals();

DROP TRIGGER IF EXISTS trg_order_items_touch_order_discount_insert ON public.order_items;
CREATE TRIGGER trg_order_items_touch_order_discount_insert
AFTER INSERT ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.pos_touch_order_discount_totals();

DROP TRIGGER IF EXISTS trg_order_items_touch_order_discount_update ON public.order_items;
CREATE TRIGGER trg_order_items_touch_order_discount_update
AFTER UPDATE OF subtotal, status, discount_type, discount_value, discount_amount, discount_note
ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.pos_touch_order_discount_totals();

DROP TRIGGER IF EXISTS trg_order_items_touch_order_discount_delete ON public.order_items;
CREATE TRIGGER trg_order_items_touch_order_discount_delete
AFTER DELETE ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.pos_touch_order_discount_totals();

CREATE OR REPLACE FUNCTION public.apply_order_item_discount(
  p_order_item_id bigint,
  p_type text,
  p_value numeric,
  p_note text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID;
  v_prof_tenant BIGINT;
  v_prof_branch BIGINT;
  v_prof_role TEXT;
  v_row RECORD;
  v_note_trim TEXT;
  v_clamped_value NUMERIC(15,2);
  v_updated_item RECORD;
  v_order_totals RECORD;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
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

  SELECT oi.id AS order_item_id, oi.order_id, oi.tenant_id, oi.status AS item_status,
         oi.subtotal AS item_subtotal,
         o.branch_id, o.status AS order_status, o.payment_status
  INTO v_row
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id AND o.tenant_id = oi.tenant_id
  WHERE oi.id = p_order_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order item not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_row.order_id);

  SELECT oi.id AS order_item_id, oi.order_id, oi.tenant_id, oi.status AS item_status,
         oi.subtotal AS item_subtotal,
         o.branch_id, o.status AS order_status, o.payment_status
  INTO v_row
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id AND o.tenant_id = oi.tenant_id
  WHERE oi.id = p_order_item_id
  FOR UPDATE OF oi, o;

  IF v_row.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_row.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_row.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_row.order_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_row.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  IF v_row.item_status = 'cancelled' THEN
    RAISE EXCEPTION 'order item cancelled' USING ERRCODE = '22023';
  END IF;

  IF p_type = 'pct' THEN
    v_clamped_value := LEAST(p_value, 100);
  ELSE
    v_clamped_value := LEAST(p_value, COALESCE(v_row.item_subtotal, 0));
  END IF;

  IF public.compute_discount_amount(p_type, v_clamped_value, v_row.item_subtotal) = 0 THEN
    RAISE EXCEPTION 'discount_zero_amount' USING ERRCODE = '22023';
  END IF;

  UPDATE public.order_items
     SET discount_type = p_type,
         discount_value = v_clamped_value,
         discount_note = v_note_trim,
         updated_at = now()
   WHERE id = p_order_item_id
   RETURNING id, discount_type, discount_value, discount_amount, discount_note
   INTO v_updated_item;

  SELECT discount_amount, item_discount_amount, order_discount_amount, total_amount
  INTO v_order_totals
  FROM public.orders
  WHERE id = v_row.order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  ) VALUES (
    v_row.tenant_id, v_row.order_id, v_row.order_status, v_row.order_status, v_uid,
    'item_discount_applied: item ' || p_order_item_id::TEXT || ' '
      || p_type || ' ' || v_clamped_value::TEXT
      || ' (' || v_updated_item.discount_amount::TEXT || 'đ) :: ' || v_note_trim
  );

  RETURN jsonb_build_object(
    'order_id', v_row.order_id,
    'order_item_id', p_order_item_id,
    'discount_type', v_updated_item.discount_type,
    'discount_value', v_updated_item.discount_value,
    'discount_amount', v_updated_item.discount_amount,
    'discount_note', v_updated_item.discount_note,
    'order_discount_amount', v_order_totals.order_discount_amount,
    'item_discount_amount', v_order_totals.item_discount_amount,
    'total_discount_amount', v_order_totals.discount_amount,
    'total_amount', v_order_totals.total_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_order_item_discount(
  p_order_item_id bigint,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID;
  v_prof_tenant BIGINT;
  v_prof_branch BIGINT;
  v_prof_role TEXT;
  v_row RECORD;
  v_reason_trim TEXT;
  v_order_totals RECORD;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  v_reason_trim := COALESCE(trim(p_reason), '');
  IF length(v_reason_trim) < 3 THEN
    RAISE EXCEPTION 'discount_note_required' USING ERRCODE = '22023';
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

  SELECT oi.id AS order_item_id, oi.order_id, oi.tenant_id, oi.status AS item_status,
         oi.discount_amount AS old_discount_amount,
         o.branch_id, o.status AS order_status, o.payment_status
  INTO v_row
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id AND o.tenant_id = oi.tenant_id
  WHERE oi.id = p_order_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order item not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_row.order_id);

  SELECT oi.id AS order_item_id, oi.order_id, oi.tenant_id, oi.status AS item_status,
         oi.discount_amount AS old_discount_amount,
         o.branch_id, o.status AS order_status, o.payment_status
  INTO v_row
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id AND o.tenant_id = oi.tenant_id
  WHERE oi.id = p_order_item_id
  FOR UPDATE OF oi, o;

  IF v_row.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_row.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_row.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_row.order_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_row.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  UPDATE public.order_items
     SET discount_type = NULL,
         discount_value = NULL,
         discount_note = NULL,
         updated_at = now()
   WHERE id = p_order_item_id;

  SELECT discount_amount, item_discount_amount, order_discount_amount, total_amount
  INTO v_order_totals
  FROM public.orders
  WHERE id = v_row.order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  ) VALUES (
    v_row.tenant_id, v_row.order_id, v_row.order_status, v_row.order_status, v_uid,
    'item_discount_cleared: item ' || p_order_item_id::TEXT
      || ' (was ' || COALESCE(v_row.old_discount_amount::TEXT, '0') || 'đ)'
      || ' :: ' || v_reason_trim
  );

  RETURN jsonb_build_object(
    'order_id', v_row.order_id,
    'order_item_id', p_order_item_id,
    'order_discount_amount', v_order_totals.order_discount_amount,
    'item_discount_amount', v_order_totals.item_discount_amount,
    'total_discount_amount', v_order_totals.discount_amount,
    'total_amount', v_order_totals.total_amount
  );
END;
$$;

COMMENT ON FUNCTION public.apply_order_item_discount(bigint, text, numeric, text) IS
  'Set item-level discount (% or VND) with required note. Blocks paid/terminal orders. Order total is normalized by triggers.';
COMMENT ON FUNCTION public.clear_order_item_discount(bigint, text) IS
  'Clear item-level discount with required reason. Blocks paid/terminal orders. Order total is normalized by triggers.';

REVOKE ALL ON FUNCTION public.apply_order_item_discount(bigint, text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_order_item_discount(bigint, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_item_discount(bigint, text, numeric, text) TO service_role;

REVOKE ALL ON FUNCTION public.clear_order_item_discount(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_order_item_discount(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_order_item_discount(bigint, text) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_order_discount(
  p_order_id bigint,
  p_type text,
  p_value numeric,
  p_note text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID;
  v_prof_tenant BIGINT;
  v_prof_branch BIGINT;
  v_prof_role TEXT;
  v_order RECORD;
  v_note_trim TEXT;
  v_clamped_value NUMERIC(15,2);
  v_discount_base NUMERIC(15,2);
  v_discount_amount NUMERIC(15,2);
  v_updated_order RECORD;
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

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT o.id, o.tenant_id, o.branch_id, o.status, o.payment_status,
         o.subtotal, o.service_charge, o.item_discount_amount
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

  v_discount_base := GREATEST(
    COALESCE(v_order.subtotal, 0) - COALESCE(v_order.item_discount_amount, 0),
    0
  );

  IF p_type = 'pct' THEN
    v_clamped_value := LEAST(p_value, 100);
  ELSE
    v_clamped_value := LEAST(p_value, v_discount_base);
  END IF;

  v_discount_amount := public.compute_discount_amount(
    p_type,
    v_clamped_value,
    v_discount_base
  );

  IF v_discount_amount = 0 THEN
    RAISE EXCEPTION 'discount_zero_amount' USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders
     SET discount_type  = p_type,
         discount_value = v_clamped_value,
         discount_note  = v_note_trim,
         updated_at     = now()
   WHERE id = p_order_id
   RETURNING discount_type, discount_value, order_discount_amount,
             item_discount_amount, discount_amount, total_amount
   INTO v_updated_order;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  ) VALUES (
    v_order.tenant_id, p_order_id, v_order.status, v_order.status, v_uid,
    'discount_applied: ' || p_type || ' ' || v_clamped_value::TEXT
      || ' (' || v_updated_order.order_discount_amount::TEXT || 'đ) :: '
      || v_note_trim
  );

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'discount_type', v_updated_order.discount_type,
    'discount_value', v_updated_order.discount_value,
    'discount_amount', v_updated_order.order_discount_amount,
    'order_discount_amount', v_updated_order.order_discount_amount,
    'item_discount_amount', v_updated_order.item_discount_amount,
    'total_discount_amount', v_updated_order.discount_amount,
    'total_amount', v_updated_order.total_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_order_discount(
  p_order_id bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID;
  v_prof_tenant BIGINT;
  v_prof_branch BIGINT;
  v_prof_role TEXT;
  v_order RECORD;
  v_updated_order RECORD;
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
         o.discount_amount, o.order_discount_amount
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

  UPDATE public.orders
     SET discount_type  = NULL,
         discount_value = NULL,
         discount_note  = NULL,
         updated_at     = now()
   WHERE id = p_order_id
   RETURNING order_discount_amount, item_discount_amount,
             discount_amount, total_amount
   INTO v_updated_order;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  ) VALUES (
    v_order.tenant_id, p_order_id, v_order.status, v_order.status, v_uid,
    'discount_cleared (was '
      || COALESCE(v_order.order_discount_amount::TEXT, '0') || 'đ order-level)'
  );

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'order_discount_amount', v_updated_order.order_discount_amount,
    'item_discount_amount', v_updated_order.item_discount_amount,
    'total_discount_amount', v_updated_order.discount_amount,
    'total_amount', v_updated_order.total_amount
  );
END;
$$;

COMMENT ON FUNCTION public.apply_order_discount(bigint, text, numeric, text) IS
  'Set order-level discount on the post-item-discount base. Total discount is normalized by triggers.';
COMMENT ON FUNCTION public.clear_order_discount(bigint) IS
  'Clear order-level discount only; item-level discounts remain active. Total discount is normalized by triggers.';

REVOKE ALL ON FUNCTION public.apply_order_discount(bigint, text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_order_discount(bigint, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_discount(bigint, text, numeric, text) TO service_role;

REVOKE ALL ON FUNCTION public.clear_order_discount(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_order_discount(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_order_discount(bigint) TO service_role;
