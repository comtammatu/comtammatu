-- =========================================================================
-- POS/KDS: order and item priority flags
--
-- Priority is an operational kitchen signal only. It must not affect price,
-- tax, stock, payment, invoice, or receipt totals.
-- =========================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_priority BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS priority_note TEXT,
  ADD COLUMN IF NOT EXISTS priority_marked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS priority_marked_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS is_priority BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS priority_note TEXT,
  ADD COLUMN IF NOT EXISTS priority_marked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS priority_marked_by UUID REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_orders_priority_active
  ON public.orders (branch_id, is_priority, created_at DESC)
  WHERE is_priority = TRUE AND status NOT IN ('completed', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_order_items_priority_active
  ON public.order_items (order_id, is_priority, updated_at DESC)
  WHERE is_priority = TRUE AND status IN ('pending', 'preparing');

COMMENT ON COLUMN public.orders.is_priority IS
  'POS/KDS kitchen priority signal for the whole order. Operational only; does not affect financial totals.';

COMMENT ON COLUMN public.order_items.is_priority IS
  'POS/KDS kitchen priority signal for a single dish. Operational only; does not affect financial totals.';

CREATE OR REPLACE FUNCTION public.set_pos_order_priority(
  p_order_id BIGINT,
  p_is_priority BOOLEAN,
  p_note TEXT DEFAULT NULL
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
  v_order public.orders%ROWTYPE;
  v_active_count INT;
  v_note TEXT;
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
$$;

REVOKE ALL ON FUNCTION public.set_pos_order_priority(BIGINT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_pos_order_priority(BIGINT, BOOLEAN, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_pos_order_item_priority(
  p_order_item_id BIGINT,
  p_is_priority BOOLEAN,
  p_note TEXT DEFAULT NULL
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
  v_item public.order_items%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_note TEXT;
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
$$;

REVOKE ALL ON FUNCTION public.set_pos_order_item_priority(BIGINT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_pos_order_item_priority(BIGINT, BOOLEAN, TEXT) TO authenticated;
