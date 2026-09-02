-- Drop confirmed-dead purchase-request create/submit RPCs after demand cutover.
-- 6-channel scan + Production pg_proc/pg_depend evidence confirms zero callers.

DROP FUNCTION IF EXISTS public.create_purchase_request(bigint, date, text, jsonb);
DROP FUNCTION IF EXISTS public.submit_purchase_request(bigint);

/*
-- RPC-ROLLBACK-MUST-INCLUDE-BODY
-- To rollback, restore the RPC definitions:

CREATE OR REPLACE FUNCTION public.create_purchase_request(
  p_branch_id bigint,
  p_needed_by date,
  p_notes text,
  p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_request_id bigint;
  v_request_number text;
  v_line_count integer;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_branch_id IS NULL
     OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'purchase_request_invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'procurement:grn_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_request_number := public.next_inventory_doc_number(v_tenant, 'purchase_request');

  INSERT INTO public.purchase_requests (
    tenant_id, branch_id, request_number, status, needed_by, notes, created_by
  ) VALUES (
    v_tenant, p_branch_id, v_request_number, 'draft', p_needed_by, p_notes, v_uid
  ) RETURNING id INTO v_request_id;

  INSERT INTO public.purchase_request_items (
    tenant_id, purchase_request_id, ingredient_id, quantity, entry_unit_id, notes
  )
  SELECT
    v_tenant,
    v_request_id,
    (line->>'ingredient_id')::bigint,
    (line->>'quantity')::numeric,
    (line->>'entry_unit_id')::bigint,
    line->>'notes'
  FROM jsonb_array_elements(p_lines) AS line;

  GET DIAGNOSTICS v_line_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'id', v_request_id,
    'request_number', v_request_number,
    'line_count', v_line_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_purchase_request(
  p_request_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_branch_id bigint;
  v_status text;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT branch_id, status INTO v_branch_id, v_status
  FROM public.purchase_requests
  WHERE id = p_request_id AND tenant_id = v_tenant;

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'purchase_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'purchase_request_not_draft' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(v_branch_id, 'procurement:grn_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.purchase_requests
  SET status = 'submitted',
      submitted_by = v_uid,
      submitted_at = now(),
      updated_at = now()
  WHERE id = p_request_id AND tenant_id = v_tenant;

  RETURN jsonb_build_object('id', p_request_id, 'status', 'submitted');
END;
$$;
*/
