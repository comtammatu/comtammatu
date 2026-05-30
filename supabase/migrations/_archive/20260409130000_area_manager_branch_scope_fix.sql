-- =============================================================
-- H3 follow-up: enforce area_manager branch scoping across modules
--
-- 20260406220000_area_manager_scoping.sql introduced areas + area_branches
-- and updated branches/profiles policies. Other tables still treated
-- area_manager as tenant-wide via auth_branch_id() IS NULL.
--
-- This migration introduces a reusable branch access predicate and applies
-- it to the most important branch-scoped policies and RPC predicates.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1) Branch access predicate
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_access_branch(p_branch_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN public.auth_role() IN ('owner', 'super_manager', 'office') THEN true
    WHEN public.auth_role() = 'area_manager' THEN
      public.auth_area_id() IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.area_branches ab
        WHERE ab.tenant_id = public.auth_tenant_id()
          AND ab.area_id = public.auth_area_id()
          AND ab.branch_id = p_branch_id
      )
    ELSE p_branch_id = public.auth_branch_id()
  END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 2) Orders + related history/items
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "orders_select" ON public.orders;
CREATE POLICY "orders_select" ON public.orders
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.can_access_branch(branch_id)
  );

DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
CREATE POLICY "order_items_select" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.tenant_id = order_items.tenant_id
        AND public.can_access_branch(o.branch_id)
    )
  );

DROP POLICY IF EXISTS "order_status_history_select" ON public.order_status_history;
CREATE POLICY "order_status_history_select" ON public.order_status_history
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_status_history.order_id
        AND o.tenant_id = order_status_history.tenant_id
        AND public.can_access_branch(o.branch_id)
    )
  );


-- ─────────────────────────────────────────────────────────────
-- 3) Payments (read/write) — enforce area scope
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "payments_select" ON public.payments;
CREATE POLICY "payments_select" ON public.payments
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.can_access_branch(branch_id)
  );

DROP POLICY IF EXISTS "payments_insert" ON public.payments;
CREATE POLICY "payments_insert" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager', 'cashier', 'waiter')
    AND public.can_access_branch(branch_id)
  );

DROP POLICY IF EXISTS "payments_update" ON public.payments;
CREATE POLICY "payments_update" ON public.payments
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager', 'cashier', 'waiter')
    AND public.can_access_branch(branch_id)
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager', 'cashier', 'waiter')
    AND public.can_access_branch(branch_id)
  );


-- ─────────────────────────────────────────────────────────────
-- 4) Tax invoices (read) — replace NULL-branch shortcut
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tax_invoices_select" ON public.tax_invoices;
CREATE POLICY "tax_invoices_select" ON public.tax_invoices
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN (
      'owner', 'super_manager', 'area_manager', 'office',
      'branch_manager', 'cashier', 'waiter'
    )
    AND public.can_access_branch(branch_id)
  );


-- ─────────────────────────────────────────────────────────────
-- 5) KDS tickets — select/update/insert
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_select" ON public.kds_tickets;
CREATE POLICY "tenant_select" ON public.kds_tickets
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.can_access_branch(branch_id)
  );

DROP POLICY IF EXISTS "rpc_insert" ON public.kds_tickets;
CREATE POLICY "rpc_insert" ON public.kds_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('cashier', 'waiter', 'branch_manager', 'owner', 'super_manager', 'area_manager')
    AND public.can_access_branch(branch_id)
  );

DROP POLICY IF EXISTS "kds_update" ON public.kds_tickets;
CREATE POLICY "kds_update" ON public.kds_tickets
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('chef', 'branch_manager', 'owner', 'super_manager', 'area_manager')
    AND public.can_access_branch(branch_id)
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('chef', 'branch_manager', 'owner', 'super_manager', 'area_manager')
    AND public.can_access_branch(branch_id)
  );


-- ─────────────────────────────────────────────────────────────
-- 6) RPC predicates that previously treated NULL branch as tenant-wide
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.bump_kds_ticket(p_ticket_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket    RECORD;
  v_new_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF public.auth_role() NOT IN (
    'chef', 'branch_manager', 'owner', 'super_manager', 'area_manager'
  ) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT id, tenant_id, branch_id, station_id, order_id, status
  INTO v_ticket
  FROM public.kds_tickets
  WHERE id = p_ticket_id
    AND tenant_id = public.auth_tenant_id()
    AND public.can_access_branch(branch_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

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
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket     RECORD;
  v_new_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF public.auth_role() NOT IN (
    'chef', 'branch_manager', 'owner', 'super_manager', 'area_manager'
  ) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT id, tenant_id, branch_id, status
  INTO v_ticket
  FROM public.kds_tickets
  WHERE id = p_ticket_id
    AND tenant_id = public.auth_tenant_id()
    AND public.can_access_branch(branch_id)
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
  IF p_closing_cash IS NULL OR p_closing_cash < 0 THEN
    RAISE EXCEPTION 'closing_cash must be non-negative' USING ERRCODE = '22023';
  END IF;

  v_closed_by := auth.uid();

  SELECT id, tenant_id, branch_id, opening_cash, opened_at, status
  INTO v_session
  FROM public.pos_sessions
  WHERE id = p_session_id
    AND tenant_id = public.auth_tenant_id()
    AND public.can_access_branch(branch_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Session is already closed' USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(total_amount), 0)
  INTO v_order_count, v_expected_cash
  FROM public.orders
  WHERE pos_session_id = p_session_id
    AND status NOT IN ('cancelled');

  v_expected_cash   := v_session.opening_cash + v_expected_cash;
  v_cash_difference := p_closing_cash - v_expected_cash;

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
    'session_id',      p_session_id,
    'opening_cash',    v_session.opening_cash,
    'closing_cash',    p_closing_cash,
    'expected_cash',   v_expected_cash,
    'cash_difference', v_cash_difference,
    'order_count',     v_order_count,
    'opened_at',       v_session.opened_at,
    'closed_at',       now()
  );
END;
$$;

