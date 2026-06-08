-- GREENFIELD_ONLY: rehearsal SQL for the greenfield role-bridge cut; not part of supabase/migrations.
-- =============================================================
-- Cut the remaining 18 legacy_role_code readers (16 SECURITY DEFINER POS/order
-- functions + 2 _auth_v2 scope-check trigger helpers) over to
-- private.staff_role_from_position_code(code). Completes the bridge removal that
-- 20260602000700 started (which only covered the auth/JWT path).
--
-- Bodies were regex-transformed from the live defs: every `[qual.]legacy_role_code`
-- read became `private.staff_role_from_position_code([qual.]code)`. The role values
-- are identical for known codes (validated) and NULL for unknown (preserving the
-- COALESCE(..., 'office') defaults). The 2 trigger helpers are promoted to
-- SECURITY DEFINER so they may call the owner-only private helper.
--
-- Apply AFTER 20260602000700. Verified on dev sandbox matu-dev.
-- =============================================================

SET search_path TO public, extensions, pg_catalog;
SET check_function_bodies = off;

CREATE OR REPLACE FUNCTION public._auth_v2_check_area_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_code TEXT;
BEGIN
  IF NEW.area_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT private.staff_role_from_position_code(code) INTO v_code
  FROM public.positions WHERE id = NEW.position_id;
  IF v_code IS NULL OR v_code NOT IN ('area_manager','warehouse_manager','production_manager') THEN
    RAISE EXCEPTION 'area_id only allowed for area_manager / warehouse_manager / production_manager (got %)', COALESCE(v_code, '<null>')
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._auth_v2_check_branch_required()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_code TEXT;
BEGIN
  SELECT private.staff_role_from_position_code(code) INTO v_code
  FROM public.positions WHERE id = NEW.position_id;

  IF v_code IN ('cashier','waiter','chef','branch_manager','warehouse_manager','production_manager')
     AND NEW.branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_required_for_operational_role: position=%', v_code
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.append_order_items(p_order_id bigint, p_items jsonb, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
  FROM public.order_items
  WHERE order_id = p_order_id AND status <> 'cancelled';

  v_discount_amount := public.compute_discount_amount(
    v_order.discount_type, v_order.discount_value, v_subtotal
  );

  v_total_amount := v_subtotal
                  + COALESCE(v_order.service_charge, 0)
                  - v_discount_amount;

  UPDATE public.orders o
  SET
    subtotal        = v_subtotal,
    tax_amount      = 0,
    discount_amount = v_discount_amount,
    total_amount    = v_total_amount,
    updated_at      = now()
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
    'success',      TRUE,
    'order_id',     p_order_id,
    'added_count',  jsonb_array_length(p_items),
    'subtotal',     v_subtotal,
    'total_amount', v_total_amount
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_order_discount(p_order_id bigint, p_type text, p_value numeric, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         o.subtotal, o.service_charge
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

  -- Auto-clamp at the boundary (UI also clamps; this is defense-in-depth):
  -- pct beyond 100 -> 100, vnd beyond subtotal -> subtotal.
  IF p_type = 'pct' THEN
    v_clamped_value := LEAST(p_value, 100);
  ELSE
    v_clamped_value := LEAST(p_value, COALESCE(v_order.subtotal, 0));
  END IF;

  v_discount_amount := public.compute_discount_amount(
    p_type, v_clamped_value, v_order.subtotal
  );

  -- Edge: cashier types 0 — that's NOT an apply, it's a clear. Force the
  -- caller to use clear_order_discount instead (so audit history reads
  -- "discount_cleared" not "discount_applied: 0%").
  IF v_discount_amount = 0 THEN
    RAISE EXCEPTION 'discount_zero_amount' USING ERRCODE = '22023';
  END IF;

  v_total_amount := COALESCE(v_order.subtotal, 0)
                  + COALESCE(v_order.service_charge, 0)
                  - v_discount_amount;

  UPDATE public.orders
     SET discount_type   = p_type,
         discount_value  = v_clamped_value,
         discount_note   = v_note_trim,
         discount_amount = v_discount_amount,
         total_amount    = v_total_amount,
         updated_at      = now()
   WHERE id = p_order_id;

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
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id bigint, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.clear_order_discount(p_order_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          UUID;
  v_prof_tenant  BIGINT;
  v_prof_branch  BIGINT;
  v_prof_role    TEXT;
  v_order        RECORD;
  v_total_amount NUMERIC(15,2);
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

  v_total_amount := COALESCE(v_order.subtotal, 0)
                  + COALESCE(v_order.service_charge, 0);

  UPDATE public.orders
     SET discount_type   = NULL,
         discount_value  = NULL,
         discount_note   = NULL,
         discount_amount = 0,
         total_amount    = v_total_amount,
         updated_at      = now()
   WHERE id = p_order_id;

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
$function$
;

CREATE OR REPLACE FUNCTION public.create_order(p_tenant_id bigint, p_branch_id bigint, p_created_by uuid, p_items jsonb, p_order_type text DEFAULT 'dine_in'::text, p_table_id bigint DEFAULT NULL::bigint, p_pos_session_id bigint DEFAULT NULL::bigint, p_customer_count integer DEFAULT 1, p_note text DEFAULT NULL::text, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_created_by       UUID;
  v_order_id         BIGINT;
  v_order_number     TEXT;
  v_date_part        TEXT;
  v_subtotal         NUMERIC(15,2) := 0;
  v_seq              INT;
  v_table_number     INT;
  v_item             JSONB;
  v_base_price       NUMERIC(15,2);
  v_variant_adj      NUMERIC(15,2);
  v_modifier_sum     NUMERIC(15,2);
  v_sides_sum        NUMERIC(15,2);
  v_enriched_sides   JSONB;
  v_unit_price       NUMERIC(15,2);
  v_item_subtotal    NUMERIC(15,2);
  v_menu_item_id     BIGINT;
  v_variant_id       BIGINT;
  v_quantity         INT;
  v_prof_tenant      BIGINT;
  v_prof_branch      BIGINT;
  v_prof_role        TEXT;
  v_branch_code      TEXT;
BEGIN
  v_created_by := auth.uid();
  IF v_created_by IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'office')
    INTO v_prof_tenant, v_prof_branch, v_prof_role
    FROM public.profiles p
    LEFT JOIN public.positions po ON po.id = p.position_id
   WHERE p.id = v_created_by;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_tenant IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    SELECT b.code INTO v_branch_code
      FROM public.branches b
     WHERE b.id = p_branch_id AND b.tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NOT NULL THEN
    IF p_branch_id IS DISTINCT FROM v_prof_branch THEN
      RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
    END IF;
    SELECT b.code INTO v_branch_code
      FROM public.branches b
     WHERE b.id = p_branch_id AND b.tenant_id = p_tenant_id;
  ELSE
    RAISE EXCEPTION 'branch scope required' USING ERRCODE = '42501';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items must be a non-empty JSON array' USING ERRCODE = '22023';
  END IF;

  IF p_order_type NOT IN ('dine_in', 'takeaway') THEN
    RAISE EXCEPTION 'p_order_type must be dine_in or takeaway' USING ERRCODE = '22023';
  END IF;

  IF p_table_id IS NOT NULL THEN
    SELECT t.number INTO v_table_number
      FROM public.tables t
     WHERE t.id = p_table_id AND t.branch_id = p_branch_id AND t.tenant_id = p_tenant_id;
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

  IF p_idempotency_key IS NOT NULL THEN
    SELECT o.id, o.order_number INTO v_order_id, v_order_number
      FROM public.orders o
     WHERE o.tenant_id = p_tenant_id
       AND o.idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
    END IF;
  END IF;

  INSERT INTO public.order_daily_counters (
    tenant_id, branch_id, counter_date, last_seq
  )
  VALUES (
    p_tenant_id,
    p_branch_id,
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
    1
  )
  ON CONFLICT (tenant_id, branch_id, counter_date)
  DO UPDATE SET
    last_seq   = public.order_daily_counters.last_seq + 1,
    updated_at = now()
  RETURNING last_seq INTO v_seq;

  v_date_part := to_char(
    CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh',
    'YYMMDD'
  );

  IF p_order_type = 'dine_in' THEN
    v_order_number := 'TC-' || v_date_part || '-' || lpad(v_seq::TEXT, 3, '0');
  ELSE
    v_order_number := 'MV-' || v_date_part || '-' || lpad(v_seq::TEXT, 3, '0');
  END IF;

  IF v_branch_code IS NOT NULL THEN
    v_order_number := v_order_number || '-' || v_branch_code;
  END IF;

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
          RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
        END IF;
      END IF;
      RAISE;
  END;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS value
  LOOP
    v_menu_item_id := (v_item ->> 'menu_item_id')::BIGINT;
    v_variant_id   := NULLIF(v_item ->> 'variant_id', '')::BIGINT;
    v_quantity     := (v_item ->> 'quantity')::INT;

    IF v_quantity IS NULL OR v_quantity < 1 THEN
      RAISE EXCEPTION 'invalid quantity' USING ERRCODE = '22023';
    END IF;

    SELECT base_price INTO v_base_price
      FROM public.menu_items
     WHERE id = v_menu_item_id AND tenant_id = p_tenant_id AND is_active = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu item % not found or inactive', v_menu_item_id USING ERRCODE = 'P0002';
    END IF;

    v_variant_adj := 0;
    IF v_variant_id IS NOT NULL THEN
      SELECT price_adjustment INTO v_variant_adj
        FROM public.menu_item_variants
       WHERE id = v_variant_id AND item_id = v_menu_item_id AND tenant_id = p_tenant_id AND is_active = TRUE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant % not found or inactive', v_variant_id USING ERRCODE = 'P0002';
      END IF;
    END IF;

    v_modifier_sum := public.pos_order_modifier_sum(
      p_tenant_id,
      v_menu_item_id,
      COALESCE(v_item -> 'modifiers', '[]'::JSONB)
    );

    SELECT sides_sum, enriched_sides
      INTO v_sides_sum, v_enriched_sides
      FROM public.pos_enrich_order_sides(
        p_tenant_id,
        v_menu_item_id,
        COALESCE(v_item -> 'sides', '[]'::JSONB)
      );

    v_unit_price    := v_base_price + v_variant_adj + v_modifier_sum + COALESCE(v_sides_sum, 0);
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
      COALESCE(v_enriched_sides, '[]'::JSONB),
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

  RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.edit_pending_order_item(p_order_item_id bigint, p_variant_id bigint, p_variant_name text, p_unit_price numeric, p_modifiers jsonb, p_sides jsonb, p_note text, p_quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.mark_order_item_served(p_item_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    NULL;
  ELSIF v_prof_branch IS NOT NULL AND v_item.branch_id <> v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
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
$function$
;

CREATE OR REPLACE FUNCTION public.merge_orders(p_source_order_id bigint, p_target_order_id bigint, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT COALESCE(SUM(subtotal), 0) INTO v_target_subtotal
  FROM public.order_items
  WHERE order_id = p_target_order_id AND status <> 'cancelled';

  v_target_discount_amount := public.compute_discount_amount(
    v_target_discount_type, v_target_discount_value, v_target_subtotal
  );

  v_target_total := v_target_subtotal
                  + COALESCE(v_target.service_charge, 0)
                  - v_target_discount_amount;

  IF v_target_discount_amount = 0 THEN
    v_target_discount_type  := NULL;
    v_target_discount_value := NULL;
    v_target_discount_note  := NULL;
  END IF;

  UPDATE public.orders
     SET subtotal             = v_target_subtotal,
         discount_type        = v_target_discount_type,
         discount_value       = v_target_discount_value,
         discount_note        = v_target_discount_note,
         discount_amount      = v_target_discount_amount,
         total_amount         = v_target_total,
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

  v_source_total := 0 + COALESCE(v_source.service_charge, 0);

  UPDATE public.orders
     SET status               = 'cancelled',
         subtotal             = 0,
         discount_type        = NULL,
         discount_value       = NULL,
         discount_note        = NULL,
         discount_amount      = 0,
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
$function$
;

CREATE OR REPLACE FUNCTION public.reduce_order_item_quantity(p_order_item_id bigint, p_new_quantity integer, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.set_order_service_charge(p_order_id bigint, p_amount numeric, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_total_amount := COALESCE(v_order.subtotal, 0)
                  + COALESCE(v_order.tax_amount, 0)
                  + v_amount
                  - COALESCE(v_order.discount_amount, 0);

  UPDATE public.orders
     SET service_charge = v_amount,
         total_amount   = v_total_amount,
         updated_at     = now()
   WHERE id = p_order_id;

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
$function$
;

CREATE OR REPLACE FUNCTION public.set_pos_order_item_priority(p_order_item_id bigint, p_is_priority boolean, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID;
  v_prof_tenant BIGINT;
  v_prof_branch BIGINT;
  v_prof_role TEXT;
  v_item public.order_items%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_note TEXT;
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

  SELECT * INTO v_item
  FROM public.order_items
  WHERE id = p_order_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_item.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    PERFORM 1
    FROM public.branches b
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

  IF NOT public.has_permission(v_order.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  IF v_item.status NOT IN ('pending', 'preparing') THEN
    RAISE EXCEPTION 'item not prioritizable' USING ERRCODE = '22023';
  END IF;

  v_note := NULLIF(trim(COALESCE(p_note, '')), '');

  UPDATE public.order_items
  SET is_priority = COALESCE(p_is_priority, FALSE),
      priority_note = CASE WHEN COALESCE(p_is_priority, FALSE) THEN v_note ELSE NULL END,
      priority_marked_at = CASE WHEN COALESCE(p_is_priority, FALSE) THEN now() ELSE NULL END,
      priority_marked_by = CASE WHEN COALESCE(p_is_priority, FALSE) THEN v_uid ELSE NULL END,
      updated_at = now()
  WHERE id = p_order_item_id;

  UPDATE public.kds_tickets
  SET updated_at = now()
  WHERE order_item_id = p_order_item_id
    AND tenant_id = v_item.tenant_id
    AND status IN ('pending', 'preparing');

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id,
    v_order.id,
    v_order.status,
    v_order.status,
    v_uid,
    CASE WHEN COALESCE(p_is_priority, FALSE)
      THEN 'priority_item:on '
      ELSE 'priority_item:off '
    END || p_order_item_id::TEXT || COALESCE(' - ' || v_note, '')
  );

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'order_item_id', p_order_item_id,
    'is_priority', COALESCE(p_is_priority, FALSE)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_pos_order_priority(p_order_id bigint, p_is_priority boolean, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID;
  v_prof_tenant BIGINT;
  v_prof_branch BIGINT;
  v_prof_role TEXT;
  v_order public.orders%ROWTYPE;
  v_active_count INT;
  v_note TEXT;
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

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    PERFORM 1
    FROM public.branches b
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

  IF NOT public.has_permission(v_order.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*)::INT INTO v_active_count
  FROM public.order_items
  WHERE order_id = p_order_id
    AND tenant_id = v_order.tenant_id
    AND status IN ('pending', 'preparing');

  IF v_active_count = 0 THEN
    RAISE EXCEPTION 'no active kitchen work' USING ERRCODE = '22023';
  END IF;

  v_note := NULLIF(trim(COALESCE(p_note, '')), '');

  UPDATE public.orders
  SET is_priority = COALESCE(p_is_priority, FALSE),
      priority_note = CASE WHEN COALESCE(p_is_priority, FALSE) THEN v_note ELSE NULL END,
      priority_marked_at = CASE WHEN COALESCE(p_is_priority, FALSE) THEN now() ELSE NULL END,
      priority_marked_by = CASE WHEN COALESCE(p_is_priority, FALSE) THEN v_uid ELSE NULL END,
      updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.kds_tickets kt
  SET updated_at = now()
  WHERE kt.order_id = p_order_id
    AND kt.tenant_id = v_order.tenant_id
    AND kt.status IN ('pending', 'preparing');

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id,
    p_order_id,
    v_order.status,
    v_order.status,
    v_uid,
    CASE WHEN COALESCE(p_is_priority, FALSE)
      THEN 'priority_order:on'
      ELSE 'priority_order:off'
    END || COALESCE(' - ' || v_note, '')
  );

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'is_priority', COALESCE(p_is_priority, FALSE)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.split_order(p_source_order_id bigint, p_item_partials jsonb, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT COALESCE(SUM(subtotal), 0) INTO v_source_subtotal
    FROM public.order_items
   WHERE order_id = p_source_order_id AND status <> 'cancelled';

  v_source_discount := public.compute_discount_amount(
    v_source.discount_type, v_source.discount_value, v_source_subtotal
  );

  v_source_total := v_source_subtotal
                  + COALESCE(v_source.service_charge, 0)
                  - v_source_discount;

  UPDATE public.orders
     SET subtotal        = v_source_subtotal,
         discount_amount = v_source_discount,
         total_amount    = v_source_total,
         updated_at      = now()
   WHERE id = p_source_order_id;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_new_subtotal
    FROM public.order_items
   WHERE order_id = v_new_order_id AND status <> 'cancelled';

  v_new_total := v_new_subtotal;

  UPDATE public.orders
     SET subtotal     = v_new_subtotal,
         total_amount = v_new_total,
         updated_at   = now()
   WHERE id = v_new_order_id;

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
$function$
;

CREATE OR REPLACE FUNCTION public.transfer_order_table(p_order_id bigint, p_new_table_id bigint, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    NULL;
  ELSIF v_prof_branch IS NOT NULL AND v_order.branch_id <> v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  -- Idempotent replay: same key as the last completed transfer on this
  -- order. Returns the order's CURRENT table (post-prior-transfer) with
  -- an `idempotent: true` marker so the action layer can suppress a
  -- duplicate audit toast if it wants. Note this is a per-order replay
  -- check, not a global key-uniqueness check — keys are minted client-
  -- side per click, so a different click on the same order overwrites.
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
    -- Same-table no-op: still record the key so a retry of the same
    -- intent collapses cleanly on subsequent calls.
    UPDATE public.orders
    SET last_transfer_idempotency_key = COALESCE(p_idempotency_key, last_transfer_idempotency_key),
        updated_at = now()
    WHERE id = p_order_id;
    RETURN jsonb_build_object('order_id', p_order_id, 'table_id', p_new_table_id);
  END IF;

  -- Multi-order-per-table alignment: target may be available OR occupied.
  -- Reserved / maintenance still block — those signal bàn is intentionally
  -- unavailable for service.
  IF v_new_table.status NOT IN ('available', 'occupied') THEN
    RAISE EXCEPTION 'table not available' USING ERRCODE = '22023';
  END IF;

  v_old_table_id := v_order.table_id;

  UPDATE public.orders
  SET table_id = p_new_table_id,
      last_transfer_idempotency_key = p_idempotency_key,
      updated_at = now()
  WHERE id = p_order_id;

  -- Idempotent: if target was already occupied, this is a no-op; the bàn
  -- continues to host its prior order(s) plus the freshly transferred one.
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_pos_order_status(p_order_id bigint, p_new_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID;
  v_prof_tenant BIGINT;
  v_prof_branch BIGINT;
  v_prof_role TEXT;
  v_order RECORD;
  v_from_status TEXT;
  v_bad_items INT;
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

  IF p_new_status NOT IN ('served', 'completed') THEN
    RAISE EXCEPTION 'invalid status' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT id, tenant_id, branch_id, status
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

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    NULL;
  ELSIF v_prof_branch IS NOT NULL AND v_order.branch_id <> v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  v_from_status := v_order.status;

  IF p_new_status = 'served' THEN
    IF v_order.status NOT IN ('new', 'confirmed', 'preparing', 'ready') THEN
      RAISE EXCEPTION 'invalid transition to served' USING ERRCODE = '22023';
    END IF;

    -- Same invariant as 'completed': every active item must already be
    -- terminal from the kitchen's perspective. Cashier cannot retire a
    -- ticket the chef is still working on.
    SELECT COUNT(*) INTO v_bad_items
    FROM public.order_items
    WHERE order_id = p_order_id
      AND status NOT IN ('ready', 'served', 'cancelled');

    IF v_bad_items > 0 THEN
      RAISE EXCEPTION 'items not terminal' USING ERRCODE = '22023';
    END IF;

    -- Only flip the rows that still need transitioning. 'served' stays
    -- 'served', 'cancelled' stays 'cancelled' (guard above already proved
    -- nothing is pending/preparing).
    UPDATE public.order_items
    SET status = 'served',
        updated_at = now()
    WHERE order_id = p_order_id
      AND tenant_id = v_order.tenant_id
      AND status = 'ready';

    UPDATE public.kds_tickets
    SET status = 'served',
        bumped_at = COALESCE(bumped_at, now()),
        bumped_by = COALESCE(bumped_by, v_uid),
        updated_at = now()
    WHERE order_id = p_order_id
      AND tenant_id = v_order.tenant_id
      AND status = 'ready';

    UPDATE public.orders
    SET status = 'served', updated_at = now()
    WHERE id = p_order_id;
  ELSIF p_new_status = 'completed' THEN
    IF v_order.status <> 'served' THEN
      RAISE EXCEPTION 'complete requires served' USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(*) INTO v_bad_items
    FROM public.order_items
    WHERE order_id = p_order_id
      AND status NOT IN ('ready', 'served', 'cancelled');

    IF v_bad_items > 0 THEN
      RAISE EXCEPTION 'items not terminal' USING ERRCODE = '22023';
    END IF;

    UPDATE public.orders
    SET status = 'completed', updated_at = now()
    WHERE id = p_order_id;
  END IF;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id, p_order_id, v_from_status, p_new_status, v_uid, 'pos update'
  );

  RETURN jsonb_build_object('order_id', p_order_id, 'status', p_new_status);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.void_order_item(p_order_item_id bigint, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

ALTER FUNCTION public._auth_v2_check_area_scope() SECURITY DEFINER SET search_path = public, extensions, pg_catalog;
ALTER FUNCTION public._auth_v2_check_branch_required() SECURITY DEFINER SET search_path = public, extensions, pg_catalog;
