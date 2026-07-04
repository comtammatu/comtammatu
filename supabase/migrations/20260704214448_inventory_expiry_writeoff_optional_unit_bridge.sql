DO $$
DECLARE
  v_oid oid;
  v_def text;
BEGIN
  v_oid := to_regprocedure(
    'public.create_expiry_writeoff(bigint,bigint,bigint,numeric,text,bigint,text,text[])'
  );

  IF v_oid IS NULL THEN
    RETURN;
  END IF;

  SELECT pg_get_functiondef(v_oid) INTO v_def;

  IF v_def LIKE '%p_unit text DEFAULT%' THEN
    RETURN;
  END IF;

  EXECUTE replace(
    v_def,
    'p_unit text,',
    'p_unit text DEFAULT NULL::text,'
  );
END;
$$;
