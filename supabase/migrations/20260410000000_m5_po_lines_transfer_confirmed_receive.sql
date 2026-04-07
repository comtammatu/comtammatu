-- M5 checklist: trạng thái confirmed_receive trong luân chuyển; cột receive_started_at.
-- Dòng PO đã có bảng purchase_order_items — không đổi schema (chỉ RPC/UI phía app).

-- ─── 1. stock_transfers: thêm confirmed_receive trong CHECK + cột thời điểm CN kiểm nhận ───

ALTER TABLE public.stock_transfers DROP CONSTRAINT IF EXISTS stock_transfers_status_check;

ALTER TABLE public.stock_transfers ADD CONSTRAINT stock_transfers_status_check CHECK (
  status IN (
    'draft',
    'confirmed_ship',
    'in_transit',
    'confirmed_receive',
    'received',
    'cancelled'
  )
);

ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS receive_started_at TIMESTAMPTZ;

COMMENT ON COLUMN public.stock_transfers.receive_started_at IS
  'Chi nhánh bắt đầu kiểm nhận (khi chuyển sang confirmed_receive).';

-- ─── 2. RPC: in_transit → confirmed_receive (CN bắt đầu kiểm nhận) ───

CREATE OR REPLACE FUNCTION public.stock_transfer_confirm_receive(p_transfer_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_tr     RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_tr FROM public.stock_transfers
  WHERE id = p_transfer_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tr.status <> 'in_transit' THEN
    RAISE EXCEPTION 'transfer_not_in_transit' USING ERRCODE = '22023';
  END IF;

  UPDATE public.stock_transfers
  SET
    status = 'confirmed_receive',
    receive_started_at = COALESCE(receive_started_at, now()),
    updated_at = now()
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object(
    'transfer_id', p_transfer_id,
    'status', 'confirmed_receive'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stock_transfer_confirm_receive(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_transfer_confirm_receive(BIGINT) TO authenticated;

-- ─── 3. stock_transfer_receive: chỉ từ confirmed_receive (không còn nhảy từ in_transit) ───

CREATE OR REPLACE FUNCTION public.stock_transfer_receive(
  p_transfer_id BIGINT,
  p_items       JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_tenant    BIGINT := public.auth_tenant_id();
  v_tr        RECORD;
  v_line      RECORD;
  v_recv      NUMERIC(15,3);
  v_cost      NUMERIC(15,2);
  v_old_q     NUMERIC(15,3);
  v_old_wac   NUMERIC(15,2);
  v_new_q     NUMERIC(15,3);
  v_new_wac   NUMERIC(15,2);
  v_key       TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_tr FROM public.stock_transfers
  WHERE id = p_transfer_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tr.status <> 'confirmed_receive' THEN
    RAISE EXCEPTION 'transfer_not_in_confirmed_receive' USING ERRCODE = '22023';
  END IF;

  FOR v_line IN
    SELECT * FROM public.stock_transfer_items
    WHERE transfer_id = p_transfer_id AND tenant_id = v_tenant
  LOOP
    v_recv := v_line.quantity;
    IF p_items IS NOT NULL THEN
      v_key := v_line.ingredient_id::text;
      IF (p_items ? v_key) THEN
        v_recv := (p_items ->> v_key)::numeric;
      END IF;
    END IF;

    IF v_recv < 0 OR v_recv > v_line.quantity THEN
      RAISE EXCEPTION 'invalid_receive_qty:%', v_line.ingredient_id USING ERRCODE = '22023';
    END IF;

    IF v_recv <= 0 THEN
      UPDATE public.stock_transfer_items SET quantity_received = 0 WHERE id = v_line.id;
      CONTINUE;
    END IF;

    v_cost := COALESCE(v_line.unit_cost_at_ship, 0);

    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_tr.to_branch_id
      AND sl.ingredient_id = v_line.ingredient_id;

    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := NULL;
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, transfer_id, unit_cost
    ) VALUES (
      v_tenant, v_tr.to_branch_id, v_line.ingredient_id, 'transfer_in', v_recv,
      'Transfer ' || v_tr.transfer_number, v_uid, p_transfer_id, v_cost
    );

    v_new_q := COALESCE(v_old_q, 0) + v_recv;
    IF v_new_q > 0 THEN
      v_new_wac := (
        COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_recv * v_cost
      ) / v_new_q;
    ELSE
      v_new_wac := v_cost;
    END IF;

    UPDATE public.stock_levels sl
    SET avg_unit_cost = v_new_wac, updated_at = now()
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_tr.to_branch_id
      AND sl.ingredient_id = v_line.ingredient_id;

    UPDATE public.stock_transfer_items
    SET quantity_received = v_recv
    WHERE id = v_line.id;
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'received', received_at = now(), updated_at = now()
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object('transfer_id', p_transfer_id, 'status', 'received');
END;
$$;
