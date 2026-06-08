-- =========================================================================
-- POS chiết khấu toàn đơn (PR-1 / 3)
--
-- Adds order-level discount UI on top of the existing `orders.discount_amount`
-- column (live since 20260405070000). Cashier picks % or VNĐ + bắt buộc kèm
-- ghi chú; the order recomputes total automatically. No audit table — the
-- per-change row in `order_status_history` is the audit trail.
--
-- Design decisions (from 4-agent debate, owner-approved 2026-04-26):
--   - Q3 STORE PERCENT: when type='pct' the value (e.g. 10) is what we keep;
--     `discount_amount` (VND) is RE-DERIVED from current subtotal on every
--     mutation (append item, void item, cancel order). Owner reasoning:
--     "discount is on the bill, not the dish — if you want a fixed VND
--     amount, type that VND amount."  Helper `compute_discount_amount`
--     centralises the math so 4 RPCs stay in lock-step.
--   - Q1 AUTO-CLAMP: pct value clamped to 100; vnd value clamped to subtotal.
--     UI does the same so the cashier sees the corrected number live; server
--     re-clamps as defense-in-depth (URL manipulation, stale UI).
--   - Q5 ZERO-TOTAL: `confirm_cash_payment` now allows cash_received=0 when
--     total_amount=0 (e.g. employee meal at 100% discount). Cashier still
--     touches "Đã thanh toán" — payment row written with amount=0 + method
--     = 'cash' for audit consistency, no cash drawer pop expected.
--   - C1 NO PERMISSION TIER: any pos:use holder can discount any amount.
--     Owner explicitly rejected manager-approval for >15% — this is a
--     1-cashier quán cơm tấm; the friction would dwarf the fraud risk.
--
-- Files touched / patched in this migration:
--   - orders: ADD COLUMN discount_type, discount_value, discount_note
--   - NEW   compute_discount_amount(type, value, subtotal) -> NUMERIC helper
--   - NEW   apply_order_discount(order_id, type, value, note) -> JSONB
--   - NEW   clear_order_discount(order_id) -> JSONB
--   - PATCH append_order_items  — recompute discount_amount via helper
--   - PATCH void_order_item     — recompute discount_amount via helper
--   - PATCH cancel_order        — recompute discount_amount via helper
--   - PATCH confirm_cash_payment — allow cash=0 when total=0
--   - NEW   feature flag system_settings.pos_discount_enabled (default true)
-- =========================================================================

-- ─── 1. Schema ──────────────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount_type  TEXT
    CHECK (discount_type IS NULL OR discount_type IN ('pct', 'vnd')),
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC(15,2)
    CHECK (discount_value IS NULL OR discount_value >= 0),
  ADD COLUMN IF NOT EXISTS discount_note  TEXT;

COMMENT ON COLUMN public.orders.discount_type  IS
  'Loại chiết khấu: ''pct'' (theo %) hoặc ''vnd'' (số tiền cố định). NULL khi không có giảm.';
COMMENT ON COLUMN public.orders.discount_value IS
  'Giá trị gốc cashier nhập (10 cho 10%, 15000 cho 15.000đ). discount_amount là số tiền VND đã re-derive.';
COMMENT ON COLUMN public.orders.discount_note  IS
  'Ghi chú lý do giảm giá (>= 3 ký tự sau trim). Bắt buộc khi có giảm.';

-- Cross-field invariant: 4 trường discount đi cùng nhau hoặc đồng thời NULL/0.
-- Tránh trạng thái nửa vời (vd discount_amount > 0 mà thiếu note → mất audit).
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_discount_metadata_paired;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_discount_metadata_paired CHECK (
    (discount_amount = 0
       AND discount_type  IS NULL
       AND discount_value IS NULL
       AND discount_note  IS NULL)
    OR
    (discount_amount > 0
       AND discount_type  IS NOT NULL
       AND discount_value IS NOT NULL
       AND discount_note  IS NOT NULL
       AND length(trim(discount_note)) >= 3)
  );


-- ─── 2. Feature flag ────────────────────────────────────────────────────

INSERT INTO public.system_settings (tenant_id, key, value, description)
SELECT t.id, 'pos_discount_enabled', 'true',
       'Feature flag: bật UI chiết khấu toàn đơn. Set ''false'' để kill switch.'
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_settings
  WHERE tenant_id = t.id AND key = 'pos_discount_enabled'
);


-- ─── 3. Helper: compute_discount_amount ─────────────────────────────────
--
-- Một-điểm-vào duy nhất tính ra số tiền giảm theo VND. Mọi RPC chạm
-- `discount_amount` đều phải gọi qua đây để 'pct' tự re-derive khi subtotal
-- đổi và 'vnd' tự clamp khi void món làm subtotal nhỏ hơn giá trị giảm.
--
-- IMMUTABLE + STRICT: PG có thể inline trong CASE và planner cache giá trị.
-- Trả NUMERIC nguyên (FLOOR cho %) — VND không có phần lẻ, máy in nhiệt
-- cũng không hiển thị nhất quán với .5đ.

CREATE OR REPLACE FUNCTION public.compute_discount_amount(
  p_type     TEXT,
  p_value    NUMERIC,
  p_subtotal NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_subtotal NUMERIC := COALESCE(p_subtotal, 0);
  v_value    NUMERIC := COALESCE(p_value, 0);
BEGIN
  IF p_type IS NULL OR v_value <= 0 OR v_subtotal <= 0 THEN
    RETURN 0;
  END IF;

  IF p_type = 'pct' THEN
    -- Clamp pct to [0,100]; FLOOR nguyên VND.
    RETURN FLOOR(v_subtotal * LEAST(v_value, 100) / 100);
  ELSIF p_type = 'vnd' THEN
    -- Clamp tiền giảm về subtotal (void món xong, vnd-discount cũ có thể
    -- vượt subtotal mới — kéo về subtotal để total_amount không âm).
    RETURN LEAST(v_value, v_subtotal);
  END IF;

  RETURN 0;
END;
$$;

COMMENT ON FUNCTION public.compute_discount_amount(TEXT, NUMERIC, NUMERIC) IS
  'Single source of truth for discount math. pct => FLOOR(subtotal*pct/100) clamped to subtotal; '
  'vnd => LEAST(value, subtotal). NULL/0 inputs => 0. Called by apply_order_discount, '
  'append_order_items, void_order_item, cancel_order on every recalc path.';


-- ─── 4. apply_order_discount (NEW) ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.apply_order_discount(
  p_order_id BIGINT,
  p_type     TEXT,
  p_value    NUMERIC,
  p_note     TEXT
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
  v_clamped_value   NUMERIC(15,2);
  v_discount_amount NUMERIC(15,2);
  v_total_amount    NUMERIC(15,2);
  v_note_trim       TEXT;
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
$$;

REVOKE ALL ON FUNCTION public.apply_order_discount(BIGINT, TEXT, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_order_discount(BIGINT, TEXT, NUMERIC, TEXT) TO authenticated;

COMMENT ON FUNCTION public.apply_order_discount(BIGINT, TEXT, NUMERIC, TEXT) IS
  'Set order-level discount (% or VND) with required note (>=3 chars). '
  'Auto-clamps pct to 100 and vnd to subtotal. Recomputes discount_amount + '
  'total_amount via compute_discount_amount helper. Blocks on paid/terminal '
  'orders. Inserts audit row to order_status_history.';


-- ─── 5. clear_order_discount (NEW) ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.clear_order_discount(
  p_order_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT p.tenant_id, p.branch_id, COALESCE(po.legacy_role_code, 'office')
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
$$;

REVOKE ALL ON FUNCTION public.clear_order_discount(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_order_discount(BIGINT) TO authenticated;


-- ─── 6. PATCH append_order_items — recompute discount via helper ────────
--
-- Body identical to 20260429000000_append_order_items_idempotency.sql except:
--   - Pulls discount_type + discount_value from the locked order row.
--   - Recomputes discount_amount via compute_discount_amount(type, value,
--     v_subtotal) so a pct discount stays at e.g. 10% of NEW subtotal, and
--     a vnd discount auto-clamps if subtotal grew/shrank.
--   - Persists the recomputed discount_amount back to orders (so receipt
--     and confirm_cash_payment see the right number on the next read).

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
  v_discount_amount NUMERIC(15,2);
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

  -- Note: select discount_type + discount_value (NOT discount_amount) since
  -- we re-derive amount below from the new subtotal.
  SELECT o.id, o.tenant_id, o.branch_id, o.status, o.service_charge,
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

  -- Re-derive discount on NEW subtotal. pct keeps its rate; vnd auto-clamps.
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


-- ─── 7. PATCH void_order_item — recompute discount via helper ───────────

CREATE OR REPLACE FUNCTION public.void_order_item(
  p_order_item_id BIGINT,
  p_reason TEXT
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

  SELECT p.tenant_id, p.branch_id, COALESCE(po.legacy_role_code, 'office')
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
    -- Auto-cancel of the whole order: subtotal goes to 0, so the discount
    -- collapses to 0 too via the helper (pct of 0 = 0; vnd clamped to 0).
    -- Persist the recomputed amount so total_amount can never go negative.
    v_discount_amount := public.compute_discount_amount(
      v_order.discount_type, v_order.discount_value, 0
    );

    UPDATE public.orders
    SET
      status          = 'cancelled',
      subtotal        = 0,
      discount_amount = v_discount_amount,
      total_amount    = 0 + COALESCE(service_charge, 0) - v_discount_amount,
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

REVOKE ALL ON FUNCTION public.void_order_item(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_order_item(BIGINT, TEXT) TO authenticated;


-- ─── 8. PATCH cancel_order — recompute discount via helper ──────────────

CREATE OR REPLACE FUNCTION public.cancel_order(
  p_order_id BIGINT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid              UUID;
  v_prof_tenant      BIGINT;
  v_prof_branch      BIGINT;
  v_prof_role        TEXT;
  v_order            RECORD;
  v_item_id          BIGINT;
  v_print_res        JSONB;
  v_discount_amount  NUMERIC(15,2);
  v_tickets_enqueued INT := 0;
  v_tickets_skipped  INT := 0;
  v_skip_reasons     TEXT[] := ARRAY[]::TEXT[];
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

  -- Subtotal goes to 0 → discount also collapses to 0 (helper handles it).
  v_discount_amount := public.compute_discount_amount(
    v_order.discount_type, v_order.discount_value, 0
  );

  UPDATE public.orders
  SET
    status          = 'cancelled',
    subtotal        = 0,
    discount_amount = v_discount_amount,
    total_amount    = 0 + COALESCE(service_charge, 0) - v_discount_amount,
    updated_at      = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id, p_order_id, v_order.status, 'cancelled', v_uid, p_reason
  );

  -- Cancel-ticket fanout (unchanged from 20260427000000_cancel_ticket_print).
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

REVOKE ALL ON FUNCTION public.cancel_order(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_order(BIGINT, TEXT) TO authenticated;


-- ─── 9. PATCH confirm_cash_payment — allow cash=0 when total=0 ──────────
--
-- Body identical to 20260428210000_pos_confirm_payment_permission.sql except:
--   - `cash_received < total_amount` guard now allows 0/0 case so cashier
--     can confirm "Đã thanh toán" trên đơn 100% discount (e.g. nhân viên
--     ăn miễn phí, đền khách 100%) without the under-payment block.
--   - Sanity upper-bound also tweaked: when total=0, accept cash up to a
--     small literal floor (50.000.000đ — protects against stray typo) so
--     `total*10 = 0` doesn't reject a non-zero accidentally.
--   - Both branches of payment-row reuse stamp amount=total_amount, which
--     is 0 in this case — payments row keeps a faithful audit (method=cash,
--     amount=0, status=completed). Reports treat it as a comp.

CREATE OR REPLACE FUNCTION public.confirm_cash_payment(
  p_order_id       bigint,
  p_cash_received  numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          UUID;
  v_order        public.orders%ROWTYPE;
  v_existing_id  BIGINT;
  v_existing_st  TEXT;
  v_payment_id   BIGINT;
  v_cash_change  NUMERIC(15,2);
  v_complete_res RECORD;
  v_receipt_res  JSONB;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('pos:confirm_payment') THEN
    RAISE EXCEPTION 'permission denied: pos:confirm_payment' USING ERRCODE = '42501';
  END IF;

  -- Under-payment guard. Allow cash=0 ONLY when total=0 (100% discount /
  -- comp meal). Otherwise still hard-block — cashier must collect at least
  -- the printed total.
  IF p_cash_received IS NULL THEN
    RAISE EXCEPTION 'cash_received required' USING ERRCODE = 'P0001';
  END IF;
  IF p_cash_received < v_order.total_amount THEN
    RAISE EXCEPTION 'cash_received (%) must be >= total_amount (%)',
      p_cash_received, v_order.total_amount
      USING ERRCODE = 'P0001';
  END IF;

  -- Sanity upper bound (typo guard). When total=0 we still allow up to the
  -- literal 50M floor so 0/0 confirms cleanly.
  IF p_cash_received > GREATEST(v_order.total_amount * 10, 50000000) THEN
    RAISE EXCEPTION 'cash_received (%) exceeds sane upper bound for total (%)',
      p_cash_received, v_order.total_amount
      USING ERRCODE = 'P0001';
  END IF;

  v_cash_change := p_cash_received - v_order.total_amount;

  SELECT id, status INTO v_existing_id, v_existing_st
  FROM public.payments
  WHERE order_id = p_order_id
    AND status <> 'failed'
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_st = 'completed' THEN
    v_payment_id := v_existing_id;
  ELSIF v_existing_id IS NOT NULL THEN
    UPDATE public.payments
       SET method        = 'cash',
           amount        = v_order.total_amount,
           status        = 'pending',
           provider_ref  = NULL,
           provider_data = NULL,
           updated_at    = now()
     WHERE id = v_existing_id;
    v_payment_id := v_existing_id;
  ELSE
    INSERT INTO public.payments (
      tenant_id, branch_id, order_id, method, amount, status, created_by
    ) VALUES (
      v_order.tenant_id, v_order.branch_id, p_order_id, 'cash',
      v_order.total_amount, 'pending', v_uid
    )
    RETURNING id INTO v_payment_id;
  END IF;

  UPDATE public.orders
     SET payment_method = 'cash',
         updated_at     = now()
   WHERE id = p_order_id;

  IF v_existing_st = 'completed' THEN
    RETURN jsonb_build_object(
      'order_id',      p_order_id,
      'payment_id',    v_payment_id,
      'cash_received', COALESCE(v_order.cash_received, p_cash_received),
      'cash_change',   COALESCE(v_order.cash_change, v_cash_change),
      'print_job_id',  NULL,
      'idempotent',    true
    );
  END IF;

  SELECT * INTO v_complete_res
  FROM public.complete_payment_and_consume_stock(
    v_payment_id,
    v_order.total_amount,
    jsonb_build_object('cash_received', p_cash_received, 'cash_change', v_cash_change),
    v_uid
  );

  IF v_complete_res.status NOT IN ('completed', 'already_completed') THEN
    RAISE EXCEPTION 'payment completion failed: % (detail: %)',
      v_complete_res.status, v_complete_res.detail
      USING ERRCODE = 'P0001';
  END IF;

  v_receipt_res := public.enqueue_receipt_print(
    p_order_id,
    p_cash_received,
    v_cash_change
  );

  RETURN jsonb_build_object(
    'order_id',      p_order_id,
    'payment_id',    v_payment_id,
    'cash_received', p_cash_received,
    'cash_change',   v_cash_change,
    'print_job_id',  v_receipt_res->>'job_id'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.confirm_cash_payment(bigint, numeric) TO authenticated;
