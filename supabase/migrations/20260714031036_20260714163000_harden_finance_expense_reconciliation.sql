BEGIN;

LOCK TABLE
  public.webhook_events,
  public.expenses,
  public.bank_transaction_expense_matches
IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  v_target record;
  v_event_count integer;
  v_event_id bigint;
  v_event public.webhook_events%ROWTYPE;
  v_event_time timestamptz;
  v_expense_count integer;
  v_expense_id bigint;
  v_expense public.expenses%ROWTYPE;
  v_updated integer;
BEGIN
  FOR v_target IN
    SELECT *
    FROM (VALUES
      ('FT26187508026096'::text, 46200000::numeric, '2026-07-07'::date),
      ('FT26190001002824'::text, 20500000::numeric, '2026-07-09'::date),
      ('FT26194582432724'::text, 30650000::numeric, '2026-07-13'::date)
    ) AS target(reference_code, amount, expense_date)
  LOOP
    SELECT
      count(*)::integer,
      min(we.id)
    INTO v_event_count, v_event_id
    FROM public.webhook_events we
    WHERE we.provider = 'sepay'
      AND we.payload->>'referenceCode' = v_target.reference_code;

    IF v_event_count = 0 THEN
      SELECT count(*)::integer
      INTO v_expense_count
      FROM public.expenses e
      WHERE e.category = 'bank_deposit'
        AND e.amount = v_target.amount
        AND e.expense_date = v_target.expense_date;

      IF v_expense_count = 0 THEN
        CONTINUE;
      END IF;

      RAISE EXCEPTION 'historical_bank_deposit_adjudication_ambiguous:%',
        v_target.reference_code
        USING ERRCODE = '23514';
    END IF;

    IF v_event_count <> 1 THEN
      RAISE EXCEPTION 'historical_bank_deposit_adjudication_ambiguous:%',
        v_target.reference_code
        USING ERRCODE = '23514';
    END IF;

    SELECT *
    INTO STRICT v_event
    FROM public.webhook_events we
    WHERE we.id = v_event_id
    FOR UPDATE;

    v_event_time := COALESCE(v_event.processed_at, v_event.created_at);

    SELECT count(*)::integer, min(e.id)
    INTO v_expense_count, v_expense_id
    FROM public.expenses e
    WHERE e.category = 'bank_deposit'
      AND e.tenant_id = v_event.tenant_id
      AND e.amount = v_target.amount
      AND e.expense_date = v_target.expense_date;

    IF v_expense_count <> 1 THEN
      RAISE EXCEPTION 'historical_bank_deposit_adjudication_ambiguous:%',
        v_target.reference_code
        USING ERRCODE = '23514';
    END IF;

    SELECT *
    INTO STRICT v_expense
    FROM public.expenses e
    WHERE e.id = v_expense_id
    FOR UPDATE;

    IF v_event.signature_valid IS TRUE
      AND v_event.payment_id IS NULL
      AND lower(COALESCE(v_event.payload->>'transferType', '')) = 'in'
      AND COALESCE(v_event.payload->>'transferAmount', '')
        ~ '^[0-9]+(\.[0-9]+)?$'
      AND (v_event.payload->>'transferAmount')::numeric = v_target.amount
      AND v_event.processing_status = 'processed'
      AND v_event.error_code IS NULL
      AND v_event.expense_id = v_expense.id
      AND v_event.processed_at IS NOT NULL
      AND v_expense.payment_method = 'cash'
      AND v_expense.paid_at IS NOT DISTINCT FROM v_event.processed_at
    THEN
      CONTINUE;
    END IF;

    IF v_event.signature_valid IS NOT TRUE
      OR v_event.payment_id IS NOT NULL
      OR lower(COALESCE(v_event.payload->>'transferType', '')) <> 'in'
      OR COALESCE(v_event.payload->>'transferAmount', '')
        !~ '^[0-9]+(\.[0-9]+)?$'
      OR (CASE
        WHEN COALESCE(v_event.payload->>'transferAmount', '')
          ~ '^[0-9]+(\.[0-9]+)?$'
          THEN (v_event.payload->>'transferAmount')::numeric
            <> v_target.amount
        ELSE true
      END)
      OR v_event.processing_status <> 'failed'
      OR v_event.error_code <> 'missing_payment_code'
      OR v_event.expense_id IS NOT NULL
      OR v_expense.payment_method <> 'cash'
      OR v_expense.paid_at IS NOT NULL
      OR EXISTS (
        SELECT 1
        FROM public.webhook_events linked
        WHERE linked.tenant_id = v_expense.tenant_id
          AND linked.expense_id = v_expense.id
      )
    THEN
      RAISE EXCEPTION 'historical_bank_deposit_adjudication_incomplete:%',
        v_target.reference_code
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.expenses
    SET paid_at = v_event_time,
        updated_at = now()
    WHERE id = v_expense.id
      AND tenant_id = v_event.tenant_id
      AND category = 'bank_deposit'
      AND payment_method = 'cash'
      AND amount = v_target.amount
      AND expense_date = v_target.expense_date
      AND paid_at IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'historical_bank_deposit_expense_changed:%',
        v_target.reference_code
        USING ERRCODE = '40001';
    END IF;

    UPDATE public.webhook_events
    SET expense_id = v_expense.id,
        processing_status = 'processed',
        error_code = NULL,
        processed_at = v_event_time
    WHERE id = v_event.id
      AND tenant_id = v_event.tenant_id
      AND provider = 'sepay'
      AND payload->>'referenceCode' = v_target.reference_code
      AND signature_valid IS TRUE
      AND processing_status = 'failed'
      AND error_code = 'missing_payment_code'
      AND payment_id IS NULL
      AND expense_id IS NULL
      AND lower(COALESCE(payload->>'transferType', '')) = 'in'
      AND COALESCE(payload->>'transferAmount', '')
        ~ '^[0-9]+(\.[0-9]+)?$'
      AND (payload->>'transferAmount')::numeric = v_target.amount;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'historical_bank_deposit_event_changed:%',
        v_target.reference_code
        USING ERRCODE = '40001';
    END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    WITH expense_degree AS (
      SELECT tenant_id, expense_id, count(DISTINCT webhook_event_id) AS degree
      FROM public.bank_transaction_expense_matches
      GROUP BY tenant_id, expense_id
    ),
    event_degree AS (
      SELECT tenant_id, webhook_event_id, count(DISTINCT expense_id) AS degree
      FROM public.bank_transaction_expense_matches
      GROUP BY tenant_id, webhook_event_id
    )
    SELECT 1
    FROM public.bank_transaction_expense_matches m
    JOIN expense_degree xd
      ON xd.tenant_id = m.tenant_id
     AND xd.expense_id = m.expense_id
    JOIN event_degree ed
      ON ed.tenant_id = m.tenant_id
     AND ed.webhook_event_id = m.webhook_event_id
    WHERE xd.degree > 1
      AND ed.degree > 1
  ) THEN
    RAISE EXCEPTION 'historical_expense_match_graph_ambiguous'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    WITH multi_event_expenses AS (
      SELECT tenant_id, expense_id
      FROM public.bank_transaction_expense_matches
      GROUP BY tenant_id, expense_id
      HAVING count(DISTINCT webhook_event_id) > 1
    ),
    conservation AS (
      SELECT
        me.tenant_id,
        me.expense_id,
        e.amount AS expense_amount,
        bool_and(
          e.payment_method = 'transfer'
          AND e.category <> 'bank_deposit'
          AND we.provider = 'sepay'
          AND we.signature_valid IS TRUE
          AND we.processing_status IS DISTINCT FROM 'failed'
          AND we.payment_id IS NULL
          AND lower(COALESCE(we.payload->>'transferType', '')) = 'out'
          AND COALESCE(we.payload->>'transferAmount', '')
            ~ '^-?[0-9]+(\.[0-9]+)?$'
        ) AS valid_events,
        sum(
          CASE
            WHEN COALESCE(we.payload->>'transferAmount', '')
              ~ '^-?[0-9]+(\.[0-9]+)?$'
              THEN abs((we.payload->>'transferAmount')::numeric)
            ELSE 0
          END
        ) AS event_total
      FROM multi_event_expenses me
      JOIN public.expenses e
        ON e.tenant_id = me.tenant_id
       AND e.id = me.expense_id
      JOIN public.bank_transaction_expense_matches m
        ON m.tenant_id = me.tenant_id
       AND m.expense_id = me.expense_id
      JOIN public.webhook_events we
        ON we.tenant_id = m.tenant_id
       AND we.id = m.webhook_event_id
      GROUP BY me.tenant_id, me.expense_id, e.amount
    )
    SELECT 1
    FROM conservation
    WHERE valid_events IS NOT TRUE
      OR event_total <> expense_amount
  ) THEN
    RAISE EXCEPTION 'historical_split_expense_amount_mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    WITH multi_expense_events AS (
      SELECT tenant_id, webhook_event_id
      FROM public.bank_transaction_expense_matches
      GROUP BY tenant_id, webhook_event_id
      HAVING count(DISTINCT expense_id) > 1
    ),
    conservation AS (
      SELECT
        mee.tenant_id,
        mee.webhook_event_id,
        sum(e.amount) AS expense_total,
        bool_and(
          e.payment_method = 'transfer'
          AND e.category <> 'bank_deposit'
          AND we.provider = 'sepay'
          AND we.signature_valid IS TRUE
          AND we.processing_status IS DISTINCT FROM 'failed'
          AND we.payment_id IS NULL
          AND lower(COALESCE(we.payload->>'transferType', '')) = 'out'
          AND COALESCE(we.payload->>'transferAmount', '')
            ~ '^-?[0-9]+(\.[0-9]+)?$'
        ) AS valid_event,
        max(
          CASE
            WHEN COALESCE(we.payload->>'transferAmount', '')
              ~ '^-?[0-9]+(\.[0-9]+)?$'
              THEN abs((we.payload->>'transferAmount')::numeric)
            ELSE 0
          END
        ) AS event_amount
      FROM multi_expense_events mee
      JOIN public.bank_transaction_expense_matches m
        ON m.tenant_id = mee.tenant_id
       AND m.webhook_event_id = mee.webhook_event_id
      JOIN public.expenses e
        ON e.tenant_id = m.tenant_id
       AND e.id = m.expense_id
      JOIN public.webhook_events we
        ON we.tenant_id = m.tenant_id
       AND we.id = m.webhook_event_id
      GROUP BY mee.tenant_id, mee.webhook_event_id
    )
    SELECT 1
    FROM conservation
    WHERE valid_event IS NOT TRUE
      OR expense_total <> event_amount
  ) THEN
    RAISE EXCEPTION 'historical_grouped_expense_amount_mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    WITH expense_degree AS (
      SELECT tenant_id, expense_id, count(DISTINCT webhook_event_id) AS degree
      FROM public.bank_transaction_expense_matches
      GROUP BY tenant_id, expense_id
    ),
    event_degree AS (
      SELECT tenant_id, webhook_event_id, count(DISTINCT expense_id) AS degree
      FROM public.bank_transaction_expense_matches
      GROUP BY tenant_id, webhook_event_id
    )
    SELECT 1
    FROM public.bank_transaction_expense_matches m
    JOIN expense_degree xd
      ON xd.tenant_id = m.tenant_id
     AND xd.expense_id = m.expense_id
     AND xd.degree = 1
    JOIN event_degree ed
      ON ed.tenant_id = m.tenant_id
     AND ed.webhook_event_id = m.webhook_event_id
     AND ed.degree = 1
    JOIN public.expenses e
      ON e.tenant_id = m.tenant_id
     AND e.id = m.expense_id
    JOIN public.webhook_events we
      ON we.tenant_id = m.tenant_id
     AND we.id = m.webhook_event_id
    WHERE e.payment_method <> 'transfer'
      OR e.category = 'bank_deposit'
      OR we.provider <> 'sepay'
      OR we.signature_valid IS NOT TRUE
      OR we.processing_status IS NOT DISTINCT FROM 'failed'
      OR we.payment_id IS NOT NULL
      OR lower(COALESCE(we.payload->>'transferType', '')) <> 'out'
      OR COALESCE(we.payload->>'transferAmount', '')
        !~ '^-?[0-9]+(\.[0-9]+)?$'
      OR CASE
        WHEN COALESCE(we.payload->>'transferAmount', '')
          ~ '^-?[0-9]+(\.[0-9]+)?$'
          THEN abs((we.payload->>'transferAmount')::numeric) <> e.amount
        ELSE true
      END
  ) THEN
    RAISE EXCEPTION 'historical_single_expense_amount_mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.webhook_events we
    JOIN (
      SELECT tenant_id, webhook_event_id, min(expense_id) AS canonical_expense_id
      FROM public.bank_transaction_expense_matches
      GROUP BY tenant_id, webhook_event_id
    ) matched
      ON matched.tenant_id = we.tenant_id
     AND matched.webhook_event_id = we.id
    WHERE we.expense_id IS DISTINCT FROM matched.canonical_expense_id
  ) THEN
    RAISE EXCEPTION 'historical_expense_match_link_drift'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.webhook_events we
    LEFT JOIN public.expenses e
      ON e.tenant_id = we.tenant_id
     AND e.id = we.expense_id
    WHERE we.expense_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.bank_transaction_expense_matches m
        WHERE m.tenant_id = we.tenant_id
          AND m.webhook_event_id = we.id
      )
      AND (e.id IS NULL OR e.category <> 'bank_deposit')
  ) THEN
    RAISE EXCEPTION 'historical_webhook_expense_link_drift'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.expenses e
    WHERE e.category = 'bank_deposit'
      AND (
        e.payment_method IS DISTINCT FROM 'cash'
        OR NOT EXISTS (
        SELECT 1
        FROM public.webhook_events we
        WHERE we.tenant_id = e.tenant_id
          AND we.provider = 'sepay'
          AND we.expense_id = e.id
          AND we.signature_valid IS TRUE
          AND we.processing_status <> 'failed'
          AND we.payment_id IS NULL
          AND lower(COALESCE(we.payload->>'transferType', '')) = 'in'
          AND COALESCE(we.payload->>'transferAmount', '')
            ~ '^[0-9]+(\.[0-9]+)?$'
          AND (we.payload->>'transferAmount')::numeric = e.amount
        )
      )
  ) THEN
    RAISE EXCEPTION 'historical_bank_deposit_evidence_missing'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_finance_expense_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expense_id bigint := OLD.id;
BEGIN
  IF (
    OLD.category = 'bank_deposit'
    OR (TG_OP = 'UPDATE' AND NEW.category = 'bank_deposit')
    OR EXISTS (
      SELECT 1
      FROM public.bank_transaction_expense_matches m
      WHERE m.tenant_id = OLD.tenant_id
        AND m.expense_id = v_expense_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.webhook_events we
      WHERE we.tenant_id = OLD.tenant_id
        AND we.provider = 'sepay'
        AND we.expense_id = v_expense_id
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
BEFORE UPDATE OR DELETE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.guard_finance_expense_evidence_mutation();

CREATE OR REPLACE FUNCTION public.assert_bank_deposit_evidence(
  p_tenant_id bigint,
  p_expense_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expense public.expenses%ROWTYPE;
BEGIN
  SELECT *
  INTO v_expense
  FROM public.expenses e
  WHERE e.tenant_id = p_tenant_id
    AND e.id = p_expense_id;

  IF NOT FOUND OR v_expense.category <> 'bank_deposit' THEN
    RETURN;
  END IF;

  IF v_expense.payment_method <> 'cash'
    OR NOT EXISTS (
      SELECT 1
      FROM public.webhook_events we
      WHERE we.tenant_id = v_expense.tenant_id
        AND we.provider = 'sepay'
        AND we.expense_id = v_expense.id
        AND we.signature_valid IS TRUE
        AND we.processing_status <> 'failed'
        AND we.payment_id IS NULL
        AND lower(COALESCE(we.payload->>'transferType', '')) = 'in'
        AND COALESCE(we.payload->>'transferAmount', '')
          ~ '^[0-9]+(\.[0-9]+)?$'
        AND (we.payload->>'transferAmount')::numeric = v_expense.amount
    )
  THEN
    RAISE EXCEPTION 'bank_deposit_requires_verified_sepay_event'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_bank_deposit_evidence(bigint, bigint)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assert_sepay_expense_match_evidence(
  p_tenant_id bigint,
  p_event_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event public.webhook_events%ROWTYPE;
  v_match_count integer;
  v_expense_id bigint;
  v_has_historical_split boolean;
  v_transfer_amount numeric;
  v_expense_total numeric;
  v_component_total numeric;
  v_component_valid boolean;
BEGIN
  SELECT
    count(*)::integer,
    min(m.expense_id)
  INTO v_match_count, v_expense_id
  FROM public.bank_transaction_expense_matches m
  WHERE m.tenant_id = p_tenant_id
    AND m.webhook_event_id = p_event_id;

  IF v_match_count = 0 THEN
    SELECT *
    INTO v_event
    FROM public.webhook_events we
    WHERE we.tenant_id = p_tenant_id
      AND we.id = p_event_id;

    IF NOT FOUND OR v_event.expense_id IS NULL THEN
      RETURN;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.expenses e
      WHERE e.tenant_id = v_event.tenant_id
        AND e.id = v_event.expense_id
        AND e.category = 'bank_deposit'
    ) THEN
      RETURN;
    END IF;

    RAISE EXCEPTION 'webhook_expense_link_drift'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bank_transaction_expense_matches m
    JOIN public.expenses e
      ON e.tenant_id = m.tenant_id
     AND e.id = m.expense_id
    WHERE m.tenant_id = p_tenant_id
      AND m.webhook_event_id = p_event_id
      AND (
        e.payment_method <> 'transfer'
        OR e.category = 'bank_deposit'
      )
  ) THEN
    RAISE EXCEPTION 'sepay_expense_match_shape_invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.bank_transaction_expense_matches current_match
    JOIN public.bank_transaction_expense_matches sibling
      ON sibling.tenant_id = current_match.tenant_id
     AND sibling.expense_id = current_match.expense_id
     AND sibling.webhook_event_id <> current_match.webhook_event_id
    WHERE current_match.tenant_id = p_tenant_id
      AND current_match.webhook_event_id = p_event_id
  )
  INTO v_has_historical_split;

  SELECT *
  INTO v_event
  FROM public.webhook_events we
  WHERE we.tenant_id = p_tenant_id
    AND we.id = p_event_id;

  IF NOT FOUND
    OR v_event.provider <> 'sepay'
    OR v_event.signature_valid IS NOT TRUE
    OR v_event.processing_status IS NOT DISTINCT FROM 'failed'
    OR v_event.payment_id IS NOT NULL
    OR v_event.expense_id IS DISTINCT FROM v_expense_id
    OR lower(COALESCE(v_event.payload->>'transferType', '')) <> 'out'
    OR COALESCE(v_event.payload->>'transferAmount', '')
      !~ '^-?[0-9]+(\.[0-9]+)?$'
  THEN
    RAISE EXCEPTION 'sepay_expense_match_evidence_invalid'
      USING ERRCODE = '23514';
  END IF;

  v_transfer_amount := abs((v_event.payload->>'transferAmount')::numeric);
  IF v_transfer_amount <= 0 THEN
    RAISE EXCEPTION 'sepay_expense_match_evidence_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF v_has_historical_split THEN
    IF v_match_count <> 1 THEN
      RAISE EXCEPTION 'historical_expense_match_graph_ambiguous'
        USING ERRCODE = '23514';
    END IF;

    SELECT
      e.amount,
      sum(
        CASE
          WHEN COALESCE(we.payload->>'transferAmount', '')
            ~ '^-?[0-9]+(\.[0-9]+)?$'
            THEN abs((we.payload->>'transferAmount')::numeric)
          ELSE 0
        END
      ),
      bool_and(
        e.payment_method = 'transfer'
        AND e.category <> 'bank_deposit'
        AND we.provider = 'sepay'
        AND we.signature_valid IS TRUE
        AND we.processing_status IS DISTINCT FROM 'failed'
        AND we.payment_id IS NULL
        AND lower(COALESCE(we.payload->>'transferType', '')) = 'out'
        AND COALESCE(we.payload->>'transferAmount', '')
          ~ '^-?[0-9]+(\.[0-9]+)?$'
      )
    INTO v_expense_total, v_component_total, v_component_valid
    FROM public.expenses e
    JOIN public.bank_transaction_expense_matches m
      ON m.tenant_id = e.tenant_id
     AND m.expense_id = e.id
    JOIN public.webhook_events we
      ON we.tenant_id = m.tenant_id
     AND we.id = m.webhook_event_id
    WHERE e.tenant_id = p_tenant_id
      AND e.id = v_expense_id
    GROUP BY e.amount;

    IF v_component_valid IS NOT TRUE
      OR v_component_total <> v_expense_total
    THEN
      RAISE EXCEPTION 'historical_split_expense_amount_mismatch'
        USING ERRCODE = '23514';
    END IF;

    RETURN;
  END IF;

  SELECT COALESCE(sum(e.amount), 0)
  INTO v_expense_total
  FROM public.bank_transaction_expense_matches m
  JOIN public.expenses e
    ON e.tenant_id = m.tenant_id
   AND e.id = m.expense_id
  WHERE m.tenant_id = p_tenant_id
    AND m.webhook_event_id = p_event_id;

  IF v_expense_total <> v_transfer_amount THEN
    RAISE EXCEPTION 'expense_amount_mismatch' USING ERRCODE = '23514';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_sepay_expense_match_evidence(bigint, bigint)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_expense_bank_deposit_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_bank_deposit_evidence(NEW.tenant_id, NEW.id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.check_expense_bank_deposit_evidence()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_expenses_require_bank_deposit_evidence
  ON public.expenses;

CREATE CONSTRAINT TRIGGER trg_expenses_require_bank_deposit_evidence
AFTER INSERT OR UPDATE ON public.expenses
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.check_expense_bank_deposit_evidence();

CREATE OR REPLACE FUNCTION public.guard_webhook_finance_evidence_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.bank_transaction_expense_matches m
    WHERE m.tenant_id = OLD.tenant_id
      AND m.webhook_event_id = OLD.id
  )
    OR EXISTS (
      SELECT 1
      FROM public.expenses e
      WHERE e.tenant_id = OLD.tenant_id
        AND e.id = OLD.expense_id
        AND e.category = 'bank_deposit'
    )
  THEN
    RAISE EXCEPTION 'reconciled_webhook_evidence_immutable'
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_webhook_finance_evidence_delete()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_webhook_events_guard_finance_evidence_delete
  ON public.webhook_events;

CREATE TRIGGER trg_webhook_events_guard_finance_evidence_delete
BEFORE DELETE ON public.webhook_events
FOR EACH ROW
EXECUTE FUNCTION public.guard_webhook_finance_evidence_delete();

CREATE OR REPLACE FUNCTION public.check_webhook_finance_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF OLD.expense_id IS NOT NULL THEN
      PERFORM public.assert_bank_deposit_evidence(OLD.tenant_id, OLD.expense_id);
    END IF;
    PERFORM public.assert_sepay_expense_match_evidence(OLD.tenant_id, OLD.id);
  END IF;

  IF TG_OP <> 'DELETE'
    AND (
      TG_OP = 'INSERT'
      OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
      OR OLD.id IS DISTINCT FROM NEW.id
      OR OLD.expense_id IS DISTINCT FROM NEW.expense_id
    )
  THEN
    IF NEW.expense_id IS NOT NULL THEN
      PERFORM public.assert_bank_deposit_evidence(NEW.tenant_id, NEW.expense_id);
    END IF;
    PERFORM public.assert_sepay_expense_match_evidence(NEW.tenant_id, NEW.id);
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.check_webhook_finance_evidence()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_webhook_events_require_finance_evidence
  ON public.webhook_events;

CREATE CONSTRAINT TRIGGER trg_webhook_events_require_finance_evidence
AFTER INSERT OR UPDATE OR DELETE ON public.webhook_events
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.check_webhook_finance_evidence();

CREATE OR REPLACE FUNCTION public.guard_historical_expense_split_match_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
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

DROP TRIGGER IF EXISTS trg_expense_matches_guard_historical_split
  ON public.bank_transaction_expense_matches;

CREATE TRIGGER trg_expense_matches_guard_historical_split
BEFORE UPDATE OR DELETE ON public.bank_transaction_expense_matches
FOR EACH ROW
EXECUTE FUNCTION public.guard_historical_expense_split_match_mutation();

CREATE OR REPLACE FUNCTION public.check_sepay_expense_match_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM public.assert_sepay_expense_match_evidence(
      OLD.tenant_id,
      OLD.webhook_event_id
    );
  END IF;

  IF TG_OP <> 'DELETE'
    AND (
      TG_OP = 'INSERT'
      OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
      OR OLD.webhook_event_id IS DISTINCT FROM NEW.webhook_event_id
    )
  THEN
    PERFORM public.assert_sepay_expense_match_evidence(
      NEW.tenant_id,
      NEW.webhook_event_id
    );
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.check_sepay_expense_match_evidence()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_expense_matches_require_sepay_evidence
  ON public.bank_transaction_expense_matches;

CREATE CONSTRAINT TRIGGER trg_expense_matches_require_sepay_evidence
AFTER INSERT OR UPDATE OR DELETE ON public.bank_transaction_expense_matches
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.check_sepay_expense_match_evidence();

REVOKE ALL
  ON TABLE public.bank_transaction_expense_matches
  FROM service_role;
GRANT SELECT
  ON TABLE public.bank_transaction_expense_matches
  TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON TABLE public.bank_transaction_expense_matches
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.match_sepay_transaction_expenses(
  p_event_id bigint,
  p_expense_ids bigint[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
    array_agg(m.expense_id ORDER BY m.expense_id),
    ARRAY[]::bigint[]
  )
  INTO v_current_expense_ids
  FROM public.bank_transaction_expense_matches m
  WHERE m.tenant_id = v_tenant_id
    AND m.webhook_event_id = p_event_id;

  PERFORM 1
  FROM public.expenses e
  WHERE e.tenant_id = v_tenant_id
    AND e.id = ANY(v_current_expense_ids || v_expense_ids)
  ORDER BY e.id
  FOR UPDATE;

  SELECT EXISTS (
    SELECT 1
    FROM public.bank_transaction_expense_matches m
    WHERE m.tenant_id = v_tenant_id
      AND m.expense_id = ANY(v_current_expense_ids)
      AND m.webhook_event_id <> p_event_id
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
      LEFT JOIN public.expenses e
        ON e.id = selected.expense_id
       AND e.tenant_id = v_tenant_id
       AND e.payment_method IN ('transfer', 'unpaid')
       AND e.category <> 'bank_deposit'
      WHERE e.id IS NULL
    ) THEN
      RAISE EXCEPTION 'expense_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.bank_transaction_expense_matches m
      WHERE m.tenant_id = v_tenant_id
        AND m.expense_id = ANY(v_expense_ids)
        AND m.webhook_event_id <> p_event_id
    ) THEN
      RAISE EXCEPTION 'expense_already_matched' USING ERRCODE = '23505';
    END IF;

    SELECT COALESCE(sum(e.amount), 0)
    INTO v_expense_total
    FROM public.expenses e
    WHERE e.tenant_id = v_tenant_id
      AND e.id = ANY(v_expense_ids);

    IF v_expense_total <> v_transfer_amount THEN
      RAISE EXCEPTION 'expense_amount_mismatch' USING ERRCODE = '23514';
    END IF;

    UPDATE public.expenses
    SET
      payment_method = 'transfer',
      paid_at = COALESCE(paid_at, v_event.created_at, now())
    WHERE tenant_id = v_tenant_id
      AND id = ANY(v_expense_ids)
      AND payment_method = 'unpaid';
  END IF;

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

  v_first_expense_id := v_expense_ids[1];

  UPDATE public.webhook_events
  SET expense_id = v_first_expense_id
  WHERE id = p_event_id
    AND tenant_id = v_tenant_id;

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

COMMIT;
