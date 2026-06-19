ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS runner_public_slug uuid;

UPDATE public.branches
   SET runner_public_slug = gen_random_uuid()
 WHERE runner_public_slug IS NULL;

ALTER TABLE public.branches
  ALTER COLUMN runner_public_slug SET DEFAULT gen_random_uuid(),
  ALTER COLUMN runner_public_slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_runner_public_slug
  ON public.branches (runner_public_slug);

ALTER TABLE public.notification_push_deliveries
  DROP CONSTRAINT IF EXISTS notification_push_deliveries_status_check;

ALTER TABLE public.notification_push_deliveries
  ADD CONSTRAINT notification_push_deliveries_status_check
  CHECK (status = ANY (ARRAY['pending', 'processing', 'sent', 'failed', 'skipped']));

CREATE OR REPLACE FUNCTION public.claim_notification_push_delivery(
  p_notification_id bigint,
  p_subscription_id bigint,
  p_max_attempts integer DEFAULT 3,
  p_processing_ttl_seconds integer DEFAULT 900
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row RECORD;
  v_attempt_count INTEGER;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  IF p_max_attempts < 1 OR p_processing_ttl_seconds < 1 THEN
    RAISE EXCEPTION 'invalid_push_claim_limits' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.notification_push_deliveries (
    notification_id,
    subscription_id,
    status,
    attempt_count,
    last_attempt_at,
    updated_at
  )
  VALUES (
    p_notification_id,
    p_subscription_id,
    'processing',
    1,
    now(),
    now()
  )
  ON CONFLICT (notification_id, subscription_id) DO NOTHING;

  IF FOUND THEN
    RETURN jsonb_build_object('status', 'claimed', 'attempt_count', 1);
  END IF;

  SELECT status, attempt_count, last_attempt_at
    INTO v_row
    FROM public.notification_push_deliveries
   WHERE notification_id = p_notification_id
     AND subscription_id = p_subscription_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery_claim_failed' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status IN ('sent', 'skipped') THEN
    RETURN jsonb_build_object(
      'status', 'already_done',
      'attempt_count', v_row.attempt_count
    );
  END IF;

  IF v_row.attempt_count >= p_max_attempts THEN
    RETURN jsonb_build_object(
      'status', 'max_attempts',
      'attempt_count', v_row.attempt_count
    );
  END IF;

  IF v_row.status = 'processing'
     AND v_row.last_attempt_at IS NOT NULL
     AND v_row.last_attempt_at > now() - make_interval(secs => p_processing_ttl_seconds) THEN
    RETURN jsonb_build_object(
      'status', 'in_progress',
      'attempt_count', v_row.attempt_count
    );
  END IF;

  UPDATE public.notification_push_deliveries
     SET status = 'processing',
         attempt_count = attempt_count + 1,
         last_attempt_at = now(),
         error = NULL,
         updated_at = now()
   WHERE notification_id = p_notification_id
     AND subscription_id = p_subscription_id
   RETURNING attempt_count INTO v_attempt_count;

  RETURN jsonb_build_object(
    'status', 'claimed',
    'attempt_count', v_attempt_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_push_delivery(bigint, bigint, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_push_delivery(bigint, bigint, integer, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.consume_stock_for_order_service(p_order_id bigint, p_actor_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_actor      UUID := COALESCE(p_actor_id, '00000000-0000-0000-0000-000000000000'::UUID);
  v_order      RECORD;
  v_need       RECORD;
  v_sl         NUMERIC(15,3);
  v_total      NUMERIC(15,3);
  v_location_id BIGINT;
  v_location_is_default BOOLEAN;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT o.id, o.tenant_id, o.branch_id, o.status
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.order_id = p_order_id
      AND sm.type = 'consumption'
      AND sm.tenant_id = v_order.tenant_id
  ) THEN
    RETURN jsonb_build_object(
      'order_id', p_order_id, 'skipped', true, 'reason', 'already_consumed'
    );
  END IF;

  SELECT il.id, il.is_default_consumption
  INTO v_location_id, v_location_is_default
  FROM public.inventory_locations il
  WHERE il.branch_id = v_order.branch_id
    AND il.tenant_id = v_order.tenant_id
    AND il.location_kind = 'kitchen'
    AND il.is_active = TRUE
  ORDER BY il.is_default_consumption DESC, il.sort_order NULLS LAST, il.id
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'consumption_location_missing:%', v_order.branch_id USING ERRCODE = 'P0002';
  END IF;

  IF v_location_is_default IS DISTINCT FROM TRUE THEN
    RAISE WARNING 'default_consumption_location_missing:branch %; using kitchen location %',
      v_order.branch_id,
      v_location_id;
  END IF;

  FOR v_need IN
    SELECT
      r.ingredient_id,
      SUM(oi.quantity::NUMERIC * r.quantity / r.yield_factor) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id
     AND r.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.tenant_id = v_order.tenant_id
      AND oi.status <> 'cancelled'
    GROUP BY r.ingredient_id
  LOOP
    SELECT sl.current_quantity INTO v_sl
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_order.tenant_id
      AND sl.branch_id = v_order.branch_id
      AND sl.location_id = v_location_id
      AND sl.ingredient_id = v_need.ingredient_id;

    v_total := COALESCE(v_sl, 0);
    IF v_total < v_need.need_qty THEN
      RAISE EXCEPTION 'insufficient_stock_ingredient:%', v_need.ingredient_id
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  FOR v_need IN
    SELECT
      r.ingredient_id,
      SUM(oi.quantity::NUMERIC * r.quantity / r.yield_factor) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id
     AND r.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.tenant_id = v_order.tenant_id
      AND oi.status <> 'cancelled'
    GROUP BY r.ingredient_id
  LOOP
    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, order_id, unit_cost, location_id
    )
    SELECT
      v_order.tenant_id,
      v_order.branch_id,
      v_need.ingredient_id,
      'consumption',
      -v_need.need_qty,
      'Order ' || p_order_id::TEXT,
      v_actor,
      p_order_id,
      COALESCE(sl.avg_unit_cost, 0),
      v_location_id
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_order.tenant_id
      AND sl.branch_id = v_order.branch_id
      AND sl.location_id = v_location_id
      AND sl.ingredient_id = v_need.ingredient_id;
  END LOOP;

  RETURN jsonb_build_object('order_id', p_order_id, 'consumed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_stock_for_order_service(bigint, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_stock_for_order_service(bigint, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.mark_order_item_served(p_item_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID;
  v_prof_tenant BIGINT;
  v_prof_branch BIGINT;
  v_prof_role TEXT;
  v_item RECORD;
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

  SELECT
    oi.id,
    oi.order_id,
    oi.tenant_id,
    oi.status        AS item_status,
    o.branch_id,
    o.status         AS order_status
  INTO v_item
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = p_item_id
  FOR UPDATE OF oi;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_item.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role <> 'owner' THEN
    IF v_prof_branch IS NULL THEN
      RAISE EXCEPTION 'branch scope required' USING ERRCODE = '42501';
    END IF;
    IF v_item.branch_id <> v_prof_branch THEN
      RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT public.has_permission(v_item.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'forbidden: missing pos:use' USING ERRCODE = '42501';
  END IF;

  IF v_item.order_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF v_item.item_status NOT IN ('pending', 'preparing', 'ready') THEN
    RAISE EXCEPTION 'invalid item transition to served' USING ERRCODE = '22023';
  END IF;

  UPDATE public.order_items
  SET status = 'served',
      updated_at = now()
  WHERE id = p_item_id;

  UPDATE public.kds_tickets
  SET status = 'served',
      bumped_at = COALESCE(bumped_at, now()),
      bumped_by = COALESCE(bumped_by, v_uid),
      updated_at = now()
  WHERE order_item_id = p_item_id
    AND tenant_id = v_item.tenant_id
    AND status <> 'cancelled';

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_item.tenant_id, v_item.order_id, v_item.order_status, v_item.order_status,
    v_uid, 'mark_item_served ' || p_item_id::text
  );

  RETURN jsonb_build_object(
    'item_id',   p_item_id,
    'order_id',  v_item.order_id,
    'status',    'served'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_order_table(p_order_id bigint, p_new_table_id bigint, p_idempotency_key uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID;
  v_prof_tenant BIGINT;
  v_prof_branch BIGINT;
  v_prof_role TEXT;
  v_order RECORD;
  v_new_table RECORD;
  v_old_table_id BIGINT;
  v_active_on_old INT;
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

  SELECT id, tenant_id, branch_id, table_id, order_type, status,
         last_transfer_idempotency_key
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
    IF v_order.branch_id <> v_prof_branch THEN
      RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'forbidden: missing pos:use' USING ERRCODE = '42501';
  END IF;

  IF p_idempotency_key IS NOT NULL
     AND v_order.last_transfer_idempotency_key = p_idempotency_key THEN
    RETURN jsonb_build_object(
      'order_id', p_order_id,
      'table_id', v_order.table_id,
      'idempotent', true
    );
  END IF;

  IF v_order.order_type <> 'dine_in' THEN
    RAISE EXCEPTION 'takeaway cannot transfer' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  SELECT id, status INTO v_new_table
  FROM public.tables
  WHERE id = p_new_table_id AND branch_id = v_order.branch_id AND tenant_id = v_order.tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'table not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_new_table_id = v_order.table_id THEN
    UPDATE public.orders
    SET last_transfer_idempotency_key = COALESCE(p_idempotency_key, last_transfer_idempotency_key),
        updated_at = now()
    WHERE id = p_order_id;
    RETURN jsonb_build_object('order_id', p_order_id, 'table_id', p_new_table_id);
  END IF;

  IF v_new_table.status NOT IN ('available', 'occupied') THEN
    RAISE EXCEPTION 'table not available' USING ERRCODE = '22023';
  END IF;

  v_old_table_id := v_order.table_id;

  UPDATE public.orders
  SET table_id = p_new_table_id,
      last_transfer_idempotency_key = p_idempotency_key,
      updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.tables
  SET status = 'occupied', updated_at = now()
  WHERE id = p_new_table_id AND tenant_id = v_order.tenant_id;

  IF v_old_table_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_active_on_old
    FROM public.orders
    WHERE table_id = v_old_table_id
      AND tenant_id = v_order.tenant_id
      AND id <> p_order_id
      AND status NOT IN ('completed', 'cancelled', 'served');

    IF v_active_on_old = 0 THEN
      UPDATE public.tables
      SET status = 'available', updated_at = now()
      WHERE id = v_old_table_id AND tenant_id = v_order.tenant_id;
    END IF;
  END IF;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id, p_order_id, v_order.status, v_order.status, v_uid,
    'transfer_table -> ' || p_new_table_id::text
  );

  RETURN jsonb_build_object('order_id', p_order_id, 'table_id', p_new_table_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_waste_entry(p_branch_id bigint, p_location_id bigint, p_items jsonb, p_source_type text DEFAULT 'manual'::text, p_source_ref jsonb DEFAULT NULL::jsonb, p_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid(); v_tenant BIGINT; v_location RECORD; v_shift_key TEXT; v_issue_id BIGINT;
  v_issue_no TEXT; v_item JSONB; v_photos TEXT[]; v_created INT := 0; v_needs_appr BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:writeoff') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.branches WHERE id = p_branch_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002'; END IF;
  SELECT tenant_id, branch_id INTO v_location FROM public.inventory_locations WHERE id = p_location_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'location_scope_mismatch' USING ERRCODE = '42501';
  END IF;
  IF v_location.tenant_id <> v_tenant OR v_location.branch_id <> p_branch_id THEN
    RAISE EXCEPTION 'location_scope_mismatch' USING ERRCODE = '42501';
  END IF;
  v_shift_key := public.inventory_shift_key(p_branch_id, now());
  v_issue_no := 'WO-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || substr(gen_random_uuid()::TEXT, 1, 4);
  INSERT INTO public.stock_issues (tenant_id, branch_id, issue_number, issue_type, status, notes,
    issued_at, created_by, source_location_id, approval_status, shift_key, source_type, source_ref)
  VALUES (v_tenant, p_branch_id, v_issue_no, 'writeoff', 'draft', p_notes,
    now(), v_uid, p_location_id, 'not_required', v_shift_key, COALESCE(p_source_type, 'manual'), p_source_ref)
  RETURNING id INTO v_issue_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_photos := CASE WHEN v_item ? 'photo_urls'
                     THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'photo_urls'))
                     ELSE ARRAY[]::TEXT[] END;
    INSERT INTO public.stock_issue_items (tenant_id, issue_id, ingredient_id, quantity, unit, unit_cost,
      reason_code, photo_urls, reason)
    VALUES (v_tenant, v_issue_id, (v_item->>'ingredient_id')::BIGINT, (v_item->>'quantity')::NUMERIC,
      COALESCE(v_item->>'unit', 'kg'), NULLIF(v_item->>'unit_cost','')::NUMERIC,
      v_item->>'reason_code', v_photos, v_item->>'note');
    v_created := v_created + 1;
  END LOOP;
  SELECT bool_or(approval_required) INTO v_needs_appr FROM public.stock_issue_items WHERE issue_id = v_issue_id;
  IF NOT v_needs_appr THEN UPDATE public.stock_issues SET status = 'confirmed' WHERE id = v_issue_id; END IF;
  RETURN jsonb_build_object('issue_id', v_issue_id, 'issue_number', v_issue_no,
    'shift_key', v_shift_key, 'items_created', v_created, 'requires_approval', COALESCE(v_needs_appr, false));
END; $$;

REVOKE ALL ON FUNCTION public.create_waste_from_order(bigint, bigint, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_waste_from_order(bigint, bigint, text, jsonb, text)
  TO service_role;
