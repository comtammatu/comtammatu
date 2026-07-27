-- Operating expenses: immutable multi-rate input VAT + optional HĐ GTGT attachment.
-- amount remains gross cash outflow (= subtotal + vat_amount). VAT is input_vat_recorded only.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS vat_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2),
  ADD COLUMN IF NOT EXISTS vat_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS invoice_attachment_url text;

UPDATE public.expenses
SET
  vat_breakdown = pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'vat_rate', 0,
      'taxable_amount', amount,
      'vat_amount', 0
    )
  ),
  subtotal = amount,
  vat_amount = 0
WHERE vat_breakdown IS NULL;

ALTER TABLE public.expenses
  ALTER COLUMN vat_breakdown SET DEFAULT '[]'::jsonb,
  ALTER COLUMN vat_breakdown SET NOT NULL,
  ALTER COLUMN subtotal SET NOT NULL,
  ALTER COLUMN vat_amount SET NOT NULL;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_invoice_attachment_url_length_check;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_invoice_attachment_url_length_check
  CHECK (
    invoice_attachment_url IS NULL
    OR char_length(invoice_attachment_url) <= 2048
  );

CREATE OR REPLACE FUNCTION public.normalize_expense_vat_breakdown()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_line jsonb;
  v_rate numeric(5,2);
  v_taxable_amount numeric(14,2);
  v_vat_amount numeric(14,2);
  v_rates numeric[] := ARRAY[]::numeric[];
  v_subtotal numeric(14,2) := 0;
  v_total_vat numeric(14,2) := 0;
  v_line_count integer;
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

  IF pg_catalog.jsonb_typeof(NEW.vat_breakdown) <> 'array' THEN
    RAISE EXCEPTION 'invalid_expense_vat_breakdown'
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
      v_rate := (v_line ->> 'vat_rate')::numeric;
      v_taxable_amount := (v_line ->> 'taxable_amount')::numeric;
      v_vat_amount := (v_line ->> 'vat_amount')::numeric;
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'invalid_expense_vat_breakdown_line'
          USING ERRCODE = '22023';
    END;

    IF v_rate IS NULL
      OR v_taxable_amount IS NULL
      OR v_vat_amount IS NULL
      OR NOT v_rate = ANY (ARRAY[0, 5, 8, 10]::numeric[])
      OR v_taxable_amount <= 0
      OR v_vat_amount < 0
      OR (v_rate = 0 AND v_vat_amount <> 0) THEN
      RAISE EXCEPTION 'invalid_expense_vat_breakdown_line'
        USING ERRCODE = '22023';
    END IF;

    IF v_rate = ANY (v_rates) THEN
      RAISE EXCEPTION 'duplicate_expense_vat_rate'
        USING ERRCODE = '22023';
    END IF;

    v_rates := pg_catalog.array_append(v_rates, v_rate);
    v_subtotal := v_subtotal + v_taxable_amount;
    v_total_vat := v_total_vat + v_vat_amount;
  END LOOP;

  NEW.subtotal := pg_catalog.round(v_subtotal, 2);
  NEW.vat_amount := pg_catalog.round(v_total_vat, 2);
  NEW.amount := NEW.subtotal + NEW.vat_amount;

  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'vat_rate', line.vat_rate,
      'taxable_amount', line.taxable_amount,
      'vat_amount', line.vat_amount
    )
    ORDER BY line.vat_rate
  )
  INTO NEW.vat_breakdown
  FROM pg_catalog.jsonb_to_recordset(NEW.vat_breakdown) AS line(
    vat_rate numeric,
    taxable_amount numeric,
    vat_amount numeric
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expenses_normalize_vat_breakdown ON public.expenses;
CREATE TRIGGER trg_expenses_normalize_vat_breakdown
BEFORE INSERT OR UPDATE OF vat_breakdown, subtotal, vat_amount, amount
ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.normalize_expense_vat_breakdown();

COMMENT ON COLUMN public.expenses.vat_breakdown IS
  'Immutable input-VAT summary by rate (0/5/8/10). Header subtotal, vat_amount, and amount are derived from this snapshot. Recorded only — not deductible status.';
COMMENT ON COLUMN public.expenses.subtotal IS
  'Pre-VAT taxable total derived from vat_breakdown.';
COMMENT ON COLUMN public.expenses.vat_amount IS
  'Input VAT recorded from vat_breakdown; not a deductible conclusion.';
COMMENT ON COLUMN public.expenses.invoice_attachment_url IS
  'Optional public URL for HĐ GTGT PDF/image evidence in inventory-attachments.';
COMMENT ON FUNCTION public.normalize_expense_vat_breakdown() IS
  'Validates expense VAT buckets and derives subtotal, vat_amount, and gross amount before persistence.';

REVOKE ALL ON FUNCTION public.normalize_expense_vat_breakdown()
  FROM PUBLIC, anon, authenticated;

-- Replace transfer-intent RPC: amount comes from vat_breakdown via trigger.
DROP FUNCTION IF EXISTS public.create_expense_transfer_intent(
  bigint,
  date,
  text,
  numeric,
  text,
  text
);

CREATE FUNCTION public.create_expense_transfer_intent(
  p_branch_id bigint,
  p_expense_date date,
  p_category text,
  p_vat_breakdown jsonb,
  p_vendor_name text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_invoice_attachment_url text DEFAULT NULL
) RETURNS TABLE(expense_id bigint, transfer_content text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_user_id uuid := auth.uid();
  v_prefix text;
  v_expense_token text;
  v_expense_id bigint;
  v_transfer_content text;
  v_vendor_name text := NULLIF(btrim(p_vendor_name), '');
  v_note text := NULLIF(btrim(p_note), '');
  v_attachment text := NULLIF(btrim(p_invoice_attachment_url), '');
BEGIN
  IF v_user_id IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.auth_is_owner(v_user_id)
    OR NOT EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.id = v_user_id
        AND profile.tenant_id = v_tenant_id
        AND COALESCE(profile.is_active, true)
    )
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_expense_date IS NULL
    OR p_category IS NULL
    OR NOT (
      p_category = ANY (ARRAY[
        'rent',
        'utilities',
        'gas_fuel',
        'salary',
        'supplies',
        'repair',
        'marketing',
        'fees_tax',
        'other'
      ]::text[])
    )
    OR p_vat_breakdown IS NULL
    OR char_length(v_vendor_name) > 200
    OR char_length(v_note) > 500
    OR char_length(v_attachment) > 2048
  THEN
    RAISE EXCEPTION 'expense_transfer_intent_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF p_branch_id IS NOT NULL THEN
    PERFORM 1
    FROM public.branches branch
    WHERE branch.id = p_branch_id
      AND branch.tenant_id = v_tenant_id
    FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  SELECT
    COALESCE(
      NULLIF(
        regexp_replace(
          upper(max(setting.value) FILTER (
            WHERE setting.key = 'payment_content_prefix'
          )),
          '[^A-Z0-9]+',
          '',
          'g'
        ),
        ''
      ),
      'MATU'
    ),
    COALESCE(
      NULLIF(
        regexp_replace(
          upper(max(setting.value) FILTER (
            WHERE setting.key = 'payment_content_expense_token'
          )),
          '[^A-Z0-9]+',
          '',
          'g'
        ),
        ''
      ),
      'CHI'
    )
  INTO v_prefix, v_expense_token
  FROM public.system_settings setting
  WHERE setting.tenant_id = v_tenant_id
    AND setting.key IN (
      'payment_content_prefix',
      'payment_content_expense_token'
    );

  IF char_length(v_prefix) NOT BETWEEN 2 AND 16
    OR char_length(v_expense_token) NOT BETWEEN 2 AND 16
  THEN
    RAISE EXCEPTION 'payment_content_settings_invalid'
      USING ERRCODE = '23514';
  END IF;

  v_expense_id := nextval('public.expenses_id_seq'::regclass);
  v_transfer_content :=
    v_prefix || ' ' || v_expense_token || ' ' || v_expense_id::text;

  INSERT INTO public.expenses (
    id,
    tenant_id,
    branch_id,
    expense_date,
    category,
    amount,
    subtotal,
    vat_amount,
    vat_breakdown,
    payment_method,
    paid_at,
    vendor_name,
    note,
    invoice_attachment_url,
    created_by,
    transfer_content
  )
  OVERRIDING SYSTEM VALUE
  VALUES (
    v_expense_id,
    v_tenant_id,
    p_branch_id,
    p_expense_date,
    p_category,
    0,
    0,
    0,
    p_vat_breakdown,
    'unpaid',
    NULL,
    v_vendor_name,
    v_note,
    v_attachment,
    v_user_id,
    v_transfer_content
  );

  RETURN QUERY SELECT v_expense_id, v_transfer_content;
END;
$$;

REVOKE ALL ON FUNCTION public.create_expense_transfer_intent(
  bigint,
  date,
  text,
  jsonb,
  text,
  text,
  text
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_expense_transfer_intent(
  bigint,
  date,
  text,
  jsonb,
  text,
  text,
  text
) TO authenticated;

COMMENT ON FUNCTION public.create_expense_transfer_intent(
  bigint,
  date,
  text,
  jsonb,
  text,
  text,
  text
) IS
  'Creates an unpaid operating expense with transfer_content and immutable vat_breakdown; amount is derived by trigger.';

-- Allow finance expense creators to upload optional HĐ GTGT evidence.
DROP POLICY IF EXISTS "inv_attach_insert" ON storage.objects;
CREATE POLICY "inv_attach_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    (bucket_id = 'inventory-attachments')
    AND ((storage.foldername(name))[1] = (auth_tenant_id())::text)
    AND (
      has_permission(NULL::bigint, 'procurement:grn_create')
      OR has_permission(NULL::bigint, 'supplier_return:create')
      OR has_permission(NULL::bigint, 'inventory:writeoff')
      OR has_permission_any('finance:expense_create')
    )
  );
