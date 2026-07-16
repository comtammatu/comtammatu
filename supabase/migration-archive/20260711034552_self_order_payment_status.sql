CREATE OR REPLACE FUNCTION public.self_order_get_payment_request_status(
  p_token text,
  p_client_op_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_table record;
  v_status text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT t.id AS table_id, t.tenant_id
  INTO v_table
  FROM public.tables t
  JOIN public.branches b
    ON b.id = t.branch_id
   AND b.tenant_id = t.tenant_id
   AND b.is_active = true
  WHERE t.self_order_token = p_token
    AND t.self_order_enabled = true
    AND t.status <> 'maintenance'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_disabled_token');
  END IF;

  SELECT pr.status
  INTO v_status
  FROM public.self_order_payment_requests pr
  WHERE pr.tenant_id = v_table.tenant_id
    AND pr.table_id = v_table.table_id
    AND pr.client_op_id = p_client_op_id
  ORDER BY pr.id DESC
  LIMIT 1;

  RETURN jsonb_build_object('ok', true, 'status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.self_order_get_payment_request_status(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_order_get_payment_request_status(text, uuid)
  TO service_role;
