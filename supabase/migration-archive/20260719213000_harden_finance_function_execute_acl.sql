REVOKE ALL ON FUNCTION public.close_pos_session(bigint, numeric, text, text)
  FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.resolve_pos_session_variance(bigint, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_pos_session_variance(bigint, text, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.correct_payment_method(bigint, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.correct_payment_method(bigint, text, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.get_cash_ledger_movement_since(timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cash_ledger_movement_since(timestamptz)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_inventory_value_period(date, date, bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inventory_value_period(date, date, bigint)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.import_sepay_bank_transactions(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.import_sepay_bank_transactions(jsonb)
  TO authenticated;

REVOKE ALL ON FUNCTION public.get_bank_ledger_movement_since(timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bank_ledger_movement_since(timestamptz)
  TO authenticated, service_role;
