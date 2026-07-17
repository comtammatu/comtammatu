DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.self_order_create_payment_request(text, uuid, text, jsonb)'::regprocedure
  )
  INTO v_definition;

  IF position('self_order_payment_not_ready' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'self_order_payment_ready_guard_not_found';
  END IF;

  v_definition := regexp_replace(
    v_definition,
    E'\\n[[:space:]]*IF p_method = ''vietqr'' AND v_order\\.status NOT IN \\(''ready'', ''served''\\) THEN\\n[[:space:]]*RAISE EXCEPTION ''self_order_payment_not_ready'' USING ERRCODE = ''22023'';\\n[[:space:]]*END IF;',
    chr(10)
  );

  IF position('self_order_payment_not_ready' IN v_definition) > 0 THEN
    RAISE EXCEPTION 'self_order_payment_ready_guard_not_removed';
  END IF;

  EXECUTE v_definition;
END;
$$;
