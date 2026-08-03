CREATE OR REPLACE FUNCTION public.create_purchase_orders_from_request(
  p_request_id bigint,
  p_orders jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_order jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF p_orders IS NULL
     OR jsonb_typeof(p_orders) <> 'array'
     OR jsonb_array_length(p_orders) = 0
     OR jsonb_array_length(p_orders) > 100 THEN
    RAISE EXCEPTION 'purchase_orders_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*) <> count(DISTINCT order_row.supplier_id)
    FROM jsonb_to_recordset(p_orders)
      AS order_row(supplier_id bigint)
  ) THEN
    RAISE EXCEPTION 'purchase_orders_duplicate_supplier'
      USING ERRCODE = '22023';
  END IF;

  FOR v_order IN
    SELECT value
    FROM jsonb_array_elements(p_orders)
  LOOP
    v_result := public.create_purchase_order_from_request(
      p_request_id,
      (v_order ->> 'supplier_id')::bigint,
      NULLIF(v_order ->> 'expected_delivery_date', '')::date,
      COALESCE(v_order ->> 'notes', ''),
      v_order -> 'lines'
    );
    v_results := v_results || jsonb_build_array(v_result);
  END LOOP;

  RETURN jsonb_build_object('purchase_orders', v_results);
END;
$$;

REVOKE ALL ON FUNCTION
  public.create_purchase_orders_from_request(bigint, jsonb)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.create_purchase_orders_from_request(bigint, jsonb)
TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
