CREATE OR REPLACE FUNCTION public.set_finance_cash_opening(
  p_cash_balance numeric,
  p_bank_balance numeric,
  p_opening_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
BEGIN
  IF v_tenant_id IS NULL OR NOT public.has_permission_any('settings:tenant') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_cash_balance IS NULL OR p_cash_balance < 0 OR p_cash_balance > 100000000000 THEN
    RAISE EXCEPTION 'invalid_cash_opening_balance' USING ERRCODE = '22023';
  END IF;

  IF p_bank_balance IS NULL OR p_bank_balance < 0 OR p_bank_balance > 100000000000 THEN
    RAISE EXCEPTION 'invalid_bank_opening_balance' USING ERRCODE = '22023';
  END IF;

  IF p_opening_date IS NULL OR p_opening_date > (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN
    RAISE EXCEPTION 'invalid_cash_opening_date' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.system_settings (tenant_id, key, value)
  VALUES
    (v_tenant_id, 'cash_opening_balance', p_cash_balance::text),
    (v_tenant_id, 'bank_opening_balance', p_bank_balance::text),
    (v_tenant_id, 'cash_opening_date', p_opening_date::text)
  ON CONFLICT (key, tenant_id)
  DO UPDATE SET value = EXCLUDED.value;
END;
$$;

REVOKE ALL ON FUNCTION public.set_finance_cash_opening(numeric, numeric, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_finance_cash_opening(numeric, numeric, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_finance_cash_opening(numeric, numeric, date) TO authenticated;
