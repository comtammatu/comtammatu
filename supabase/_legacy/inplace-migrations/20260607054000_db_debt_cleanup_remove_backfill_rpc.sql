DROP FUNCTION IF EXISTS public.backfill_permissions_from_role();

CREATE OR REPLACE FUNCTION public.create_waste_from_order(
  p_order_id bigint,
  p_location_id bigint,
  p_source_type text,
  p_items jsonb,
  p_note text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order RECORD;
  v_default_reason TEXT;
  v_items_norm JSONB;
BEGIN
  IF p_source_type NOT IN ('pos_return','kds_cancel_mid_cook','kds_cancel_after_cook') THEN
    RAISE EXCEPTION 'source_type must be pos_return / kds_cancel_mid_cook / kds_cancel_after_cook' USING ERRCODE = '22023';
  END IF;

  IF p_source_type = 'pos_return' THEN
    v_default_reason := 'customer_return';
  ELSE
    v_default_reason := p_source_type;
  END IF;

  SELECT id, branch_id INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT jsonb_agg(
    CASE
      WHEN item ? 'reason_code' THEN item
      ELSE item || jsonb_build_object('reason_code', v_default_reason)
    END
  )
  INTO v_items_norm
  FROM jsonb_array_elements(p_items) AS item;

  RETURN public.create_waste_entry(
    p_branch_id := v_order.branch_id,
    p_location_id := p_location_id,
    p_items := v_items_norm,
    p_source_type := p_source_type,
    p_source_ref := jsonb_build_object('order_id', p_order_id),
    p_notes := COALESCE(p_note, 'Auto from order #' || p_order_id::TEXT)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_waste_from_order(bigint,bigint,text,jsonb,text)
  FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_waste_from_order(bigint,bigint,text,jsonb,text)
  TO service_role;
