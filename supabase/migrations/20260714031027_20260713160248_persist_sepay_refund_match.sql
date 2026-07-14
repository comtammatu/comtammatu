ALTER TABLE public.refunds
  ADD COLUMN payout_method text,
  ADD COLUMN webhook_event_id bigint
    REFERENCES public.webhook_events(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.refunds) THEN
    RAISE EXCEPTION 'existing_refunds_require_payout_classification';
  END IF;
END;
$$;

ALTER TABLE public.refunds
  ADD CONSTRAINT refunds_payout_method_check
    CHECK (
      payout_method IS NULL
      OR payout_method IN ('cash', 'bank_transfer')
    ),
  ADD CONSTRAINT refunds_webhook_event_shape_check
    CHECK (
      webhook_event_id IS NULL
      OR (status = 'approved' AND payout_method = 'bank_transfer')
    ),
  ADD CONSTRAINT refunds_approved_shape_check
    CHECK (
      status <> 'approved'
      OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    );

CREATE INDEX refunds_webhook_event_idx
  ON public.refunds (webhook_event_id, tenant_id)
  WHERE webhook_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_refund_with_payout(
  p_payment_id bigint,
  p_amount numeric,
  p_reason text,
  p_payout_method text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_result jsonb;
  v_refund_id bigint;
  v_payment_amount numeric;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.auth_is_owner(v_actor)
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  IF p_payout_method IS NULL
    OR p_payout_method NOT IN ('cash', 'bank_transfer')
  THEN
    RAISE EXCEPTION 'refund_payout_method_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT payment.amount
  INTO v_payment_amount
  FROM public.payments payment
  WHERE payment.id = p_payment_id
    AND payment.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_amount <> v_payment_amount THEN
    RAISE EXCEPTION 'partial_refund_not_supported' USING ERRCODE = '23514';
  END IF;

  v_result := public.create_refund(p_payment_id, p_amount, p_reason);
  v_refund_id := NULLIF(v_result->>'refund_id', '')::bigint;

  UPDATE public.refunds
  SET payout_method = p_payout_method,
      updated_at = now()
  WHERE id = v_refund_id
    AND tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.log_audit(
    'refund.payout_method_set',
    'refund',
    v_refund_id,
    NULL,
    jsonb_build_object('payout_method', p_payout_method)
  );

  RETURN v_result || jsonb_build_object('payout_method', p_payout_method);
END;
$$;

REVOKE ALL ON FUNCTION public.create_refund(bigint, numeric, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_refund_with_payout(
  bigint,
  numeric,
  text,
  text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_refund_with_payout(
  bigint,
  numeric,
  text,
  text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.refund_paid_order_with_payout(
  p_order_id bigint,
  p_reason text,
  p_payout_method text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_result jsonb;
  v_refund_id bigint;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.auth_is_owner(v_actor)
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  IF p_payout_method IS NULL
    OR p_payout_method NOT IN ('cash', 'bank_transfer')
  THEN
    RAISE EXCEPTION 'refund_payout_method_invalid' USING ERRCODE = '22023';
  END IF;

  v_result := public.refund_paid_order(p_order_id, p_reason);
  v_refund_id := NULLIF(v_result->>'refund_id', '')::bigint;

  IF v_refund_id IS NOT NULL THEN
    UPDATE public.refunds
    SET payout_method = p_payout_method,
        updated_at = now()
    WHERE id = v_refund_id
      AND tenant_id = v_tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'refund_not_found' USING ERRCODE = 'P0002';
    END IF;

    PERFORM public.log_audit(
      'refund.payout_method_set',
      'refund',
      v_refund_id,
      NULL,
      jsonb_build_object('payout_method', p_payout_method)
    );
  END IF;

  RETURN v_result || jsonb_build_object('payout_method', p_payout_method);
END;
$$;

REVOKE ALL ON FUNCTION public.refund_paid_order(bigint, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.refund_paid_order_with_payout(bigint, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refund_paid_order_with_payout(bigint, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_refund(
  p_refund_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.auth_is_owner(v_actor)
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.refunds refund
  WHERE refund.id = p_refund_id
    AND refund.tenant_id = v_tenant_id
    AND refund.status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_not_pending' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.refunds
  SET status = 'rejected',
      approved_by = v_actor,
      updated_at = now()
  WHERE id = p_refund_id
    AND tenant_id = v_tenant_id;

  PERFORM public.log_audit(
    'refund.rejected',
    'refund',
    p_refund_id,
    NULL,
    jsonb_build_object('status', 'rejected')
  );

  RETURN jsonb_build_object('refund_id', p_refund_id, 'status', 'rejected');
END;
$$;

REVOKE ALL ON FUNCTION public.reject_refund(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_refund(bigint) TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.refunds FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.match_sepay_transaction_refunds(
  p_event_id bigint,
  p_refund_ids bigint[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_event public.webhook_events%ROWTYPE;
  v_refund_ids bigint[];
  v_previous_refund_ids bigint[];
  v_transfer_amount numeric;
  v_refund_count integer;
  v_refund_total numeric;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.auth_is_owner(v_actor)
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    array_agg(DISTINCT refund_id ORDER BY refund_id),
    ARRAY[]::bigint[]
  )
  INTO v_refund_ids
  FROM unnest(COALESCE(p_refund_ids, ARRAY[]::bigint[])) selected(refund_id)
  WHERE selected.refund_id IS NOT NULL;

  SELECT *
  INTO v_event
  FROM public.webhook_events
  WHERE id = p_event_id
    AND tenant_id = v_tenant_id
    AND provider = 'sepay'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'webhook_event_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(array_agg(refund.id ORDER BY refund.id), ARRAY[]::bigint[])
  INTO v_previous_refund_ids
  FROM public.refunds refund
  WHERE refund.tenant_id = v_tenant_id
    AND refund.webhook_event_id = p_event_id;

  IF cardinality(v_refund_ids) = 0 THEN
    UPDATE public.refunds
    SET webhook_event_id = NULL,
        updated_at = now()
    WHERE tenant_id = v_tenant_id
      AND webhook_event_id = p_event_id;

    PERFORM public.log_audit(
      'refund.sepay_match',
      'webhook_event',
      p_event_id,
      jsonb_build_object('refund_ids', to_jsonb(v_previous_refund_ids)),
      jsonb_build_object('refund_ids', '[]'::jsonb, 'matched_amount', 0)
    );

    RETURN jsonb_build_object(
      'matched_count', 0,
      'refund_ids', '[]'::jsonb,
      'matched_amount', 0
    );
  END IF;

  IF v_event.signature_valid IS NOT TRUE
    OR v_event.processing_status = 'failed'
    OR v_event.order_id IS NOT NULL
    OR v_event.payment_id IS NOT NULL
    OR v_event.expense_id IS NOT NULL
    OR lower(COALESCE(v_event.payload->>'transferType', '')) <> 'out'
  THEN
    RAISE EXCEPTION 'webhook_event_not_refund' USING ERRCODE = '23514';
  END IF;

  SELECT CASE
    WHEN COALESCE(v_event.payload->>'transferAmount', '')
      ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN abs((v_event.payload->>'transferAmount')::numeric)
    ELSE NULL
  END
  INTO v_transfer_amount;

  IF v_transfer_amount IS NULL OR v_transfer_amount <= 0 THEN
    RAISE EXCEPTION 'refund_amount_mismatch' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bank_transaction_expense_matches expense_match
    WHERE expense_match.tenant_id = v_tenant_id
      AND expense_match.webhook_event_id = p_event_id
  ) OR EXISTS (
    SELECT 1
    FROM public.supplier_payments supplier_payment
    WHERE supplier_payment.tenant_id = v_tenant_id
      AND supplier_payment.webhook_event_id = p_event_id
  ) THEN
    RAISE EXCEPTION 'webhook_event_already_linked' USING ERRCODE = '23514';
  END IF;

  PERFORM 1
  FROM public.refunds refund
  WHERE refund.tenant_id = v_tenant_id
    AND refund.id = ANY(v_refund_ids)
  ORDER BY refund.id
  FOR UPDATE;

  SELECT count(*), COALESCE(sum(refund.amount), 0)
  INTO v_refund_count, v_refund_total
  FROM public.refunds refund
  WHERE refund.tenant_id = v_tenant_id
    AND refund.id = ANY(v_refund_ids)
    AND refund.status = 'approved'
    AND refund.payout_method = 'bank_transfer'
    AND (
      refund.webhook_event_id IS NULL
      OR refund.webhook_event_id = p_event_id
    );

  IF v_refund_count <> cardinality(v_refund_ids) THEN
    RAISE EXCEPTION 'refund_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_refund_total <> v_transfer_amount THEN
    RAISE EXCEPTION 'refund_amount_mismatch' USING ERRCODE = '23514';
  END IF;

  UPDATE public.refunds
  SET webhook_event_id = NULL,
      updated_at = now()
  WHERE tenant_id = v_tenant_id
    AND webhook_event_id = p_event_id
    AND NOT (id = ANY(v_refund_ids));

  UPDATE public.refunds
  SET webhook_event_id = p_event_id,
      updated_at = now()
  WHERE tenant_id = v_tenant_id
    AND id = ANY(v_refund_ids);

  PERFORM public.log_audit(
    'refund.sepay_match',
    'webhook_event',
    p_event_id,
    jsonb_build_object('refund_ids', to_jsonb(v_previous_refund_ids)),
    jsonb_build_object(
      'refund_ids', to_jsonb(v_refund_ids),
      'matched_amount', v_transfer_amount
    )
  );

  RETURN jsonb_build_object(
    'matched_count', cardinality(v_refund_ids),
    'refund_ids', to_jsonb(v_refund_ids),
    'matched_amount', v_transfer_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.match_sepay_transaction_refunds(bigint, bigint[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_sepay_transaction_refunds(bigint, bigint[])
  TO authenticated;

CREATE OR REPLACE FUNCTION public.assert_refund_webhook_allocation(
  p_event_id bigint
) RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_event public.webhook_events%ROWTYPE;
  v_refund_count integer;
  v_refund_total numeric;
  v_refund_tenant_id bigint;
  v_refund_max_tenant_id bigint;
  v_refund_shape_valid boolean;
  v_transfer_amount numeric;
BEGIN
  IF p_event_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    count(*),
    COALESCE(sum(refund.amount), 0),
    min(refund.tenant_id),
    max(refund.tenant_id),
    bool_and(
      refund.status = 'approved'
      AND refund.payout_method = 'bank_transfer'
    )
  INTO
    v_refund_count,
    v_refund_total,
    v_refund_tenant_id,
    v_refund_max_tenant_id,
    v_refund_shape_valid
  FROM public.refunds refund
  WHERE refund.webhook_event_id = p_event_id;

  IF v_refund_count = 0 THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_event
  FROM public.webhook_events
  WHERE id = p_event_id;

  IF NOT FOUND
    OR v_refund_shape_valid IS NOT TRUE
    OR v_refund_tenant_id IS DISTINCT FROM v_refund_max_tenant_id
    OR v_event.tenant_id <> v_refund_tenant_id
    OR v_event.provider <> 'sepay'
    OR v_event.signature_valid IS NOT TRUE
    OR v_event.processing_status = 'failed'
    OR v_event.order_id IS NOT NULL
    OR v_event.payment_id IS NOT NULL
    OR v_event.expense_id IS NOT NULL
    OR lower(COALESCE(v_event.payload->>'transferType', '')) <> 'out'
    OR EXISTS (
      SELECT 1
      FROM public.bank_transaction_expense_matches expense_match
      WHERE expense_match.tenant_id = v_refund_tenant_id
        AND expense_match.webhook_event_id = p_event_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.supplier_payments supplier_payment
      WHERE supplier_payment.tenant_id = v_refund_tenant_id
        AND supplier_payment.webhook_event_id = p_event_id
    )
  THEN
    RAISE EXCEPTION 'webhook_event_already_linked' USING ERRCODE = '23514';
  END IF;

  SELECT CASE
    WHEN COALESCE(v_event.payload->>'transferAmount', '')
      ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN abs((v_event.payload->>'transferAmount')::numeric)
    ELSE NULL
  END
  INTO v_transfer_amount;

  IF v_transfer_amount IS NULL OR v_refund_total <> v_transfer_amount THEN
    RAISE EXCEPTION 'refund_amount_mismatch' USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_refund_ledger_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_refund_id bigint;
  v_current_payout_method text;
  v_current_event_id bigint;
  v_old_event_id bigint;
  v_new_event_id bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_refund_id := OLD.id;
    v_old_event_id := OLD.webhook_event_id;
  ELSE
    v_refund_id := NEW.id;
    v_new_event_id := NEW.webhook_event_id;
    IF TG_OP = 'UPDATE' THEN
      v_old_event_id := OLD.webhook_event_id;
    END IF;
  END IF;

  SELECT refund.payout_method, refund.webhook_event_id
  INTO v_current_payout_method, v_current_event_id
  FROM public.refunds refund
  WHERE refund.id = v_refund_id;

  IF FOUND AND v_current_payout_method IS NULL THEN
    RAISE EXCEPTION 'refund_payout_method_required' USING ERRCODE = '23514';
  END IF;

  PERFORM public.assert_refund_webhook_allocation(v_current_event_id);
  IF v_old_event_id IS DISTINCT FROM v_current_event_id THEN
    PERFORM public.assert_refund_webhook_allocation(v_old_event_id);
  END IF;
  IF v_new_event_id IS DISTINCT FROM v_current_event_id THEN
    PERFORM public.assert_refund_webhook_allocation(v_new_event_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER validate_refund_ledger_row
AFTER INSERT OR UPDATE OR DELETE ON public.refunds
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.validate_refund_ledger_row();

CREATE OR REPLACE FUNCTION public.validate_refund_webhook_event_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.assert_refund_webhook_allocation(NEW.id);
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER validate_refund_webhook_event_update
AFTER UPDATE ON public.webhook_events
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.validate_refund_webhook_event_update();

CREATE OR REPLACE FUNCTION public.guard_approved_refund_facts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status = 'approved' THEN
    RAISE EXCEPTION 'approved_refund_immutable' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' AND (
    NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
    OR NEW.payment_id IS DISTINCT FROM OLD.payment_id
    OR NEW.order_id IS DISTINCT FROM OLD.order_id
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.reason IS DISTINCT FROM OLD.reason
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR (
      OLD.payout_method IS NOT NULL
      AND NEW.payout_method IS DISTINCT FROM OLD.payout_method
    )
  ) THEN
    RAISE EXCEPTION 'approved_refund_immutable' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_approved_refund_facts
BEFORE UPDATE OR DELETE ON public.refunds
FOR EACH ROW
EXECUTE FUNCTION public.guard_approved_refund_facts();

CREATE OR REPLACE FUNCTION public.get_cash_ledger_movement_since(
  p_since timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_cash_collections numeric;
  v_cash_refunds numeric;
  v_cash_expenses numeric;
  v_cash_supplier_payments numeric;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.auth_is_owner(v_actor)
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(sum(payment.amount), 0)
  INTO v_cash_collections
  FROM public.payments payment
  WHERE payment.tenant_id = v_tenant_id
    AND payment.method = 'cash'
    AND payment.status IN ('completed', 'refunded')
    AND payment.paid_at >= p_since;

  SELECT COALESCE(sum(refund.amount), 0)
  INTO v_cash_refunds
  FROM public.refunds refund
  WHERE refund.tenant_id = v_tenant_id
    AND refund.status = 'approved'
    AND refund.payout_method = 'cash'
    AND refund.approved_at >= p_since;

  SELECT COALESCE(sum(expense.amount), 0)
  INTO v_cash_expenses
  FROM public.expenses expense
  WHERE expense.tenant_id = v_tenant_id
    AND expense.payment_method = 'cash'
    AND expense.expense_date >= timezone('Asia/Ho_Chi_Minh', p_since)::date;

  SELECT COALESCE(sum(supplier_payment.amount), 0)
  INTO v_cash_supplier_payments
  FROM public.supplier_payments supplier_payment
  WHERE supplier_payment.tenant_id = v_tenant_id
    AND supplier_payment.payment_method = 'cash'
    AND supplier_payment.payment_date >= p_since;

  RETURN jsonb_build_object(
    'cash_collections', v_cash_collections,
    'cash_refunds', v_cash_refunds,
    'cash_expenses', v_cash_expenses,
    'cash_supplier_payments', v_cash_supplier_payments
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_bank_ledger_movement_since(
  p_since timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_bank_in numeric;
  v_bank_out numeric;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.auth_is_owner(v_actor)
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  SELECT
    COALESCE(sum(
      CASE WHEN movement.transfer_type = 'in' THEN movement.amount ELSE 0 END
    ), 0),
    COALESCE(sum(
      CASE WHEN movement.transfer_type = 'out' THEN movement.amount ELSE 0 END
    ), 0)
  INTO v_bank_in, v_bank_out
  FROM (
    SELECT
      lower(COALESCE(event.payload->>'transferType', '')) AS transfer_type,
      CASE
        WHEN COALESCE(event.payload->>'transferAmount', '')
          ~ '^-?[0-9]+(\.[0-9]+)?$'
          THEN abs((event.payload->>'transferAmount')::numeric)
        ELSE 0
      END AS amount,
      COALESCE(
        CASE
          WHEN substring(
            COALESCE(event.payload->>'transactionDate', '') FROM 1 FOR 10
          ) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          THEN substring(
            COALESCE(event.payload->>'transactionDate', '') FROM 1 FOR 10
          )
          ELSE NULL
        END,
        to_char(
          event.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
          'YYYY-MM-DD'
        )
      ) AS business_date
    FROM public.webhook_events event
    WHERE event.tenant_id = v_tenant_id
      AND event.provider = 'sepay'
      AND event.signature_valid IS TRUE
  ) movement
  WHERE movement.transfer_type IN ('in', 'out')
    AND movement.amount > 0
    AND movement.business_date >= to_char(
      p_since AT TIME ZONE 'Asia/Ho_Chi_Minh',
      'YYYY-MM-DD'
    );

  RETURN jsonb_build_object(
    'bank_in', v_bank_in,
    'bank_out', v_bank_out
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assert_refund_webhook_allocation(bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_refund_ledger_row()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_refund_webhook_event_update()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_approved_refund_facts()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_cash_ledger_movement_since(timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cash_ledger_movement_since(timestamptz)
  TO authenticated;
REVOKE ALL ON FUNCTION public.get_bank_ledger_movement_since(timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bank_ledger_movement_since(timestamptz)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_expense_match_without_supplier_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.supplier_payments payment
    WHERE payment.tenant_id = NEW.tenant_id
      AND payment.webhook_event_id = NEW.webhook_event_id
  ) OR EXISTS (
    SELECT 1
    FROM public.refunds refund
    WHERE refund.tenant_id = NEW.tenant_id
      AND refund.webhook_event_id = NEW.webhook_event_id
  ) THEN
    RAISE EXCEPTION 'webhook_event_already_linked' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_supplier_payment_without_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.webhook_event_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.refunds refund
    WHERE refund.tenant_id = NEW.tenant_id
      AND refund.webhook_event_id = NEW.webhook_event_id
  ) THEN
    RAISE EXCEPTION 'webhook_event_already_linked' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_supplier_payment_without_refund
BEFORE INSERT OR UPDATE ON public.supplier_payments
FOR EACH ROW
EXECUTE FUNCTION public.guard_supplier_payment_without_refund();

REVOKE ALL ON FUNCTION public.guard_expense_match_without_supplier_payment()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_supplier_payment_without_refund()
  FROM PUBLIC, anon, authenticated;
