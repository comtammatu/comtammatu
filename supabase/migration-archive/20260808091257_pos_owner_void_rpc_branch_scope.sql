-- Allow Owner on POS void/cancel/edit/reduce RPCs without collapsing waiter into cashier.
-- Waiter remains branch_staff with no POS money keys; these RPCs stay owner/BM/cashier only.
-- Branch scope: Owner (null profiles.branch_id) bypasses equality; other roles stay branch-bound.

CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id bigint, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_prof_tenant bigint;
  v_prof_branch bigint;
  v_prof_role text;
  v_order record;
  v_item_id bigint;
  v_print_res jsonb;
  v_waste_res jsonb;
  v_tickets_enqueued int := 0;
  v_tickets_skipped int := 0;
  v_skip_reasons text[] := ARRAY[]::text[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'unassigned')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  -- Owner + floor money roles only. Waiter maps to branch_staff and stays excluded.
  IF v_prof_role IS NULL OR v_prof_role NOT IN ('owner', 'branch_manager', 'cashier') THEN
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

  IF v_prof_role <> 'owner' THEN
    IF v_prof_branch IS NULL THEN
      RAISE EXCEPTION 'branch scope required' USING ERRCODE = '42501';
    END IF;
    IF v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
      RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:void_order') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  v_waste_res := public.post_pos_cancelled_ready_waste(p_order_id, v_uid, p_reason);

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
    status = 'cancelled',
    subtotal = 0,
    discount_type = NULL,
    discount_value = NULL,
    discount_note = NULL,
    discount_amount = 0,
    total_amount = 0 + COALESCE(service_charge, 0),
    updated_at = now()
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
    'order_id', p_order_id,
    'status', 'cancelled',
    'cancel_tickets', v_tickets_enqueued,
    'cancel_skipped', v_tickets_skipped,
    'skip_reasons', to_jsonb(v_skip_reasons),
    'stock_outcome', COALESCE(v_waste_res, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.void_order_item(p_order_item_id bigint, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'unassigned')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  -- Owner + floor money roles only. Waiter maps to branch_staff and stays excluded.
  IF v_prof_role IS NULL OR v_prof_role NOT IN ('owner', 'branch_manager', 'cashier') THEN
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

  IF v_prof_role <> 'owner' THEN
    IF v_prof_branch IS NULL THEN
      RAISE EXCEPTION 'branch scope required' USING ERRCODE = '42501';
    END IF;
    IF v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
      RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
    END IF;
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

  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
  FROM public.order_items
  WHERE order_id = v_item.order_id AND status <> 'cancelled';

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
    v_discount_amount := public.compute_discount_amount(
      v_order.discount_type, v_order.discount_value, v_subtotal
    );

    UPDATE public.orders o
    SET
      subtotal        = v_subtotal,
      discount_type   = CASE WHEN v_discount_amount = 0 THEN NULL ELSE o.discount_type END,
      discount_value  = CASE WHEN v_discount_amount = 0 THEN NULL ELSE o.discount_value END,
      discount_note   = CASE WHEN v_discount_amount = 0 THEN NULL ELSE o.discount_note END,
      discount_amount = v_discount_amount,
      total_amount    = v_subtotal + COALESCE(o.service_charge, 0) - v_discount_amount,
      updated_at      = now()
    WHERE o.id = v_item.order_id;

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

CREATE OR REPLACE FUNCTION public.reduce_order_item_quantity(p_order_item_id bigint, p_new_quantity integer, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'unassigned')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  -- Owner + floor money roles only. Waiter maps to branch_staff and stays excluded.
  IF v_prof_role IS NULL OR v_prof_role NOT IN ('owner', 'branch_manager', 'cashier') THEN
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

  IF v_prof_role <> 'owner' THEN
    IF v_prof_branch IS NULL THEN
      RAISE EXCEPTION 'branch scope required' USING ERRCODE = '42501';
    END IF;
    IF v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
      RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
    END IF;
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

  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal_sum
  FROM public.order_items
  WHERE order_id = v_item.order_id AND status <> 'cancelled';

  v_disc_amount := public.compute_discount_amount(
    v_order.discount_type, v_order.discount_value, v_subtotal_sum
  );
  v_total_amount := v_subtotal_sum
    + COALESCE(v_order.service_charge, 0)
    - v_disc_amount;

  UPDATE public.orders
  SET subtotal        = v_subtotal_sum,
      discount_amount = v_disc_amount,
      total_amount    = v_total_amount,
      updated_at      = now()
  WHERE id = v_item.order_id;

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

CREATE OR REPLACE FUNCTION public.edit_pending_order_item(p_order_item_id bigint, p_variant_id bigint, p_variant_name text, p_unit_price numeric, p_modifiers jsonb, p_sides jsonb, p_note text, p_quantity integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'unassigned')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  -- Owner + floor money roles only. Waiter maps to branch_staff and stays excluded.
  IF v_prof_role IS NULL OR v_prof_role NOT IN ('owner', 'branch_manager', 'cashier') THEN
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

  IF v_prof_role <> 'owner' THEN
    IF v_prof_branch IS NULL THEN
      RAISE EXCEPTION 'branch scope required' USING ERRCODE = '42501';
    END IF;
    IF v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
      RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
    END IF;
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

  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal_sum
  FROM public.order_items
  WHERE order_id = v_item.order_id AND status <> 'cancelled';

  v_disc_amount := public.compute_discount_amount(
    v_order.discount_type, v_order.discount_value, v_subtotal_sum
  );
  v_total_amount := v_subtotal_sum
    + COALESCE(v_order.service_charge, 0)
    - v_disc_amount;

  UPDATE public.orders
  SET subtotal        = v_subtotal_sum,
      discount_amount = v_disc_amount,
      total_amount    = v_total_amount,
      updated_at      = now()
  WHERE id = v_item.order_id;

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

