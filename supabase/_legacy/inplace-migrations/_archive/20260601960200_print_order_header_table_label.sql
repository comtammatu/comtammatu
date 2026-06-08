-- ============================================================================
-- Print slips: dine-in headers use table labels
--
-- Dine-in order headers should be operationally scannable by table:
--   TC-260525-087-PH + table_number 3 -> Bàn 3 #087
--
-- Takeaway remains:
--   MV-260525-088-PH -> Mang về #088
--
-- kitchen_ticket_number/PB remains kitchen-batch metadata and never feeds the
-- primary order header.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.print_template_order_header(p_payload JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_order_number TEXT := btrim(
    COALESCE(
      NULLIF(p_payload->>'source_order_number', ''),
      NULLIF(p_payload->>'order_number', ''),
      ''
    )
  );
  v_clean_order_number TEXT;
  v_order_type TEXT := COALESCE(p_payload->>'order_type', '');
  v_table_number TEXT := NULLIF(btrim(COALESCE(p_payload->>'table_number', '')), '');
  v_prefix TEXT;
  v_label TEXT;
  v_match TEXT[];
  v_sequence TEXT;
  v_is_dine_in BOOLEAN;
BEGIN
  v_clean_order_number := regexp_replace(v_order_number, '^#+', '');
  v_prefix := upper(split_part(v_clean_order_number, '-', 1));
  v_is_dine_in := v_order_type = 'dine_in'
    OR (v_order_type <> 'takeaway' AND v_prefix = 'TC');

  v_label := CASE
    WHEN v_is_dine_in AND v_table_number IS NOT NULL THEN 'Bàn ' || v_table_number
    WHEN v_is_dine_in THEN 'Tại bàn'
    WHEN v_order_type = 'takeaway' OR v_prefix = 'MV' THEN 'Mang về'
    ELSE 'Đơn'
  END;

  v_match := regexp_match(
    v_clean_order_number,
    '^(?:TC|MV)-(?:(?:[0-9]{6}|[0-9]{8})-)?([0-9]{1,4})(?:-.+)?$',
    'i'
  );
  IF v_match IS NOT NULL THEN
    v_sequence := v_match[1];
  END IF;

  IF COALESCE(v_sequence, '') <> '' THEN
    RETURN v_label || ' #' || v_sequence;
  END IF;

  IF v_clean_order_number <> '' THEN
    RETURN v_label || ' ' || v_clean_order_number;
  END IF;

  RETURN v_label;
END;
$$;

REVOKE ALL ON FUNCTION public.print_template_order_header(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.print_template_order_header(JSONB) TO service_role;
