-- Fail closed when historical data does not satisfy the precision contract.
-- Corrections require a separately reviewed migration with accounting approval.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.expenses AS expense
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
      expense.vat_breakdown
    ) AS line(value)
    WHERE (line.value->>'taxable_amount')::numeric
        <> pg_catalog.round(
          (line.value->>'taxable_amount')::numeric,
          2
        )
       OR (line.value->>'vat_amount')::numeric
        <> pg_catalog.round((line.value->>'vat_amount')::numeric, 2)
  ) THEN
    RAISE EXCEPTION 'money_precision_audit_expense_scale';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.expenses AS expense
    CROSS JOIN LATERAL (
      SELECT
        pg_catalog.sum(
          (line.value->>'taxable_amount')::numeric
        ) AS subtotal,
        pg_catalog.sum((line.value->>'vat_amount')::numeric) AS vat_amount
      FROM pg_catalog.jsonb_array_elements(expense.vat_breakdown)
        AS line(value)
    ) AS totals
    WHERE expense.subtotal IS DISTINCT FROM totals.subtotal
       OR expense.vat_amount IS DISTINCT FROM totals.vat_amount
       OR expense.amount IS DISTINCT FROM
          totals.subtotal + totals.vat_amount
  ) THEN
    RAISE EXCEPTION 'money_precision_audit_expense_header_mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_invoices AS invoice
    JOIN LATERAL (
      SELECT
        pg_catalog.sum(line.line_total) AS subtotal,
        pg_catalog.sum(line.vat_amount) AS vat_amount
      FROM public.supplier_invoice_lines AS line
      WHERE line.tenant_id = invoice.tenant_id
        AND line.supplier_invoice_id = invoice.id
    ) AS totals ON TRUE
    WHERE invoice.document_status <> 'cancelled'
      AND (
        invoice.subtotal IS DISTINCT FROM totals.subtotal
        OR invoice.vat_amount IS DISTINCT FROM totals.vat_amount
        OR invoice.total_amount IS DISTINCT FROM
           totals.subtotal
             - invoice.document_discount_amount
             + totals.vat_amount
      )
  ) THEN
    RAISE EXCEPTION 'money_precision_audit_supplier_header_mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_invoice_lines AS line
    WHERE line.line_total IS DISTINCT FROM GREATEST(
      pg_catalog.round(line.quantity * line.unit_price, 2)
        - line.line_discount_amount,
      0::numeric
    )
  ) THEN
    RAISE EXCEPTION 'money_precision_audit_supplier_line_mismatch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.menu_items
    WHERE base_price <> pg_catalog.trunc(base_price)
  ) OR EXISTS (
    SELECT 1 FROM public.menu_item_variants
    WHERE price_adjustment <> pg_catalog.trunc(price_adjustment)
  ) OR EXISTS (
    SELECT 1 FROM public.menu_item_modifiers
    WHERE price <> pg_catalog.trunc(price)
  ) OR EXISTS (
    SELECT 1
    FROM public.orders AS orders
    CROSS JOIN LATERAL (
      VALUES
        (orders.subtotal),
        (orders.tax_amount),
        (orders.service_charge),
        (orders.discount_amount),
        (orders.total_amount),
        (orders.cash_received),
        (orders.cash_change)
    ) AS money(value)
    WHERE money.value IS NOT NULL
      AND money.value <> pg_catalog.trunc(money.value)
  ) OR EXISTS (
    SELECT 1 FROM public.payments
    WHERE amount <> pg_catalog.trunc(amount)
  ) OR EXISTS (
    SELECT 1
    FROM public.pos_sessions AS session
    CROSS JOIN LATERAL (
      VALUES
        (session.opening_cash),
        (session.closing_cash),
        (session.expected_cash),
        (session.cash_difference),
        (session.variance_settlement_amount)
    ) AS money(value)
    WHERE money.value IS NOT NULL
      AND money.value <> pg_catalog.trunc(money.value)
  ) THEN
    RAISE EXCEPTION 'money_precision_audit_pos_fractional_amount';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_expense_vat_breakdown()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_line jsonb;
  v_rate numeric;
  v_raw_taxable_amount numeric;
  v_raw_vat_amount numeric;
  v_taxable_amount numeric(15,2);
  v_vat_amount numeric(15,2);
  v_rates numeric[] := ARRAY[]::numeric[];
  v_subtotal numeric := 0;
  v_total_vat numeric := 0;
  v_line_count integer;
  v_normalized_breakdown jsonb := '[]'::jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.vat_breakdown IS DISTINCT FROM OLD.vat_breakdown
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
    OR NEW.amount IS DISTINCT FROM OLD.amount
  ) THEN
    RAISE EXCEPTION 'expense_vat_snapshot_immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.vat_breakdown IS NULL
    OR pg_catalog.jsonb_typeof(NEW.vat_breakdown) <> 'array'
    OR pg_catalog.jsonb_array_length(NEW.vat_breakdown) = 0 THEN
    RAISE EXCEPTION 'expense_vat_breakdown_required'
      USING ERRCODE = '22023';
  END IF;

  v_line_count := pg_catalog.jsonb_array_length(NEW.vat_breakdown);
  IF v_line_count < 1 OR v_line_count > 4 THEN
    RAISE EXCEPTION 'invalid_expense_vat_breakdown_count'
      USING ERRCODE = '22023';
  END IF;

  FOR v_line IN
    SELECT value
    FROM pg_catalog.jsonb_array_elements(NEW.vat_breakdown)
  LOOP
    IF pg_catalog.jsonb_typeof(v_line) <> 'object' THEN
      RAISE EXCEPTION 'invalid_expense_vat_breakdown_line'
        USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_rate := (v_line->>'vat_rate')::numeric;
      v_raw_taxable_amount :=
        (v_line->>'taxable_amount')::numeric;
      v_raw_vat_amount := (v_line->>'vat_amount')::numeric;
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'invalid_expense_vat_breakdown_line'
          USING ERRCODE = '22023';
    END;

    IF v_raw_taxable_amount
        <> pg_catalog.round(v_raw_taxable_amount, 2)
       OR v_raw_vat_amount <> pg_catalog.round(v_raw_vat_amount, 2) THEN
      RAISE EXCEPTION 'expense_vat_amount_scale_invalid'
        USING ERRCODE = '22023';
    END IF;

    IF v_rate IS NULL
      OR v_raw_taxable_amount IS NULL
      OR v_raw_vat_amount IS NULL
      OR NOT v_rate = ANY (ARRAY[0, 5, 8, 10]::numeric[])
      OR v_raw_taxable_amount <= 0
      OR v_raw_vat_amount < 0
      OR v_raw_taxable_amount > 9999999999999.99
      OR v_raw_vat_amount > 9999999999999.99
      OR (v_rate = 0 AND v_raw_vat_amount <> 0) THEN
      RAISE EXCEPTION 'invalid_expense_vat_breakdown_line'
        USING ERRCODE = '22023';
    END IF;

    IF v_rate = ANY (v_rates) THEN
      RAISE EXCEPTION 'duplicate_expense_vat_rate'
        USING ERRCODE = '22023';
    END IF;

    v_taxable_amount := v_raw_taxable_amount;
    v_vat_amount := v_raw_vat_amount;
    v_rates := pg_catalog.array_append(v_rates, v_rate);
    v_subtotal := v_subtotal + v_taxable_amount;
    v_total_vat := v_total_vat + v_vat_amount;
    v_normalized_breakdown := v_normalized_breakdown
      || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'vat_rate', v_rate,
          'taxable_amount', v_taxable_amount,
          'vat_amount', v_vat_amount
        )
      );
  END LOOP;

  IF v_subtotal > 9999999999999.99
    OR v_total_vat > 9999999999999.99
    OR v_subtotal + v_total_vat > 9999999999999.99 THEN
    RAISE EXCEPTION 'invalid_expense_vat_breakdown_total'
      USING ERRCODE = '22003';
  END IF;

  NEW.subtotal := v_subtotal;
  NEW.vat_amount := v_total_vat;
  NEW.amount := NEW.subtotal + NEW.vat_amount;

  SELECT pg_catalog.jsonb_agg(
    line.value
    ORDER BY (line.value->>'vat_rate')::numeric
  )
  INTO NEW.vat_breakdown
  FROM pg_catalog.jsonb_array_elements(v_normalized_breakdown)
    AS line(value);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_expense_vat_breakdown()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.normalize_expense_vat_breakdown() IS
  'Rejects excess money scale, normalizes expense VAT buckets, and derives immutable header totals.';

ALTER FUNCTION public.save_supplier_invoice_draft(
  bigint,
  jsonb,
  jsonb,
  jsonb,
  uuid
) RENAME TO save_supplier_invoice_draft_unchecked;

REVOKE ALL ON FUNCTION public.save_supplier_invoice_draft_unchecked(
  bigint,
  jsonb,
  jsonb,
  jsonb,
  uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_supplier_invoice_draft(
  p_invoice_id bigint,
  p_invoice jsonb,
  p_lines jsonb,
  p_allocations jsonb,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_raw_discount numeric;
  v_client_subtotal numeric;
  v_client_vat numeric;
  v_client_total numeric;
  v_derived_subtotal numeric;
  v_derived_vat numeric;
  v_derived_total numeric;
BEGIN
  IF p_idempotency_key IS NULL
    OR pg_catalog.jsonb_typeof(p_invoice) <> 'object'
    OR pg_catalog.jsonb_typeof(p_lines) <> 'array'
    OR pg_catalog.jsonb_array_length(p_lines) = 0
    OR pg_catalog.jsonb_array_length(p_lines) > 200
    OR pg_catalog.jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'supplier_invoice_draft_invalid'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_raw_discount := pg_catalog.coalesce(
      (p_invoice->>'document_discount_amount')::numeric,
      0
    );
    v_client_subtotal := (p_invoice->>'subtotal')::numeric;
    v_client_vat := (p_invoice->>'vat_amount')::numeric;
    v_client_total := (p_invoice->>'total_amount')::numeric;
  EXCEPTION
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'supplier_invoice_header_invalid'
        USING ERRCODE = '22023';
  END;

  IF v_raw_discount <> pg_catalog.round(v_raw_discount, 2)
    OR v_client_subtotal <> pg_catalog.round(v_client_subtotal, 2)
    OR v_client_vat <> pg_catalog.round(v_client_vat, 2)
    OR v_client_total <> pg_catalog.round(v_client_total, 2) THEN
    RAISE EXCEPTION 'supplier_invoice_money_scale_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(p_lines) AS line(
      line_key text,
      ingredient_id bigint,
      description text,
      quantity numeric,
      unit_id bigint,
      unit_price numeric,
      line_discount numeric,
      vat_rate numeric,
      vat_amount numeric,
      line_total numeric
    )
    WHERE line.quantity IS NULL
       OR line.quantity <= 0
       OR line.quantity <> pg_catalog.round(line.quantity, 3)
       OR line.unit_price IS NULL
       OR line.unit_price < 0
       OR line.unit_price <> pg_catalog.round(line.unit_price, 2)
       OR line.line_discount IS NULL
       OR line.line_discount < 0
       OR line.line_discount <> pg_catalog.round(line.line_discount, 2)
       OR line.vat_amount IS NULL
       OR line.vat_amount < 0
       OR line.vat_amount <> pg_catalog.round(line.vat_amount, 2)
       OR line.line_total IS NULL
       OR line.line_total < 0
       OR line.line_total <> pg_catalog.round(line.line_total, 2)
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(p_allocations) AS allocation(
      line_key text,
      grn_id bigint,
      po_id bigint,
      purchase_order_item_id bigint,
      quantity numeric
    )
    WHERE allocation.quantity IS NULL
       OR allocation.quantity <= 0
       OR allocation.quantity
          <> pg_catalog.round(allocation.quantity, 3)
  ) THEN
    RAISE EXCEPTION 'supplier_invoice_money_scale_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(p_lines) AS line(
      quantity numeric,
      unit_price numeric,
      line_discount numeric,
      vat_rate numeric,
      vat_amount numeric,
      line_total numeric
    )
    WHERE line.vat_rate NOT IN (0, 5, 8, 10)
       OR (line.vat_rate = 0 AND line.vat_amount <> 0)
       OR line.line_discount
          > pg_catalog.round(line.quantity * line.unit_price, 2)
       OR line.line_total IS DISTINCT FROM GREATEST(
         pg_catalog.round(line.quantity * line.unit_price, 2)
           - line.line_discount,
         0::numeric
       )
  ) THEN
    RAISE EXCEPTION 'supplier_invoice_line_invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    pg_catalog.sum(line.line_total),
    pg_catalog.sum(line.vat_amount)
  INTO v_derived_subtotal, v_derived_vat
  FROM pg_catalog.jsonb_to_recordset(p_lines) AS line(
    line_total numeric,
    vat_amount numeric
  );
  v_derived_total :=
    v_derived_subtotal - v_raw_discount + v_derived_vat;

  IF v_derived_subtotal <= 0
    OR v_raw_discount < 0
    OR v_raw_discount > v_derived_subtotal
    OR v_derived_total < 0
    OR v_client_subtotal IS DISTINCT FROM v_derived_subtotal
    OR v_client_vat IS DISTINCT FROM v_derived_vat
    OR v_client_total IS DISTINCT FROM v_derived_total THEN
    RAISE EXCEPTION 'supplier_invoice_total_mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN public.save_supplier_invoice_draft_unchecked(
    p_invoice_id,
    p_invoice,
    p_lines,
    p_allocations,
    p_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_supplier_invoice_draft(
  bigint,
  jsonb,
  jsonb,
  jsonb,
  uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_supplier_invoice_draft(
  bigint,
  jsonb,
  jsonb,
  jsonb,
  uuid
) TO authenticated, service_role;

COMMENT ON FUNCTION public.save_supplier_invoice_draft(
  bigint,
  jsonb,
  jsonb,
  jsonb,
  uuid
) IS
  'Validates scale-2 invoice money and scale-3 quantity before delegating the atomic draft save.';
