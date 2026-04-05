-- =============================================================
-- M2-S4: create_order RPC — atomic order creation
-- Inserts order + items + status history in one transaction
-- =============================================================

CREATE OR REPLACE FUNCTION public.create_order(
  p_tenant_id BIGINT,
  p_branch_id BIGINT,
  p_created_by UUID,
  p_items JSONB,
  p_order_type TEXT DEFAULT 'dine_in',
  p_table_id BIGINT DEFAULT NULL,
  p_pos_session_id BIGINT DEFAULT NULL,
  p_customer_count INT DEFAULT 1,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_order_id BIGINT;
  v_order_number TEXT;
  v_subtotal NUMERIC(15,2);
  v_seq INT;
  v_item JSONB;
BEGIN
  -- Validate inputs
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items must be a non-empty JSON array' USING ERRCODE = '22023';
  END IF;

  IF p_order_type NOT IN ('dine_in', 'takeaway') THEN
    RAISE EXCEPTION 'p_order_type must be dine_in or takeaway' USING ERRCODE = '22023';
  END IF;

  -- Generate order_number: {branch_id}-{YYMMDD}-{NNN}
  SELECT COUNT(*) + 1 INTO v_seq
  FROM public.orders
  WHERE branch_id = p_branch_id
    AND tenant_id = p_tenant_id
    AND created_at::date = CURRENT_DATE;

  v_order_number := p_branch_id::TEXT
    || '-' || to_char(CURRENT_DATE, 'YYMMDD')
    || '-' || lpad(v_seq::TEXT, 3, '0');

  -- Calculate subtotal from items
  SELECT COALESCE(SUM((item ->> 'subtotal')::NUMERIC(15,2)), 0) INTO v_subtotal
  FROM jsonb_array_elements(p_items) AS item;

  -- Insert order
  INSERT INTO public.orders (
    tenant_id, branch_id, table_id, order_number, order_type,
    subtotal, total_amount, customer_count, note, created_by,
    pos_session_id
  )
  VALUES (
    p_tenant_id, p_branch_id, p_table_id, v_order_number, p_order_type,
    v_subtotal, v_subtotal, p_customer_count, p_note, p_created_by,
    p_pos_session_id
  )
  RETURNING id INTO v_order_id;

  -- Insert order items
  INSERT INTO public.order_items (
    tenant_id, order_id, menu_item_id, variant_id,
    item_name, variant_name, quantity, unit_price,
    modifiers, sides, subtotal, note
  )
  SELECT
    p_tenant_id,
    v_order_id,
    (item ->> 'menu_item_id')::BIGINT,
    (item ->> 'variant_id')::BIGINT,
    item ->> 'item_name',
    item ->> 'variant_name',
    (item ->> 'quantity')::INT,
    (item ->> 'unit_price')::NUMERIC(15,2),
    COALESCE(item -> 'modifiers', '[]'::JSONB),
    COALESCE(item -> 'sides', '[]'::JSONB),
    (item ->> 'subtotal')::NUMERIC(15,2),
    item ->> 'note'
  FROM jsonb_array_elements(p_items) AS item;

  -- Insert initial status history
  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by
  )
  VALUES (
    p_tenant_id, v_order_id, NULL, 'new', p_created_by
  );

  -- Mark table as occupied for dine-in orders
  IF p_order_type = 'dine_in' AND p_table_id IS NOT NULL THEN
    UPDATE public.tables
    SET status = 'occupied'
    WHERE id = p_table_id
      AND tenant_id = p_tenant_id;
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order(BIGINT, BIGINT, UUID, JSONB, TEXT, BIGINT, BIGINT, INT, TEXT) TO authenticated;
