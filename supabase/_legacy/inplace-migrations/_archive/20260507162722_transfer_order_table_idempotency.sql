-- =============================================================
-- transfer_order_table: add idempotency_key support
--
-- Context: pilot ran into a 1-2s POS perf review. BA flagged that a
-- network flap mid-transfer can commit on the server while the client
-- times out, prompting the cashier to retry — without idempotency the
-- second call mutates again or rejects "table not available" depending
-- on what the user picked. split_order/merge_orders already have a key;
-- this migration brings transfer_order_table inline.
--
-- Storage: a single column `orders.last_transfer_idempotency_key` is
-- enough — transfers don't accumulate (each new transfer overwrites the
-- key), and the per-order advisory lock already serialises concurrent
-- callers so we don't need a uniqueness constraint to detect replay.
--
-- Audit log format (`order_status_history.note`) is unchanged — the
-- existing `parseAuditNote` parser in `apps/web/app/orders/actions.ts`
-- keys off the `transfer_table` prefix + `->` separator, both still hold.
-- =============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS last_transfer_idempotency_key UUID;

DROP FUNCTION IF EXISTS public.transfer_order_table(BIGINT, BIGINT);

CREATE OR REPLACE FUNCTION public.transfer_order_table(
  p_order_id BIGINT,
  p_new_table_id BIGINT,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  SELECT p.tenant_id, p.branch_id, COALESCE(po.legacy_role_code, 'office')
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
$$;

REVOKE ALL ON FUNCTION public.transfer_order_table(BIGINT, BIGINT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_order_table(BIGINT, BIGINT, UUID) TO authenticated;
