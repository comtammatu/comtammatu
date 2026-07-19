CREATE TABLE public.bank_transaction_reconciliation_matches (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bank_transaction_id bigint NOT NULL
    REFERENCES public.bank_transactions(id) ON DELETE CASCADE,
  payment_id bigint REFERENCES public.payments(id) ON DELETE RESTRICT,
  expense_id bigint REFERENCES public.expenses(id) ON DELETE RESTRICT,
  supplier_payment_id bigint
    REFERENCES public.supplier_payments(id) ON DELETE RESTRICT,
  refund_id bigint REFERENCES public.refunds(id) ON DELETE RESTRICT,
  matched_amount numeric(15,2) NOT NULL CHECK (matched_amount > 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_transaction_reconciliation_matches_one_target_check CHECK (
    num_nonnulls(payment_id, expense_id, supplier_payment_id, refund_id) = 1
  )
);

COMMENT ON TABLE public.bank_transaction_reconciliation_matches IS
  'Classification-only links from canonical bank movements to operational evidence. These rows never change bank balance.';

CREATE INDEX bank_transaction_reconciliation_matches_transaction_idx
  ON public.bank_transaction_reconciliation_matches (
    bank_transaction_id,
    tenant_id
  );

CREATE INDEX bank_transaction_reconciliation_matches_tenant_idx
  ON public.bank_transaction_reconciliation_matches (tenant_id);

CREATE UNIQUE INDEX bank_transaction_reconciliation_matches_payment_key
  ON public.bank_transaction_reconciliation_matches (payment_id, tenant_id)
  WHERE payment_id IS NOT NULL;

CREATE UNIQUE INDEX bank_transaction_reconciliation_matches_expense_key
  ON public.bank_transaction_reconciliation_matches (expense_id, tenant_id)
  WHERE expense_id IS NOT NULL;

CREATE UNIQUE INDEX bank_transaction_reconciliation_matches_supplier_key
  ON public.bank_transaction_reconciliation_matches (
    supplier_payment_id,
    tenant_id
  )
  WHERE supplier_payment_id IS NOT NULL;

CREATE UNIQUE INDEX bank_transaction_reconciliation_matches_refund_key
  ON public.bank_transaction_reconciliation_matches (refund_id, tenant_id)
  WHERE refund_id IS NOT NULL;

CREATE INDEX bank_transaction_reconciliation_matches_created_by_idx
  ON public.bank_transaction_reconciliation_matches (created_by)
  WHERE created_by IS NOT NULL;

ALTER TABLE public.bank_transaction_reconciliation_matches
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY bank_transaction_reconciliation_matches_select_finance
  ON public.bank_transaction_reconciliation_matches
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:view')
  );

REVOKE ALL ON TABLE public.bank_transaction_reconciliation_matches
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.bank_transaction_reconciliation_matches
  TO authenticated;
GRANT ALL ON TABLE public.bank_transaction_reconciliation_matches
  TO service_role;
GRANT USAGE, SELECT ON SEQUENCE
  public.bank_transaction_reconciliation_matches_id_seq TO service_role;

INSERT INTO public.bank_transaction_reconciliation_matches (
  tenant_id,
  bank_transaction_id,
  payment_id,
  matched_amount,
  created_by
)
SELECT
  transaction.tenant_id,
  transaction.id,
  event.payment_id,
  payment.amount,
  NULL
FROM public.bank_transactions transaction
JOIN public.webhook_events event
  ON event.id = transaction.webhook_event_id
 AND event.tenant_id = transaction.tenant_id
JOIN public.payments payment
  ON payment.id = event.payment_id
 AND payment.tenant_id = transaction.tenant_id
WHERE event.payment_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.bank_transaction_reconciliation_matches (
  tenant_id,
  bank_transaction_id,
  expense_id,
  matched_amount,
  created_by
)
SELECT
  transaction.tenant_id,
  transaction.id,
  match.expense_id,
  expense.amount,
  match.created_by
FROM public.bank_transactions transaction
JOIN public.bank_transaction_expense_matches match
  ON match.webhook_event_id = transaction.webhook_event_id
 AND match.tenant_id = transaction.tenant_id
JOIN public.expenses expense
  ON expense.id = match.expense_id
 AND expense.tenant_id = transaction.tenant_id
ON CONFLICT DO NOTHING;

INSERT INTO public.bank_transaction_reconciliation_matches (
  tenant_id,
  bank_transaction_id,
  expense_id,
  matched_amount,
  created_by
)
SELECT
  transaction.tenant_id,
  transaction.id,
  event.expense_id,
  expense.amount,
  NULL
FROM public.bank_transactions transaction
JOIN public.webhook_events event
  ON event.id = transaction.webhook_event_id
 AND event.tenant_id = transaction.tenant_id
JOIN public.expenses expense
  ON expense.id = event.expense_id
 AND expense.tenant_id = transaction.tenant_id
WHERE event.expense_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.bank_transaction_reconciliation_matches (
  tenant_id,
  bank_transaction_id,
  supplier_payment_id,
  matched_amount,
  created_by
)
SELECT
  transaction.tenant_id,
  transaction.id,
  payment.id,
  payment.amount,
  payment.created_by
FROM public.bank_transactions transaction
JOIN public.supplier_payments payment
  ON payment.webhook_event_id = transaction.webhook_event_id
 AND payment.tenant_id = transaction.tenant_id
ON CONFLICT DO NOTHING;

INSERT INTO public.bank_transaction_reconciliation_matches (
  tenant_id,
  bank_transaction_id,
  refund_id,
  matched_amount,
  created_by
)
SELECT
  transaction.tenant_id,
  transaction.id,
  refund.id,
  refund.amount,
  refund.approved_by
FROM public.bank_transactions transaction
JOIN public.refunds refund
  ON refund.webhook_event_id = transaction.webhook_event_id
 AND refund.tenant_id = transaction.tenant_id
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.reconcile_bank_transaction_targets(
  p_bank_transaction_id bigint,
  p_target_type text,
  p_target_ids bigint[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_transaction public.bank_transactions%ROWTYPE;
  v_target_ids bigint[];
  v_target_count integer;
  v_target_total numeric(15,2);
  v_old_matches jsonb;
  v_legacy_result jsonb;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.auth_is_owner(v_actor)
    OR NOT public.has_permission_any('finance:view')
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  IF p_target_type NOT IN ('payment', 'expense', 'supplier_payment', 'refund')
  THEN
    RAISE EXCEPTION 'invalid_bank_reconciliation_target'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_target_ids, ARRAY[]::bigint[])) selected(target_id)
    WHERE selected.target_id IS NULL OR selected.target_id <= 0
  ) THEN
    RAISE EXCEPTION 'invalid_bank_reconciliation_target'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(
    array_agg(DISTINCT target_id ORDER BY target_id),
    ARRAY[]::bigint[]
  )
  INTO v_target_ids
  FROM unnest(COALESCE(p_target_ids, ARRAY[]::bigint[])) selected(target_id)
  WHERE selected.target_id IS NOT NULL AND selected.target_id > 0;

  IF cardinality(v_target_ids) > 20
    OR (p_target_type = 'payment' AND cardinality(v_target_ids) <> 1)
  THEN
    RAISE EXCEPTION 'invalid_bank_reconciliation_target'
      USING ERRCODE = '22023';
  END IF;

  SELECT transaction.*
  INTO v_transaction
  FROM public.bank_transactions transaction
  WHERE transaction.id = p_bank_transaction_id
    AND transaction.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bank_transaction_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(match) ORDER BY match.id), '[]'::jsonb)
  INTO v_old_matches
  FROM public.bank_transaction_reconciliation_matches match
  WHERE match.tenant_id = v_tenant_id
    AND match.bank_transaction_id = v_transaction.id;

  IF v_transaction.webhook_event_id IS NOT NULL THEN
    CASE p_target_type
      WHEN 'payment' THEN
        v_legacy_result := public.link_sepay_transaction_to_payment(
          v_transaction.webhook_event_id,
          v_target_ids[1]
        );
      WHEN 'expense' THEN
        v_legacy_result := public.match_sepay_transaction_expenses(
          v_transaction.webhook_event_id,
          v_target_ids
        );
      WHEN 'supplier_payment' THEN
        v_legacy_result := public.match_sepay_transaction_supplier_payments(
          v_transaction.webhook_event_id,
          v_target_ids
        );
      WHEN 'refund' THEN
        v_legacy_result := public.match_sepay_transaction_refunds(
          v_transaction.webhook_event_id,
          v_target_ids
        );
    END CASE;
  END IF;

  IF cardinality(v_target_ids) = 0 THEN
    DELETE FROM public.bank_transaction_reconciliation_matches match
    WHERE match.tenant_id = v_tenant_id
      AND match.bank_transaction_id = v_transaction.id
      AND (
        (p_target_type = 'expense' AND match.expense_id IS NOT NULL)
        OR (
          p_target_type = 'supplier_payment'
          AND match.supplier_payment_id IS NOT NULL
        )
        OR (p_target_type = 'refund' AND match.refund_id IS NOT NULL)
      );

    PERFORM public.log_audit(
      'bank_transaction.reconcile',
      'bank_transaction',
      v_transaction.id,
      v_old_matches,
      jsonb_build_object(
        'target_type', p_target_type,
        'target_ids', '[]'::jsonb,
        'matched_amount', 0
      )
    );

    RETURN jsonb_build_object(
      'bank_transaction_id', v_transaction.id,
      'target_type', p_target_type,
      'target_ids', '[]'::jsonb,
      'matched_amount', 0,
      'legacy_result', v_legacy_result
    );
  END IF;

  CASE p_target_type
    WHEN 'payment' THEN
      IF v_transaction.transfer_type <> 'in' THEN
        RAISE EXCEPTION 'bank_transaction_direction_mismatch'
          USING ERRCODE = '23514';
      END IF;

      SELECT count(*), COALESCE(sum(payment.amount), 0)
      INTO v_target_count, v_target_total
      FROM public.payments payment
      WHERE payment.tenant_id = v_tenant_id
        AND payment.id = ANY(v_target_ids)
        AND payment.method = 'vietqr'
        AND payment.status = 'completed';
    WHEN 'expense' THEN
      IF v_transaction.transfer_type <> 'out' THEN
        RAISE EXCEPTION 'bank_transaction_direction_mismatch'
          USING ERRCODE = '23514';
      END IF;

      SELECT count(*), COALESCE(sum(expense.amount), 0)
      INTO v_target_count, v_target_total
      FROM public.expenses expense
      WHERE expense.tenant_id = v_tenant_id
        AND expense.id = ANY(v_target_ids)
        AND expense.category IN (
          'rent',
          'utilities',
          'gas_fuel',
          'salary',
          'supplies',
          'repair',
          'marketing',
          'fees_tax',
          'other'
        )
        AND (
          v_transaction.webhook_event_id IS NOT NULL
          OR (
            expense.payment_method = 'transfer'
            AND expense.paid_at IS NOT NULL
          )
        );
    WHEN 'supplier_payment' THEN
      IF v_transaction.transfer_type <> 'out' THEN
        RAISE EXCEPTION 'bank_transaction_direction_mismatch'
          USING ERRCODE = '23514';
      END IF;

      SELECT count(*), COALESCE(sum(payment.amount), 0)
      INTO v_target_count, v_target_total
      FROM public.supplier_payments payment
      WHERE payment.tenant_id = v_tenant_id
        AND payment.id = ANY(v_target_ids)
        AND payment.payment_method = 'bank_transfer';
    WHEN 'refund' THEN
      IF v_transaction.transfer_type <> 'out' THEN
        RAISE EXCEPTION 'bank_transaction_direction_mismatch'
          USING ERRCODE = '23514';
      END IF;

      SELECT count(*), COALESCE(sum(refund.amount), 0)
      INTO v_target_count, v_target_total
      FROM public.refunds refund
      WHERE refund.tenant_id = v_tenant_id
        AND refund.id = ANY(v_target_ids)
        AND refund.status = 'approved'
        AND refund.payout_method = 'bank_transfer';
  END CASE;

  IF v_target_count <> cardinality(v_target_ids) THEN
    RAISE EXCEPTION 'bank_reconciliation_target_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_target_total <> v_transaction.amount THEN
    RAISE EXCEPTION 'bank_reconciliation_amount_mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF v_transaction.webhook_event_id IS NULL THEN
    IF p_target_type = 'payment' AND EXISTS (
      SELECT 1
      FROM public.webhook_events event
      WHERE event.tenant_id = v_tenant_id
        AND event.payment_id = ANY(v_target_ids)
        AND event.provider = 'sepay'
        AND event.signature_valid IS TRUE
    ) THEN
      RAISE EXCEPTION 'bank_reconciliation_target_already_matched'
        USING ERRCODE = '23505';
    ELSIF p_target_type = 'expense' AND EXISTS (
      SELECT 1
      FROM public.bank_transaction_expense_matches match
      WHERE match.tenant_id = v_tenant_id
        AND match.expense_id = ANY(v_target_ids)
    ) THEN
      RAISE EXCEPTION 'bank_reconciliation_target_already_matched'
        USING ERRCODE = '23505';
    ELSIF p_target_type = 'supplier_payment' AND EXISTS (
      SELECT 1
      FROM public.supplier_payments payment
      WHERE payment.tenant_id = v_tenant_id
        AND payment.id = ANY(v_target_ids)
        AND payment.webhook_event_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'bank_reconciliation_target_already_matched'
        USING ERRCODE = '23505';
    ELSIF p_target_type = 'refund' AND EXISTS (
      SELECT 1
      FROM public.refunds refund
      WHERE refund.tenant_id = v_tenant_id
        AND refund.id = ANY(v_target_ids)
        AND refund.webhook_event_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'bank_reconciliation_target_already_matched'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  DELETE FROM public.bank_transaction_reconciliation_matches match
  WHERE match.tenant_id = v_tenant_id
    AND match.bank_transaction_id = v_transaction.id;

  CASE p_target_type
    WHEN 'payment' THEN
      INSERT INTO public.bank_transaction_reconciliation_matches (
        tenant_id,
        bank_transaction_id,
        payment_id,
        matched_amount,
        created_by
      )
      SELECT
        v_tenant_id,
        v_transaction.id,
        payment.id,
        payment.amount,
        v_actor
      FROM public.payments payment
      WHERE payment.tenant_id = v_tenant_id
        AND payment.id = ANY(v_target_ids);
    WHEN 'expense' THEN
      INSERT INTO public.bank_transaction_reconciliation_matches (
        tenant_id,
        bank_transaction_id,
        expense_id,
        matched_amount,
        created_by
      )
      SELECT
        v_tenant_id,
        v_transaction.id,
        expense.id,
        expense.amount,
        v_actor
      FROM public.expenses expense
      WHERE expense.tenant_id = v_tenant_id
        AND expense.id = ANY(v_target_ids);
    WHEN 'supplier_payment' THEN
      INSERT INTO public.bank_transaction_reconciliation_matches (
        tenant_id,
        bank_transaction_id,
        supplier_payment_id,
        matched_amount,
        created_by
      )
      SELECT
        v_tenant_id,
        v_transaction.id,
        payment.id,
        payment.amount,
        v_actor
      FROM public.supplier_payments payment
      WHERE payment.tenant_id = v_tenant_id
        AND payment.id = ANY(v_target_ids);
    WHEN 'refund' THEN
      INSERT INTO public.bank_transaction_reconciliation_matches (
        tenant_id,
        bank_transaction_id,
        refund_id,
        matched_amount,
        created_by
      )
      SELECT
        v_tenant_id,
        v_transaction.id,
        refund.id,
        refund.amount,
        v_actor
      FROM public.refunds refund
      WHERE refund.tenant_id = v_tenant_id
        AND refund.id = ANY(v_target_ids);
  END CASE;

  PERFORM public.log_audit(
    'bank_transaction.reconcile',
    'bank_transaction',
    v_transaction.id,
    v_old_matches,
    jsonb_build_object(
      'target_type', p_target_type,
      'target_ids', to_jsonb(v_target_ids),
      'matched_amount', v_target_total
    )
  );

  RETURN jsonb_build_object(
    'bank_transaction_id', v_transaction.id,
    'target_type', p_target_type,
    'target_ids', to_jsonb(v_target_ids),
    'matched_amount', v_target_total,
    'legacy_result', v_legacy_result
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_bank_transaction_targets(
  bigint,
  text,
  bigint[]
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_bank_transaction_targets(
  bigint,
  text,
  bigint[]
) TO authenticated;

COMMENT ON FUNCTION public.reconcile_bank_transaction_targets(
  bigint,
  text,
  bigint[]
) IS
  'Owner-only reconciliation. It classifies a canonical bank movement against operational evidence without changing bank balance; webhook-backed rows retain legacy evidence invariants.';
