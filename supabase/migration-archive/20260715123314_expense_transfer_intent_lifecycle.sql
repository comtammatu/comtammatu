BEGIN;

ALTER TABLE public.expenses
  ADD COLUMN transfer_content text;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_transfer_content_shape_check
  CHECK (
    transfer_content IS NULL
    OR (
      category <> 'bank_deposit'
      AND char_length(transfer_content) <= 64
      AND transfer_content ~ (
        '^[A-Z0-9]{2,16} [A-Z0-9]{2,16} '
        || id::text
        || '$'
      )
      AND (
        (payment_method = 'unpaid' AND paid_at IS NULL)
        OR (payment_method = 'transfer' AND paid_at IS NOT NULL)
      )
    )
  );

CREATE POLICY expenses_transfer_content_insert_via_rpc
ON public.expenses
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (transfer_content IS NULL);

CREATE OR REPLACE FUNCTION private.sepay_payload_contains_transfer_content(
  p_payload jsonb,
  p_transfer_content text
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      COALESCE(p_payload->>'content', ''),
      COALESCE(p_payload->>'description', ''),
      COALESCE(p_payload->>'code', '')
    ]) AS candidate(raw_value)
    CROSS JOIN LATERAL (
      SELECT btrim(
        regexp_replace(
          upper(candidate.raw_value),
          '[^A-Z0-9]+',
          ' ',
          'g'
        )
      ) AS normalized_value
    ) normalized
    WHERE (' ' || normalized.normalized_value || ' ')
      LIKE ('% ' || p_transfer_content || ' %')
  );
$$;

REVOKE ALL ON FUNCTION private.sepay_payload_contains_transfer_content(jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_expense_transfer_intent(
  p_branch_id bigint,
  p_expense_date date,
  p_category text,
  p_amount numeric,
  p_vendor_name text DEFAULT NULL,
  p_note text DEFAULT NULL
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
    OR p_amount IS NULL
    OR p_amount <= 0
    OR p_amount > 10000000000
    OR char_length(v_vendor_name) > 200
    OR char_length(v_note) > 500
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
    payment_method,
    paid_at,
    vendor_name,
    note,
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
    p_amount,
    'unpaid',
    NULL,
    v_vendor_name,
    v_note,
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
  numeric,
  text,
  text
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_expense_transfer_intent(
  bigint,
  date,
  text,
  numeric,
  text,
  text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_finance_expense_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_expense_id bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.transfer_content IS NOT NULL
      AND (
        auth.uid() IS NULL
        OR NEW.tenant_id IS DISTINCT FROM public.auth_tenant_id()
        OR NOT public.auth_is_owner(auth.uid())
      )
    THEN
      RAISE EXCEPTION 'expense_transfer_intent_owner_required'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  v_expense_id := OLD.id;

  IF TG_OP = 'UPDATE'
    AND OLD.transfer_content IS NULL
    AND NEW.transfer_content IS NOT NULL
  THEN
    RAISE EXCEPTION 'expense_transfer_intent_requires_atomic_create'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.category <> 'bank_deposit'
    AND OLD.payment_method = 'unpaid'
    AND OLD.paid_at IS NULL
    AND NEW.payment_method = 'transfer'
    AND NEW.paid_at IS NOT NULL
    AND to_jsonb(NEW) - 'payment_method' - 'paid_at' - 'updated_at'
      = to_jsonb(OLD) - 'payment_method' - 'paid_at' - 'updated_at'
    AND EXISTS (
      SELECT 1
      FROM public.bank_transaction_expense_matches match
      JOIN public.webhook_events event
        ON event.tenant_id = match.tenant_id
       AND event.id = match.webhook_event_id
      WHERE match.tenant_id = OLD.tenant_id
        AND match.expense_id = OLD.id
        AND event.provider = 'sepay'
        AND event.signature_valid IS TRUE
        AND event.processing_status IS DISTINCT FROM 'failed'
        AND event.payment_id IS NULL
        AND lower(COALESCE(event.payload->>'transferType', '')) = 'out'
        AND COALESCE(event.payload->>'transferAmount', '')
          ~ '^-?[0-9]+(\.[0-9]+)?$'
        AND NEW.paid_at IS NOT DISTINCT FROM event.created_at
        AND (
          OLD.transfer_content IS NULL
          OR (
            abs((event.payload->>'transferAmount')::numeric) = OLD.amount
            AND private.sepay_payload_contains_transfer_content(
              event.payload,
              OLD.transfer_content
            )
          )
        )
    )
    AND (
      OLD.transfer_content IS NULL
      OR (
        SELECT count(*)
        FROM public.bank_transaction_expense_matches match
        WHERE match.tenant_id = OLD.tenant_id
          AND match.expense_id = OLD.id
      ) = 1
    )
  THEN
    RETURN NEW;
  END IF;

  IF OLD.transfer_content IS NOT NULL THEN
    RAISE EXCEPTION 'expense_transfer_intent_immutable'
      USING ERRCODE = '42501';
  END IF;

  IF (
    OLD.category = 'bank_deposit'
    OR (TG_OP = 'UPDATE' AND NEW.category = 'bank_deposit')
    OR EXISTS (
      SELECT 1
      FROM public.bank_transaction_expense_matches match
      WHERE match.tenant_id = OLD.tenant_id
        AND match.expense_id = v_expense_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.webhook_events event
      WHERE event.tenant_id = OLD.tenant_id
        AND event.provider = 'sepay'
        AND event.expense_id = v_expense_id
    )
  ) THEN
    RAISE EXCEPTION 'reconciled_expense_immutable'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_finance_expense_evidence_mutation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_expenses_guard_finance_evidence
  ON public.expenses;

CREATE TRIGGER trg_expenses_guard_finance_evidence
BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.guard_finance_expense_evidence_mutation();

CREATE OR REPLACE FUNCTION public.guard_historical_expense_split_match_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.expenses expense
    WHERE expense.tenant_id = OLD.tenant_id
      AND expense.id = OLD.expense_id
      AND expense.transfer_content IS NOT NULL
  )
    OR (
      TG_OP = 'UPDATE'
      AND EXISTS (
        SELECT 1
        FROM public.expenses expense
        WHERE expense.tenant_id = NEW.tenant_id
          AND expense.id = NEW.expense_id
          AND expense.transfer_content IS NOT NULL
      )
    )
  THEN
    RAISE EXCEPTION 'transfer_intent_match_immutable'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bank_transaction_expense_matches sibling
    WHERE sibling.tenant_id = OLD.tenant_id
      AND sibling.expense_id = OLD.expense_id
      AND sibling.webhook_event_id <> OLD.webhook_event_id
  ) THEN
    RAISE EXCEPTION 'historical_split_match_immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_historical_expense_split_match_mutation()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.assert_expense_transfer_content(
  p_expense_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_expense public.expenses%ROWTYPE;
  v_match_count integer;
  v_event_id bigint;
  v_event public.webhook_events%ROWTYPE;
BEGIN
  SELECT *
  INTO v_expense
  FROM public.expenses expense
  WHERE expense.id = p_expense_id;

  IF NOT FOUND OR v_expense.transfer_content IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*)::integer, min(match.webhook_event_id)
  INTO v_match_count, v_event_id
  FROM public.bank_transaction_expense_matches match
  WHERE match.tenant_id = v_expense.tenant_id
    AND match.expense_id = v_expense.id;

  IF v_expense.payment_method = 'unpaid'
    AND v_expense.paid_at IS NULL
    AND v_match_count = 0
  THEN
    RETURN;
  END IF;

  IF v_expense.payment_method = 'transfer'
    AND v_expense.paid_at IS NOT NULL
    AND v_match_count = 1
  THEN
    SELECT *
    INTO v_event
    FROM public.webhook_events event
    WHERE event.tenant_id = v_expense.tenant_id
      AND event.id = v_event_id;

    IF FOUND
      AND v_event.provider = 'sepay'
      AND v_event.signature_valid IS TRUE
      AND v_event.processing_status IS DISTINCT FROM 'failed'
      AND v_event.payment_id IS NULL
      AND v_event.expense_id IS NOT DISTINCT FROM v_expense.id
      AND lower(COALESCE(v_event.payload->>'transferType', '')) = 'out'
      AND COALESCE(v_event.payload->>'transferAmount', '')
        ~ '^-?[0-9]+(\.[0-9]+)?$'
      AND abs((v_event.payload->>'transferAmount')::numeric) = v_expense.amount
      AND v_expense.paid_at IS NOT DISTINCT FROM v_event.created_at
      AND private.sepay_payload_contains_transfer_content(
        v_event.payload,
        v_expense.transfer_content
      )
    THEN
      RETURN;
    END IF;
  END IF;

  RAISE EXCEPTION 'expense_transfer_intent_evidence_invalid'
    USING ERRCODE = '23514';
END;
$$;

REVOKE ALL ON FUNCTION private.assert_expense_transfer_content(bigint)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.check_expense_transfer_content_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM private.assert_expense_transfer_content(NEW.id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.check_expense_transfer_content_expense()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE CONSTRAINT TRIGGER trg_expenses_require_transfer_content_evidence
AFTER INSERT OR UPDATE ON public.expenses
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION private.check_expense_transfer_content_expense();

CREATE OR REPLACE FUNCTION private.check_expense_transfer_content_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM private.assert_expense_transfer_content(OLD.expense_id);
  END IF;

  IF TG_OP <> 'DELETE'
    AND (
      TG_OP = 'INSERT'
      OR OLD.expense_id IS DISTINCT FROM NEW.expense_id
    )
  THEN
    PERFORM private.assert_expense_transfer_content(NEW.expense_id);
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.check_expense_transfer_content_match()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE CONSTRAINT TRIGGER trg_expense_matches_require_transfer_content_evidence
AFTER INSERT OR UPDATE OR DELETE ON public.bank_transaction_expense_matches
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION private.check_expense_transfer_content_match();

CREATE OR REPLACE FUNCTION private.check_expense_transfer_content_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_old_event_id bigint;
  v_new_event_id bigint;
  v_old_expense_id bigint;
  v_new_expense_id bigint;
  v_expense_id bigint;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_old_event_id := OLD.id;
    v_old_expense_id := OLD.expense_id;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    v_new_event_id := NEW.id;
    v_new_expense_id := NEW.expense_id;
  END IF;

  FOR v_expense_id IN
    SELECT DISTINCT candidate.expense_id
    FROM (
      SELECT match.expense_id
      FROM public.bank_transaction_expense_matches match
      WHERE match.webhook_event_id IN (v_old_event_id, v_new_event_id)
      UNION ALL
      SELECT v_old_expense_id
      UNION ALL
      SELECT v_new_expense_id
    ) candidate
    WHERE candidate.expense_id IS NOT NULL
  LOOP
    PERFORM private.assert_expense_transfer_content(v_expense_id);
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.check_expense_transfer_content_event()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE CONSTRAINT TRIGGER trg_webhook_events_require_transfer_content_evidence
AFTER INSERT OR UPDATE OR DELETE ON public.webhook_events
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION private.check_expense_transfer_content_event();

CREATE OR REPLACE FUNCTION public.match_sepay_transaction_expenses(
  p_event_id bigint,
  p_expense_ids bigint[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_is_service boolean := COALESCE(auth.role() = 'service_role', false);
  v_tenant_id bigint := public.auth_tenant_id();
  v_user_id uuid := auth.uid();
  v_event public.webhook_events%ROWTYPE;
  v_expense_ids bigint[];
  v_current_expense_ids bigint[];
  v_first_expense_id bigint;
  v_transfer_amount numeric;
  v_expense_total numeric;
  v_current_has_historical_split boolean;
BEGIN
  IF NOT v_is_service THEN
    IF v_user_id IS NULL
      OR v_tenant_id IS NULL
      OR NOT public.auth_is_owner(v_user_id)
    THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT COALESCE(
    array_agg(DISTINCT expense_id ORDER BY expense_id),
    ARRAY[]::bigint[]
  )
  INTO v_expense_ids
  FROM unnest(COALESCE(p_expense_ids, ARRAY[]::bigint[])) AS selected(expense_id)
  WHERE selected.expense_id IS NOT NULL;

  IF v_is_service AND cardinality(v_expense_ids) <> 1 THEN
    RAISE EXCEPTION 'system_expense_match_requires_single_expense'
      USING ERRCODE = '23514';
  END IF;

  SELECT *
  INTO v_event
  FROM public.webhook_events
  WHERE id = p_event_id
    AND provider = 'sepay'
    AND (v_is_service OR tenant_id = v_tenant_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'webhook_event_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_is_service THEN
    v_tenant_id := v_event.tenant_id;
  END IF;

  IF v_event.signature_valid IS NOT TRUE THEN
    RAISE EXCEPTION 'webhook_event_signature_invalid' USING ERRCODE = '23514';
  END IF;

  IF v_event.processing_status = 'failed' THEN
    RAISE EXCEPTION 'webhook_event_failed' USING ERRCODE = '23514';
  END IF;

  IF v_event.payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'webhook_event_matches_payment' USING ERRCODE = '23514';
  END IF;

  IF lower(COALESCE(v_event.payload->>'transferType', '')) <> 'out' THEN
    RAISE EXCEPTION 'webhook_event_not_out' USING ERRCODE = '23514';
  END IF;

  SELECT CASE
    WHEN COALESCE(v_event.payload->>'transferAmount', '')
      ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN abs((v_event.payload->>'transferAmount')::numeric)
    ELSE NULL
  END
  INTO v_transfer_amount;

  IF v_transfer_amount IS NULL OR v_transfer_amount <= 0 THEN
    RAISE EXCEPTION 'expense_amount_mismatch' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(
    array_agg(match.expense_id ORDER BY match.expense_id),
    ARRAY[]::bigint[]
  )
  INTO v_current_expense_ids
  FROM public.bank_transaction_expense_matches match
  WHERE match.tenant_id = v_tenant_id
    AND match.webhook_event_id = p_event_id;

  PERFORM 1
  FROM public.expenses expense
  WHERE expense.tenant_id = v_tenant_id
    AND expense.id = ANY(v_current_expense_ids || v_expense_ids)
  ORDER BY expense.id
  FOR UPDATE;

  IF v_current_expense_ids <> v_expense_ids
    AND EXISTS (
      SELECT 1
      FROM public.expenses expense
      WHERE expense.tenant_id = v_tenant_id
        AND expense.id = ANY(v_current_expense_ids)
        AND expense.transfer_content IS NOT NULL
    )
  THEN
    RAISE EXCEPTION 'transfer_intent_match_immutable'
      USING ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.bank_transaction_expense_matches match
    WHERE match.tenant_id = v_tenant_id
      AND match.expense_id = ANY(v_current_expense_ids)
      AND match.webhook_event_id <> p_event_id
  )
  INTO v_current_has_historical_split;

  IF v_current_has_historical_split
    AND v_current_expense_ids = v_expense_ids
  THEN
    RETURN jsonb_build_object(
      'matched_count', cardinality(v_current_expense_ids),
      'expense_ids', to_jsonb(v_current_expense_ids),
      'matched_amount', v_transfer_amount
    );
  END IF;

  IF v_current_has_historical_split THEN
    RAISE EXCEPTION 'historical_split_match_immutable'
      USING ERRCODE = '23514';
  END IF;

  IF cardinality(v_expense_ids) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(v_expense_ids) AS selected(expense_id)
      LEFT JOIN public.expenses expense
        ON expense.id = selected.expense_id
       AND expense.tenant_id = v_tenant_id
       AND expense.payment_method IN ('transfer', 'unpaid')
       AND expense.category <> 'bank_deposit'
      WHERE expense.id IS NULL
    ) THEN
      RAISE EXCEPTION 'expense_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF cardinality(v_expense_ids) > 1
      AND EXISTS (
        SELECT 1
        FROM public.expenses expense
        WHERE expense.tenant_id = v_tenant_id
          AND expense.id = ANY(v_expense_ids)
          AND expense.transfer_content IS NOT NULL
      )
    THEN
      RAISE EXCEPTION 'transfer_intent_requires_single_expense'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.expenses expense
      WHERE expense.tenant_id = v_tenant_id
        AND expense.id = ANY(v_expense_ids)
        AND expense.transfer_content IS NOT NULL
        AND NOT private.sepay_payload_contains_transfer_content(
          v_event.payload,
          expense.transfer_content
        )
    ) THEN
      RAISE EXCEPTION 'expense_transfer_content_mismatch'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.bank_transaction_expense_matches match
      WHERE match.tenant_id = v_tenant_id
        AND match.expense_id = ANY(v_expense_ids)
        AND match.webhook_event_id <> p_event_id
    ) THEN
      RAISE EXCEPTION 'expense_already_matched' USING ERRCODE = '23505';
    END IF;

    SELECT COALESCE(sum(expense.amount), 0)
    INTO v_expense_total
    FROM public.expenses expense
    WHERE expense.tenant_id = v_tenant_id
      AND expense.id = ANY(v_expense_ids);

    IF v_expense_total <> v_transfer_amount THEN
      RAISE EXCEPTION 'expense_amount_mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- The evidence graph spans three tables, so its constraint triggers must
  -- observe the final graph rather than any intermediate statement.
  SET CONSTRAINTS
    public.trg_expenses_require_bank_deposit_evidence,
    public.trg_webhook_events_require_finance_evidence,
    public.trg_expense_matches_require_sepay_evidence,
    public.trg_expenses_require_transfer_content_evidence,
    public.trg_expense_matches_require_transfer_content_evidence,
    public.trg_webhook_events_require_transfer_content_evidence
  DEFERRED;

  DELETE FROM public.bank_transaction_expense_matches
  WHERE tenant_id = v_tenant_id
    AND webhook_event_id = p_event_id
    AND NOT (expense_id = ANY(v_expense_ids));

  INSERT INTO public.bank_transaction_expense_matches (
    tenant_id,
    webhook_event_id,
    expense_id,
    created_by
  )
  SELECT
    v_tenant_id,
    p_event_id,
    selected.expense_id,
    CASE WHEN v_is_service THEN NULL ELSE v_user_id END
  FROM unnest(v_expense_ids) AS selected(expense_id)
  ON CONFLICT DO NOTHING;

  IF cardinality(v_expense_ids) > 0 THEN
    UPDATE public.expenses
    SET
      payment_method = 'transfer',
      paid_at = COALESCE(paid_at, v_event.created_at, now())
    WHERE tenant_id = v_tenant_id
      AND id = ANY(v_expense_ids)
      AND payment_method = 'unpaid';
  END IF;

  v_first_expense_id := v_expense_ids[1];

  UPDATE public.webhook_events
  SET expense_id = v_first_expense_id
  WHERE id = p_event_id
    AND tenant_id = v_tenant_id;

  SET CONSTRAINTS
    public.trg_expenses_require_bank_deposit_evidence,
    public.trg_webhook_events_require_finance_evidence,
    public.trg_expense_matches_require_sepay_evidence,
    public.trg_expenses_require_transfer_content_evidence,
    public.trg_expense_matches_require_transfer_content_evidence,
    public.trg_webhook_events_require_transfer_content_evidence
  IMMEDIATE;

  RETURN jsonb_build_object(
    'matched_count', cardinality(v_expense_ids),
    'expense_ids', to_jsonb(v_expense_ids),
    'matched_amount', CASE
      WHEN cardinality(v_expense_ids) = 0 THEN 0
      ELSE v_transfer_amount
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.match_sepay_transaction_expenses(bigint, bigint[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_sepay_transaction_expenses(bigint, bigint[])
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.match_sepay_transfer_intent_event(
  p_event_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_event public.webhook_events%ROWTYPE;
  v_transfer_amount numeric;
  v_candidate_ids bigint[];
  v_expense_id bigint;
  v_match_result jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT event.*
  INTO v_event
  FROM public.webhook_events event
  WHERE event.id = p_event_id
    AND event.provider = 'sepay'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'webhook_event_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_event.signature_valid IS NOT TRUE THEN
    RAISE EXCEPTION 'webhook_event_signature_invalid' USING ERRCODE = '23514';
  END IF;

  IF v_event.processing_status = 'failed' THEN
    RAISE EXCEPTION 'webhook_event_failed' USING ERRCODE = '23514';
  END IF;

  IF v_event.payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'webhook_event_matches_payment' USING ERRCODE = '23514';
  END IF;

  IF lower(COALESCE(v_event.payload->>'transferType', '')) <> 'out' THEN
    RAISE EXCEPTION 'webhook_event_not_out' USING ERRCODE = '23514';
  END IF;

  SELECT CASE
    WHEN COALESCE(v_event.payload->>'transferAmount', '')
      ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN abs((v_event.payload->>'transferAmount')::numeric)
    ELSE NULL
  END
  INTO v_transfer_amount;

  IF v_transfer_amount IS NULL OR v_transfer_amount <= 0 THEN
    RAISE EXCEPTION 'expense_amount_mismatch' USING ERRCODE = '23514';
  END IF;

  WITH payload_tokens AS (
    SELECT DISTINCT token.value::bigint AS expense_id
    FROM unnest(ARRAY[
      COALESCE(v_event.payload->>'content', ''),
      COALESCE(v_event.payload->>'description', ''),
      COALESCE(v_event.payload->>'code', '')
    ]) AS candidate(raw_value)
    CROSS JOIN LATERAL regexp_split_to_table(
      btrim(regexp_replace(candidate.raw_value, '[^0-9]+', ' ', 'g')),
      ' +'
    ) AS token(value)
    WHERE token.value ~ '^[0-9]{1,18}$'
  )
  SELECT COALESCE(
    array_agg(expense.id ORDER BY expense.id),
    ARRAY[]::bigint[]
  )
  INTO v_candidate_ids
  FROM payload_tokens token
  JOIN public.expenses expense
    ON expense.id = token.expense_id
   AND expense.tenant_id = v_event.tenant_id
  WHERE expense.transfer_content IS NOT NULL
    AND expense.category <> 'bank_deposit'
    AND expense.payment_method IN ('unpaid', 'transfer')
    AND expense.amount = v_transfer_amount
    AND private.sepay_payload_contains_transfer_content(
      v_event.payload,
      expense.transfer_content
    );

  IF cardinality(v_candidate_ids) = 0 THEN
    RETURN jsonb_build_object('matched', false);
  END IF;

  IF cardinality(v_candidate_ids) <> 1 THEN
    RAISE EXCEPTION 'expense_transfer_intent_ambiguous'
      USING ERRCODE = '23505';
  END IF;

  v_expense_id := v_candidate_ids[1];
  v_match_result := public.match_sepay_transaction_expenses(
    p_event_id,
    ARRAY[v_expense_id]
  );

  UPDATE public.webhook_events
  SET processing_status = 'processed',
      http_status = 200,
      error_code = NULL,
      processed_at = COALESCE(processed_at, now())
  WHERE id = p_event_id
    AND tenant_id = v_event.tenant_id;

  RETURN v_match_result || jsonb_build_object(
    'matched', true,
    'expense_id', v_expense_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.match_sepay_transfer_intent_event(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_sepay_transfer_intent_event(bigint)
  TO service_role;

COMMIT;
