-- =============================================================
-- Security Hardening S2
-- Fixes identified in post-M3/M4 code review.
--
-- CRITICAL
--   C1: create_payment — derive identity from JWT; add role check
--   C2: create_order   — ignore caller-supplied p_created_by; use auth.uid()
--
-- HIGH
--   H1: orders + order_items SELECT — add branch scope
--   H2: payments SELECT            — add branch scope
--   H3: admin_update_profile       — restore p_role enum validation + branch integrity
--   H4: bump_kds_ticket / recall_kds_ticket — NULL branch for tenant-wide roles
--
-- MEDIUM
--   M1: close_pos_session          — NULL branch for tenant-wide roles
--   M2: stale policy names         — drop old initial_schema policies now superseded
--   M3: kds_tickets GRANT          — revoke DELETE (no DELETE policy exists)
--   M4: tax_invoices SELECT        — add 'office' role
--
-- LOW
--   L1: tenants GRANT              — restrict to SELECT only
-- =============================================================


-- ════════════════════════════════════════════════════════════
-- C1: create_payment — JWT-derived identity, role check
-- ════════════════════════════════════════════════════════════
--
-- Old signature accepted p_tenant_id, p_branch_id, p_created_by from caller
-- (SECURITY DEFINER, so they were trusted). We now ignore those params and
-- derive everything from the verified JWT so callers cannot forge identity or
-- access other branches.
--
-- Signature is kept compatible (same param names, same order) to avoid
-- breaking existing GRANT; the parameter values are intentionally overridden
-- inside the function body.

CREATE OR REPLACE FUNCTION public.create_payment(
  p_tenant_id   BIGINT,           -- IGNORED — derived from JWT
  p_branch_id   BIGINT,           -- IGNORED — derived from JWT
  p_order_id    BIGINT,
  p_method      TEXT,
  p_amount      NUMERIC(15,2),
  p_created_by  UUID,             -- IGNORED — derived from JWT
  p_provider_ref TEXT DEFAULT NULL,
  p_status      TEXT  DEFAULT 'pending'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id    BIGINT;
  v_branch_id    BIGINT;
  v_created_by   UUID;
  v_order        RECORD;
  v_payment_id   BIGINT;
  v_final_status TEXT;
BEGIN
  -- ── Auth guard ──────────────────────────────────────────
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  -- ── Role check ──────────────────────────────────────────
  -- Only roles that handle POS transactions may create payments.
  IF public.auth_role() NOT IN (
      'owner', 'super_manager', 'area_manager',
      'branch_manager', 'cashier', 'waiter'
  ) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = 'P0003';
  END IF;

  -- ── Derive identity from JWT — caller-supplied values are discarded ──
  v_tenant_id  := public.auth_tenant_id();
  v_branch_id  := public.auth_branch_id();
  v_created_by := auth.uid();

  -- ── Validate method ──────────────────────────────────────
  IF p_method NOT IN ('cash', 'vietqr', 'momo') THEN
    RAISE EXCEPTION 'invalid payment method: %', p_method USING ERRCODE = '22023';
  END IF;

  -- ── Lock order row — scoped to caller's tenant + branch ──
  -- For tenant-wide roles (owner, super_manager, area_manager) v_branch_id
  -- is NULL; we skip the branch filter so they can operate across branches.
  SELECT id, total_amount, payment_status, branch_id, tenant_id
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = v_tenant_id
    AND (v_branch_id IS NULL OR branch_id = v_branch_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- ── Business rules ───────────────────────────────────────
  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'order_already_paid' USING ERRCODE = 'P0001';
  END IF;

  IF p_amount <> v_order.total_amount THEN
    RAISE EXCEPTION 'amount_mismatch: expected % got %', v_order.total_amount, p_amount
      USING ERRCODE = '22023';
  END IF;

  -- ── Determine final status ───────────────────────────────
  v_final_status := CASE
    WHEN p_method = 'cash' THEN 'completed'
    ELSE COALESCE(p_status, 'pending')
  END;

  -- ── Insert payment ───────────────────────────────────────
  -- Use the order's actual branch_id as the authoritative value so that
  -- tenant-wide roles (owner etc.) always produce a correctly scoped record.
  INSERT INTO public.payments (
    tenant_id, branch_id, order_id, method, amount, status,
    provider_ref, paid_at, created_by
  ) VALUES (
    v_order.tenant_id,
    v_order.branch_id,   -- authoritative, from locked order row
    p_order_id,
    p_method,
    p_amount,
    v_final_status,
    p_provider_ref,
    CASE WHEN v_final_status = 'completed' THEN now() ELSE NULL END,
    v_created_by          -- auth.uid(), not p_created_by
  )
  RETURNING id INTO v_payment_id;

  -- ── Update order payment info atomically ─────────────────
  UPDATE public.orders
  SET payment_method  = p_method,
      payment_status  = CASE WHEN v_final_status = 'completed' THEN 'paid' ELSE 'pending' END,
      updated_at      = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'status',     v_final_status
  );
END;
$$;

-- GRANT is unchanged — same signature as before.
REVOKE ALL ON FUNCTION public.create_payment(BIGINT, BIGINT, BIGINT, TEXT, NUMERIC, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_payment(BIGINT, BIGINT, BIGINT, TEXT, NUMERIC, UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_payment(BIGINT, BIGINT, BIGINT, TEXT, NUMERIC, UUID, TEXT, TEXT) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- C2: create_order — ignore caller-supplied p_created_by
-- ════════════════════════════════════════════════════════════
--
-- SECURITY INVOKER means RLS applies, but p_created_by was still used
-- verbatim in the INSERT and status-history rows, allowing a caller to
-- forge another user's identity.  Override with auth.uid() internally.
-- Signature is kept identical to avoid breaking the existing GRANT.

CREATE OR REPLACE FUNCTION public.create_order(
  p_tenant_id      BIGINT,
  p_branch_id      BIGINT,
  p_created_by     UUID,           -- IGNORED — overridden with auth.uid()
  p_items          JSONB,
  p_order_type     TEXT    DEFAULT 'dine_in',
  p_table_id       BIGINT  DEFAULT NULL,
  p_pos_session_id BIGINT  DEFAULT NULL,
  p_customer_count INT     DEFAULT 1,
  p_note           TEXT    DEFAULT NULL
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
  -- ── Override caller-supplied identity ────────────────────
  v_created_by := auth.uid();
  IF v_created_by IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  -- ── Validate inputs ──────────────────────────────────────
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items must be a non-empty JSON array' USING ERRCODE = '22023';
  END IF;

  IF p_order_type NOT IN ('dine_in', 'takeaway') THEN
    RAISE EXCEPTION 'p_order_type must be dine_in or takeaway' USING ERRCODE = '22023';
  END IF;

  -- ── Validate table belongs to branch ────────────────────
  IF p_table_id IS NOT NULL THEN
    PERFORM 1 FROM public.tables
    WHERE id = p_table_id AND branch_id = p_branch_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Table does not belong to this branch' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- ── Validate session belongs to branch and is open ───────
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

  -- ── Advisory lock — prevent order_number race condition ──
  PERFORM pg_advisory_xact_lock(p_branch_id);

  -- ── Generate order_number: {branch_id}-{YYMMDD}-{NNN} ───
  SELECT COUNT(*) + 1 INTO v_seq
  FROM public.orders
  WHERE branch_id = p_branch_id
    AND tenant_id = p_tenant_id
    AND created_at::date = CURRENT_DATE;

  v_order_number := p_branch_id::TEXT
    || '-' || to_char(CURRENT_DATE, 'YYMMDD')
    || '-' || lpad(v_seq::TEXT, 3, '0');

  -- ── Insert order header ──────────────────────────────────
  INSERT INTO public.orders (
    tenant_id, branch_id, table_id, order_number, order_type,
    subtotal, total_amount, customer_count, note, created_by,
    pos_session_id
  )
  VALUES (
    p_tenant_id, p_branch_id, p_table_id, v_order_number, p_order_type,
    0, 0, p_customer_count, p_note, v_created_by,   -- v_created_by, not p_created_by
    p_pos_session_id
  )
  RETURNING id INTO v_order_id;

  -- ── Server-side price verification ───────────────────────
  -- Client-supplied unit_price and subtotal are intentionally ignored.
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

  -- ── Update order totals ──────────────────────────────────
  UPDATE public.orders
  SET subtotal = v_subtotal, total_amount = v_subtotal
  WHERE id = v_order_id;

  -- ── Insert initial status history ────────────────────────
  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by
  )
  VALUES (p_tenant_id, v_order_id, NULL, 'new', v_created_by);   -- v_created_by

  -- ── Mark table occupied for dine-in ─────────────────────
  IF p_order_type = 'dine_in' AND p_table_id IS NOT NULL THEN
    UPDATE public.tables
    SET status = 'occupied'
    WHERE id = p_table_id AND branch_id = p_branch_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Failed to update table status' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- ── Route to KDS ─────────────────────────────────────────
  PERFORM public.route_order_to_kds(v_order_id);

  RETURN jsonb_build_object(
    'order_id',     v_order_id,
    'order_number', v_order_number
  );
END;
$$;

-- Re-grant (signature unchanged)
GRANT EXECUTE ON FUNCTION public.create_order(BIGINT, BIGINT, UUID, JSONB, TEXT, BIGINT, BIGINT, INT, TEXT) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- H1: orders + order_items SELECT — add branch scope
-- ════════════════════════════════════════════════════════════
--
-- The original "tenant_select" allowed any authenticated user to read ALL
-- orders across every branch in their tenant.  Branch-level roles (cashier,
-- waiter, chef) should only see orders from their own branch.

DROP POLICY IF EXISTS "tenant_select" ON public.orders;
CREATE POLICY "orders_select" ON public.orders
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_branch_id() IS NULL          -- tenant-wide roles see all branches
      OR branch_id = public.auth_branch_id()   -- branch-level roles see own branch
    )
  );

-- order_items: same logic; join via parent order branch_id
DROP POLICY IF EXISTS "tenant_select" ON public.order_items;
CREATE POLICY "order_items_select" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_branch_id() IS NULL
      OR EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_items.order_id
          AND o.branch_id = public.auth_branch_id()
          AND o.tenant_id = order_items.tenant_id
      )
    )
  );

-- order_status_history: same pattern
DROP POLICY IF EXISTS "tenant_select" ON public.order_status_history;
CREATE POLICY "order_status_history_select" ON public.order_status_history
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_branch_id() IS NULL
      OR EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_status_history.order_id
          AND o.branch_id = public.auth_branch_id()
          AND o.tenant_id = order_status_history.tenant_id
      )
    )
  );


-- ════════════════════════════════════════════════════════════
-- H2: payments SELECT — add branch scope
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "payments_select" ON public.payments;
CREATE POLICY "payments_select" ON public.payments
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_branch_id() IS NULL
      OR branch_id = public.auth_branch_id()
    )
  );


-- ════════════════════════════════════════════════════════════
-- H3: admin_update_profile — restore enum validation + branch integrity
-- ════════════════════════════════════════════════════════════
--
-- The function already contains correct actor-scope permission logic.
-- Two checks were missing:
--   a) p_role TEXT is not validated against the allowed enum values.
--      A caller could pass any string and the UPDATE would silently coerce
--      or fail with a cryptic Postgres error.
--   b) Operational roles (cashier/waiter/chef/branch_manager) must always
--      have a branch_id.  That was enforced at the DB CHECK constraint level
--      but not proactively by the function, so the error message was opaque.
--
-- Full function re-declared with both guards inserted at the top of the body.

CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_target_id UUID,
  p_full_name TEXT    DEFAULT NULL,
  p_phone     TEXT    DEFAULT NULL,
  p_role      TEXT    DEFAULT NULL,
  p_branch_id BIGINT  DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id     UUID;
  v_actor_role   TEXT;
  v_actor_tenant BIGINT;
  v_actor_branch BIGINT;
  v_actor_area   BIGINT;
  v_target       RECORD;
  v_final_role   TEXT;
  v_final_branch BIGINT;
BEGIN
  v_actor_id     := auth.uid();
  v_actor_role   := public.auth_role();
  v_actor_tenant := public.auth_tenant_id();
  v_actor_branch := public.auth_branch_id();
  v_actor_area   := public.auth_area_id();

  -- ── H3a: Validate p_role against the staff_role enum ────
  IF p_role IS NOT NULL AND p_role NOT IN (
      'owner', 'super_manager', 'area_manager',
      'branch_manager', 'cashier', 'waiter', 'chef', 'office'
  ) THEN
    RAISE EXCEPTION 'invalid_role: %', p_role USING ERRCODE = '22023';
  END IF;

  -- ── Fetch target profile ─────────────────────────────────
  SELECT id, role, branch_id, full_name, phone, tenant_id
    INTO v_target
    FROM public.profiles
    WHERE id = p_target_id AND tenant_id = v_actor_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target profile not found in tenant';
  END IF;

  -- ── Compute final values ─────────────────────────────────
  v_final_role   := COALESCE(p_role,      v_target.role::TEXT);
  v_final_branch := COALESCE(p_branch_id, v_target.branch_id);

  -- ── H3b: Operational roles require a branch ─────────────
  IF v_final_role IN ('cashier', 'waiter', 'chef', 'branch_manager')
     AND v_final_branch IS NULL
  THEN
    RAISE EXCEPTION 'branch_required_for_operational_role' USING ERRCODE = 'P0001';
  END IF;

  -- ════ ACTOR PERMISSION CHECKS ════

  IF v_actor_role = 'owner' THEN
    NULL; -- unrestricted

  ELSIF v_actor_role = 'super_manager' THEN
    IF v_target.role = 'owner' OR v_final_role = 'owner' THEN
      RAISE EXCEPTION 'super_manager cannot modify owner';
    END IF;

  ELSIF v_actor_role = 'area_manager' THEN
    IF v_target.role::TEXT IN ('owner', 'super_manager', 'area_manager') THEN
      RAISE EXCEPTION 'area_manager cannot modify owner/super_manager/peer area_manager';
    END IF;
    IF v_final_role IN ('owner', 'super_manager', 'area_manager') THEN
      RAISE EXCEPTION 'area_manager cannot set role above branch_manager';
    END IF;
    IF v_target.branch_id IS NOT NULL THEN
      PERFORM 1 FROM public.area_branches
      WHERE area_id = v_actor_area
        AND branch_id = v_target.branch_id
        AND tenant_id = v_actor_tenant;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'area_manager: target not in your area branches';
      END IF;
    END IF;
    IF v_final_branch IS NOT NULL THEN
      PERFORM 1 FROM public.area_branches
      WHERE area_id = v_actor_area
        AND branch_id = v_final_branch
        AND tenant_id = v_actor_tenant;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'area_manager: target branch not in your area';
      END IF;
    END IF;

  ELSIF v_actor_role = 'branch_manager' THEN
    IF v_target.branch_id IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager: target not in your branch';
    END IF;
    IF v_target.role::TEXT = 'branch_manager' THEN
      RAISE EXCEPTION 'branch_manager cannot modify peer branch_manager';
    END IF;
    IF v_final_role NOT IN ('cashier', 'waiter', 'chef') THEN
      RAISE EXCEPTION 'branch_manager can only assign cashier/waiter/chef';
    END IF;
    IF v_final_branch IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager cannot reassign to other branch';
    END IF;

  ELSE
    RAISE EXCEPTION 'insufficient privileges for profile management';
  END IF;

  -- ════ APPLY UPDATE ════

  UPDATE public.profiles
  SET
    full_name  = COALESCE(p_full_name, full_name),
    phone      = COALESCE(p_phone, phone),
    role       = v_final_role::public.staff_role,
    branch_id  = v_final_branch,
    updated_at = now()
  WHERE id = p_target_id AND tenant_id = v_actor_tenant;

  -- Sync auth metadata so the next JWT reflects changes
  IF p_role IS NOT NULL AND p_role <> v_target.role::TEXT THEN
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data
      || jsonb_build_object('user_role', v_final_role)
    WHERE id = p_target_id;
  END IF;

  IF p_branch_id IS NOT NULL AND p_branch_id IS DISTINCT FROM v_target.branch_id THEN
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data
      || jsonb_build_object('branch_id', v_final_branch)
    WHERE id = p_target_id;
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- H4: bump_kds_ticket + recall_kds_ticket — NULL branch fix
-- ════════════════════════════════════════════════════════════
--
-- Both RPCs filter tickets with `branch_id = public.auth_branch_id()`.
-- When auth_branch_id() returns NULL (owner/super_manager/area_manager)
-- that comparison is NULL = NULL → false, so the ticket is never found
-- and the function raises 'Ticket not found'.
-- Fix: allow NULL branch to match any branch (tenant-wide roles).

CREATE OR REPLACE FUNCTION public.bump_kds_ticket(p_ticket_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_ticket    RECORD;
  v_new_status TEXT;
BEGIN
  -- Fetch and lock ticket — NULL branch means tenant-wide access
  SELECT id, tenant_id, branch_id, station_id, order_id, status
  INTO v_ticket
  FROM public.kds_tickets
  WHERE id = p_ticket_id
    AND tenant_id = public.auth_tenant_id()
    AND (public.auth_branch_id() IS NULL OR branch_id = public.auth_branch_id())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  -- Determine next status
  IF v_ticket.status = 'pending' THEN
    v_new_status := 'preparing';
  ELSIF v_ticket.status = 'preparing' THEN
    v_new_status := 'ready';
  ELSE
    RAISE EXCEPTION 'Ticket cannot be bumped from status %', v_ticket.status
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.kds_tickets
  SET status    = v_new_status,
      bumped_at = now(),
      bumped_by = auth.uid()
  WHERE id = p_ticket_id;

  -- If bumped to 'ready', check if the entire order is ready
  IF v_new_status = 'ready' THEN
    PERFORM public.check_order_ready(v_ticket.order_id);
  END IF;

  RETURN v_new_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_kds_ticket(BIGINT) TO authenticated;


CREATE OR REPLACE FUNCTION public.recall_kds_ticket(p_ticket_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_ticket     RECORD;
  v_new_status TEXT;
BEGIN
  -- Fetch and lock ticket — NULL branch means tenant-wide access
  SELECT id, tenant_id, branch_id, status
  INTO v_ticket
  FROM public.kds_tickets
  WHERE id = p_ticket_id
    AND tenant_id = public.auth_tenant_id()
    AND (public.auth_branch_id() IS NULL OR branch_id = public.auth_branch_id())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_ticket.status = 'ready' THEN
    v_new_status := 'preparing';
  ELSIF v_ticket.status = 'preparing' THEN
    v_new_status := 'pending';
  ELSE
    RAISE EXCEPTION 'Ticket cannot be recalled from status %', v_ticket.status
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.kds_tickets
  SET status    = v_new_status,
      bumped_at = NULL,
      bumped_by = NULL
  WHERE id = p_ticket_id;

  RETURN v_new_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recall_kds_ticket(BIGINT) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- M1: close_pos_session — NULL branch for tenant-wide roles
-- ════════════════════════════════════════════════════════════
--
-- The current function requires `branch_id = public.auth_branch_id()` in
-- the FOR UPDATE query.  When auth_branch_id() is NULL (owner etc.) the
-- session is never found.  Apply the same NULL-branch pattern.

CREATE OR REPLACE FUNCTION public.close_pos_session(
  p_session_id   BIGINT,
  p_closing_cash NUMERIC(15,2),
  p_note         TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_session         RECORD;
  v_expected_cash   NUMERIC(15,2);
  v_cash_difference NUMERIC(15,2);
  v_order_count     INT;
  v_closed_by       UUID;
BEGIN
  -- Validate
  IF p_closing_cash IS NULL OR p_closing_cash < 0 THEN
    RAISE EXCEPTION 'closing_cash must be non-negative' USING ERRCODE = '22023';
  END IF;

  v_closed_by := auth.uid();

  -- Lock and fetch session — NULL branch allows tenant-wide roles
  SELECT id, tenant_id, branch_id, opening_cash, opened_at, status
  INTO v_session
  FROM public.pos_sessions
  WHERE id = p_session_id
    AND tenant_id = public.auth_tenant_id()
    AND (public.auth_branch_id() IS NULL OR branch_id = public.auth_branch_id())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Session is already closed' USING ERRCODE = 'P0001';
  END IF;

  -- Calculate expected cash
  SELECT COUNT(*), COALESCE(SUM(total_amount), 0)
  INTO v_order_count, v_expected_cash
  FROM public.orders
  WHERE pos_session_id = p_session_id
    AND status NOT IN ('cancelled');

  v_expected_cash   := v_session.opening_cash + v_expected_cash;
  v_cash_difference := p_closing_cash - v_expected_cash;

  -- Close session
  UPDATE public.pos_sessions
  SET
    status          = 'closed',
    closed_at       = now(),
    closed_by       = v_closed_by,
    closing_cash    = p_closing_cash,
    expected_cash   = v_expected_cash,
    cash_difference = v_cash_difference,
    note            = p_note
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'session_id',    p_session_id,
    'opening_cash',  v_session.opening_cash,
    'closing_cash',  p_closing_cash,
    'expected_cash', v_expected_cash,
    'cash_difference', v_cash_difference,
    'order_count',   v_order_count,
    'opened_at',     v_session.opened_at,
    'closed_at',     now()
  );
END;
$$;


-- ════════════════════════════════════════════════════════════
-- M2: stale RLS policy names — drop old initial_schema policies
-- ════════════════════════════════════════════════════════════
--
-- 20260401000000_initial_schema.sql created these two policies.
-- They were superseded by 20260406220000_area_manager_scoping.sql
-- but the DROP only targeted specific names that matched the newer
-- policy style. The original verbatim names may still exist.

DROP POLICY IF EXISTS "Users can view branches in their tenant" ON public.branches;
DROP POLICY IF EXISTS "Users can view profiles branch-scoped"  ON public.profiles;


-- ════════════════════════════════════════════════════════════
-- M3: kds_tickets — revoke DELETE (no DELETE policy exists)
-- ════════════════════════════════════════════════════════════
--
-- 20260407110000_kds_tickets.sql granted SELECT, INSERT, UPDATE, DELETE.
-- No DELETE policy was ever created, so the GRANT is dead weight and
-- creates a false impression that DELETE is intended.

REVOKE DELETE ON TABLE public.kds_tickets FROM authenticated;


-- ════════════════════════════════════════════════════════════
-- M4: tax_invoices SELECT — add 'office' role
-- ════════════════════════════════════════════════════════════
--
-- Office staff need read access to tax invoices for finance/reporting work.
-- The original policy omitted 'office'.  Also tightens to branch-scope
-- for branch-level roles, consistent with orders/payments fix above.

DROP POLICY IF EXISTS "tax_invoices_select" ON public.tax_invoices;
CREATE POLICY "tax_invoices_select" ON public.tax_invoices
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN (
        'owner', 'super_manager', 'area_manager', 'office',
        'branch_manager', 'cashier', 'waiter'
    )
    AND (
      public.auth_branch_id() IS NULL          -- tenant-wide roles see all
      OR branch_id = public.auth_branch_id()   -- branch-level roles see own branch
    )
  );


-- ════════════════════════════════════════════════════════════
-- L1: tenants — restrict GRANT to SELECT only
-- ════════════════════════════════════════════════════════════
--
-- The initial schema granted SELECT (via the RLS policy) but did not
-- explicitly GRANT or REVOKE other operations.  Postgres default is no
-- privilege for other roles, but we make the intent explicit to prevent
-- future GRANT widening from accidentally giving write access to tenants.

REVOKE INSERT, UPDATE, DELETE ON TABLE public.tenants FROM authenticated;
