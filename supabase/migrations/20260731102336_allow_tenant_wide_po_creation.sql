DO $$
BEGIN
  UPDATE public.permission_keys
  SET scope = 'either'
  WHERE key = 'procurement:po_create'
    AND scope = 'branch';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'procurement_po_create_permission_missing';
  END IF;
END;
$$;
