-- =============================================================
-- PR-A: append_order_items idempotency + return-shape contract fix
-- =============================================================
-- Issue #1 (real bug — BA-E3):
--   `append_order_items` RPC had no idempotency_key. Two POS append
--   call-sites (`handleItemTap` + `handleCustomizerConfirm`) each
--   tap generated a fresh invocation; double-tap on slow network
--   produced duplicate order_items rows, diverging totals, extra KDS
--   tickets. `submitOrder` / `create_order` already had this via
--   orders.idempotency_key (migration 20260408100000). Append was
--   missing the same protection.
--
-- Issue #2 (contract bug):
--   Old RPC returned {success, order_id, added_count}. Server action
--   (apps/web/app/br/[branchId]/pos/order-actions.ts:573-577) cast to
--   {subtotal, total_amount, order_id}. `subtotal`/`total_amount`
--   were undefined → silent NaN in the action's return. UI never
--   read those fields so the drift was latent; still real debt.
--
-- Fix strategy (mirrors create_order pattern at migration 20260408100000):
--   - Add order_items.request_key UUID column + partial index.
--     Not UNIQUE (one append RPC call inserts N rows sharing one key,
--     that's by design; lookup uses EXISTS).
--   - Replace RPC with new signature adding p_idempotency_key UUID
--     (DEFAULT NULL so any caller not passing a key still works —
--     not used by POS after PR-A, but preserves back-compat for any
--     future caller).
--   - Early-check inside pg_advisory_xact_lock already held by the
--     RPC: if any row exists for (order_id, request_key), short-
--     circuit returning the CURRENT totals (what the first call
--     wrote). Double-tap replay = no-op.
--   - Stamp request_key onto every inserted order_items row.
--   - Return shape now includes subtotal + total_amount (the RPC
--     already computes these at the end; just surface them).
-- =============================================================

-- 1. Sidecar column on order_items (nullable — pre-existing rows stay NULL).
ALTER TABLE public.order_items
  ADD COLUMN request_key UUID;

-- 2. Partial index for idempotency lookup. NOT UNIQUE because one append
--    RPC call inserts N rows sharing the same key (by design: the key
--    identifies the RPC call, not a single row). EXISTS is the lookup.
CREATE INDEX IF NOT EXISTS order_items_request_key_per_order_idx
  ON public.order_items (order_id, request_key)
  WHERE request_key IS NOT NULL;

-- 3. Drop old signature so the new 3-arg form is the only overload.
DROP FUNCTION IF EXISTS public.append_order_items(BIGINT, JSONB);

-- 4. New RPC with idempotency + return-shape fix. Body is identical to
--    20260426010000_pos_order_side_quantities.sql:336-520 except:
--      - Adds p_idempotency_key parameter.
--      - Adds early idempotency short-circuit inside the existing
--        pg_advisory_xact_lock window.
--      - Stamps request_key onto the INSERT.
--      - Returns {subtotal, total_amount} in the jsonb result.
CREATE OR REPLACE FUNCTION public.append_order_items(
  p_order_id        BIGINT,
  p_items           JSONB,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_total_amount    NUMERIC(15,2);
  v_note_parts      TEXT[] := ARRAY[]::TEXT[];
  v_item_name       TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(po.legacy_role_code, 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  -- Idempotency short-circuit. Must be inside the advisory lock to
  -- serialize against a concurrent "first" call that hasn't yet
  -- inserted but is about to. If a row with the same key already
  -- exists on this order, return the CURRENT totals (what the first
  -- call committed). Client treats this as success — replay is safe.
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
        'success',      true,
        'order_id',     p_order_id,
        'added_count',  0,
        'subtotal',     COALESCE(v_subtotal, 0),
        'total_amount', COALESCE(v_total_amount, 0),
        'idempotent',   true
      );
    END IF;
  END IF;

  SELECT o.id, o.tenant_id, o.branch_id, o.status, o.service_charge, o.discount_amount
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

  IF v_order.status NOT IN ('new', 'confirmed', 'preparing', 'ready') THEN
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
    WHERE id = v_menu_item_id AND tenant_id = v_order.tenant_id AND is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu item % not found or inactive', v_menu_item_id USING ERRCODE = 'P0002';
    END IF;

    v_variant_adj := 0;
    IF v_variant_id IS NOT NULL THEN
      SELECT price_adjustment INTO v_variant_adj
      FROM public.menu_item_variants
      WHERE id = v_variant_id AND item_id = v_menu_item_id AND tenant_id = v_order.tenant_id AND is_active = true;
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
       AND m.tenant_id = v_order.tenant_id
       AND m.is_active = true;
    END IF;

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

  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
  FROM public.order_items
  WHERE order_id = p_order_id AND status <> 'cancelled';

  v_total_amount := v_subtotal
                  + COALESCE(v_order.service_charge, 0)
                  - COALESCE(v_order.discount_amount, 0);

  UPDATE public.orders o
  SET
    subtotal = v_subtotal,
    tax_amount = 0,
    total_amount = v_total_amount,
    updated_at = now()
  WHERE o.id = p_order_id;

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
    'success',      true,
    'order_id',     p_order_id,
    'added_count',  jsonb_array_length(p_items),
    'subtotal',     v_subtotal,
    'total_amount', v_total_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.append_order_items(BIGINT, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_order_items(BIGINT, JSONB, UUID) TO authenticated;

COMMENT ON FUNCTION public.append_order_items(BIGINT, JSONB, UUID) IS
  'Atomic append of order_items to an existing appendable order. '
  'pg_advisory_xact_lock(order_id) serializes with other mutations. '
  'If p_idempotency_key matches a prior append on the same order, '
  'short-circuits returning current totals (no duplicate insert). '
  'Returns {success, order_id, added_count, subtotal, total_amount[, idempotent]}.';

COMMENT ON COLUMN public.order_items.request_key IS
  'UUID carried by the append_order_items RPC call that inserted this row. '
  'Used for RPC-level idempotency — enables client double-tap/retry safety.';
