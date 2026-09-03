-- Migration: split_construction_expense_category
-- Split fit-out spend (Thi công) from asset/equipment spend (Tài sản).
-- Construction stays outside period result and outside Tổng giá trị.

ALTER TABLE public.expenses DROP CONSTRAINT expenses_category_check;

ALTER TABLE public.expenses ADD CONSTRAINT expenses_category_check CHECK (
  category = ANY (ARRAY[
    'rent'::text,
    'utilities'::text,
    'gas_fuel'::text,
    'salary'::text,
    'cogs_manual'::text,
    'supplies'::text,
    'repair'::text,
    'marketing'::text,
    'fees_tax'::text,
    'hospitality'::text,
    'capital'::text,
    'construction'::text,
    'deposit'::text,
    'bank_deposit'::text,
    'other'::text
  ])
);

CREATE OR REPLACE FUNCTION public.cancel_expense(p_expense_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_user_id uuid := auth.uid();
  v_expense public.expenses%ROWTYPE;
  v_prelock_transfer_content text;
BEGIN
  IF v_user_id IS NULL
    OR v_tenant_id IS NULL
    OR NOT (
      public.auth_is_owner(v_user_id)
      OR public.has_position('accountant')
    )
    OR NOT public.has_permission_any('finance:expense_create')
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

  SELECT expense.transfer_content
  INTO v_prelock_transfer_content
  FROM public.expenses expense
  WHERE expense.id = p_expense_id
    AND expense.tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_prelock_transfer_content IS NOT NULL THEN
    PERFORM event.id
    FROM public.webhook_events event
    WHERE event.tenant_id = v_tenant_id
      AND event.provider = 'sepay'
      AND private.sepay_payload_contains_transfer_content(
        event.payload,
        v_prelock_transfer_content
      )
    ORDER BY event.id
    FOR UPDATE;
  END IF;

  SELECT expense.*
  INTO v_expense
  FROM public.expenses expense
  WHERE expense.id = p_expense_id
    AND expense.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_expense.transfer_content IS DISTINCT FROM v_prelock_transfer_content THEN
    RAISE EXCEPTION 'expense_payment_state_changed' USING ERRCODE = '40001';
  END IF;

  IF NOT (
    v_expense.category = ANY (ARRAY[
      'rent',
      'utilities',
      'gas_fuel',
      'salary',
      'supplies',
      'repair',
      'marketing',
      'fees_tax',
      'hospitality',
      'capital', 'construction', 'deposit',
      'other'
    ]::text[])
  ) THEN
    RAISE EXCEPTION 'expense_cancel_not_operating' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bank_transaction_expense_matches match
    WHERE match.tenant_id = v_tenant_id
      AND match.expense_id = v_expense.id
  ) OR EXISTS (
    SELECT 1
    FROM public.webhook_events event
    WHERE event.tenant_id = v_tenant_id
      AND event.provider = 'sepay'
      AND event.expense_id = v_expense.id
  ) THEN
    RAISE EXCEPTION 'expense_already_matched' USING ERRCODE = '23505';
  END IF;

  PERFORM set_config('app.expense_cancel_id', v_expense.id::text, true);

  PERFORM public.log_audit(
    'cancel',
    'expense',
    v_expense.id,
    to_jsonb(v_expense),
    NULL
  );

  DELETE FROM public.expenses expense
  WHERE expense.id = v_expense.id
    AND expense.tenant_id = v_tenant_id;

  PERFORM set_config('app.expense_cancel_id', '', true);

  RETURN jsonb_build_object(
    'cancelled', true,
    'expense_id', v_expense.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_expense_transfer_intent(p_branch_id bigint, p_expense_date date, p_category text, p_vat_breakdown jsonb, p_vendor_name text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_invoice_attachment_url text DEFAULT NULL::text) RETURNS TABLE(expense_id bigint, transfer_content text)
    LANGUAGE plpgsql SECURITY DEFINER
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
        'hospitality',
        'capital', 'construction', 'deposit',
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

CREATE OR REPLACE FUNCTION public.get_finance_expense_period_summary(p_location text, p_start_date date, p_end_date date, p_branch_id bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_location text;
  v_sales_branch_ids bigint[] := ARRAY[]::bigint[];
  v_operating_categories text[] := ARRAY[
    'rent',
    'utilities',
    'gas_fuel',
    'salary',
    'repair',
    'supplies',
    'marketing',
    'fees_tax',
    'hospitality',
    'other'
  ];
  v_ledger_categories text[] := v_operating_categories || ARRAY['capital', 'construction', 'deposit'];
  v_operating_total numeric(14, 2) := 0;
  v_operating_count integer := 0;
  v_needs_action_total numeric(15, 2) := 0;
  v_needs_action_count integer := 0;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'invalid_period' USING ERRCODE = '22023';
  END IF;

  v_location := lower(btrim(COALESCE(p_location, '')));
  IF v_location NOT IN ('all', 'company', 'branches', 'branch') THEN
    RAISE EXCEPTION 'invalid_location' USING ERRCODE = '22023';
  END IF;

  IF v_location = 'branch' THEN
    IF p_branch_id IS NULL THEN
      RAISE EXCEPTION 'invalid_branch' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.branches branch
      WHERE branch.id = p_branch_id
        AND branch.tenant_id = v_tenant
        AND branch.branch_kind = 'branch'
    ) THEN
      RAISE EXCEPTION 'branch_not_found' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_location = 'branches' THEN
    SELECT COALESCE(array_agg(branch.id), ARRAY[]::bigint[])
    INTO v_sales_branch_ids
    FROM public.branches branch
    WHERE branch.tenant_id = v_tenant
      AND branch.branch_kind = 'branch'
      AND COALESCE(branch.is_active, true);
  END IF;

  WITH scoped AS (
    SELECT
      expense.category,
      expense.subtotal,
      expense.amount,
      (
        (
          expense.payment_method = 'unpaid'
          OR expense.paid_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.bank_transaction_expense_matches match
          WHERE match.tenant_id = expense.tenant_id
            AND match.expense_id = expense.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.webhook_events webhook
          WHERE webhook.tenant_id = expense.tenant_id
            AND webhook.provider = 'sepay'
            AND webhook.expense_id = expense.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.bank_transaction_reconciliation_matches recon
          WHERE recon.tenant_id = expense.tenant_id
            AND recon.expense_id = expense.id
        )
      ) AS needs_action
    FROM public.expenses expense
    WHERE expense.tenant_id = v_tenant
      AND expense.expense_date >= p_start_date
      AND expense.expense_date <= p_end_date
      AND expense.category = ANY (v_ledger_categories)
      AND (
        CASE v_location
          WHEN 'company' THEN expense.branch_id IS NULL
          WHEN 'branch' THEN expense.branch_id = p_branch_id
          WHEN 'branches' THEN expense.branch_id = ANY (v_sales_branch_ids)
          ELSE true
        END
      )
  )
  SELECT
    COALESCE(
      SUM(scoped.subtotal) FILTER (
        WHERE scoped.category = ANY (v_operating_categories)
      ),
      0
    ),
    COUNT(*) FILTER (
      WHERE scoped.category = ANY (v_operating_categories)
    )::integer,
    COALESCE(SUM(scoped.amount) FILTER (WHERE scoped.needs_action), 0),
    COUNT(*) FILTER (WHERE scoped.needs_action)::integer
  INTO
    v_operating_total,
    v_operating_count,
    v_needs_action_total,
    v_needs_action_count
  FROM scoped;

  RETURN jsonb_build_object(
    'operating_total', v_operating_total::text,
    'operating_count', v_operating_count,
    'operating_recorded', v_operating_count > 0,
    'needs_action_total', v_needs_action_total::text,
    'needs_action_count', v_needs_action_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_finance_expense_evidence_mutation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
    AND current_setting('app.expense_payment_transition_id', true) = OLD.id::text
    AND auth.uid() IS NOT NULL
    AND OLD.tenant_id IS NOT DISTINCT FROM public.auth_tenant_id()
    AND (
      public.auth_is_owner(auth.uid())
      OR public.has_position('accountant')
    )
    AND public.has_permission_any('finance:expense_create')
    AND OLD.category <> 'bank_deposit'
    AND to_jsonb(NEW)
      - 'payment_method'
      - 'paid_at'
      - 'transfer_content'
      - 'updated_at'
      = to_jsonb(OLD)
      - 'payment_method'
      - 'paid_at'
      - 'transfer_content'
      - 'updated_at'
    AND NOT EXISTS (
      SELECT 1
      FROM public.bank_transaction_expense_matches match
      WHERE match.tenant_id = OLD.tenant_id
        AND match.expense_id = OLD.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.webhook_events event
      WHERE event.tenant_id = OLD.tenant_id
        AND event.provider = 'sepay'
        AND event.expense_id = OLD.id
    )
    AND (
      (
        OLD.payment_method = 'unpaid'
        AND OLD.paid_at IS NULL
        AND (
          (
            NEW.payment_method = 'cash'
            AND NEW.paid_at IS NOT NULL
            AND NEW.transfer_content IS NULL
          ) OR (
            NEW.payment_method = 'transfer'
            AND NEW.paid_at IS NOT NULL
          ) OR (
            NEW.payment_method = 'unpaid'
            AND NEW.paid_at IS NULL
          )
        )
      ) OR (
        OLD.paid_at IS NOT NULL
        AND OLD.payment_method IN ('cash', 'transfer')
        AND (
          (
            NEW.payment_method = 'cash'
            AND NEW.paid_at IS NOT NULL
            AND NEW.transfer_content IS NULL
          ) OR (
            NEW.payment_method = 'transfer'
            AND NEW.paid_at IS NOT NULL
            AND NEW.transfer_content IS NULL
          ) OR (
            NEW.payment_method = 'unpaid'
            AND NEW.paid_at IS NULL
            AND NEW.transfer_content IS NULL
          )
        )
      )
    )
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND current_setting('app.expense_update_id', true) = OLD.id::text
    AND auth.uid() IS NOT NULL
    AND OLD.tenant_id IS NOT DISTINCT FROM public.auth_tenant_id()
    AND (
      public.auth_is_owner(auth.uid())
      OR public.has_position('accountant')
    )
    AND public.has_permission_any('finance:expense_create')
    AND OLD.transfer_content IS NULL
    AND NEW.transfer_content IS NULL
    AND OLD.payment_method IS NOT DISTINCT FROM NEW.payment_method
    AND OLD.paid_at IS NOT DISTINCT FROM NEW.paid_at
    AND OLD.category = ANY (ARRAY[
      'rent',
      'utilities',
      'gas_fuel',
      'salary',
      'supplies',
      'repair',
      'marketing',
      'fees_tax',
      'hospitality',
      'capital', 'construction', 'deposit',
      'other'
    ]::text[])
    AND NEW.category = ANY (ARRAY[
      'rent',
      'utilities',
      'gas_fuel',
      'salary',
      'supplies',
      'repair',
      'marketing',
      'fees_tax',
      'hospitality',
      'capital', 'construction', 'deposit',
      'other'
    ]::text[])
    AND to_jsonb(NEW)
      - 'branch_id'
      - 'expense_date'
      - 'category'
      - 'vat_breakdown'
      - 'subtotal'
      - 'vat_amount'
      - 'amount'
      - 'note'
      - 'invoice_attachment_url'
      - 'updated_at'
      = to_jsonb(OLD)
      - 'branch_id'
      - 'expense_date'
      - 'category'
      - 'vat_breakdown'
      - 'subtotal'
      - 'vat_amount'
      - 'amount'
      - 'note'
      - 'invoice_attachment_url'
      - 'updated_at'
    AND NOT EXISTS (
      SELECT 1
      FROM public.bank_transaction_expense_matches match
      WHERE match.tenant_id = OLD.tenant_id
        AND match.expense_id = OLD.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.webhook_events event
      WHERE event.tenant_id = OLD.tenant_id
        AND event.provider = 'sepay'
        AND event.expense_id = OLD.id
    )
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE'
    AND current_setting('app.expense_cancel_id', true) = OLD.id::text
    AND auth.uid() IS NOT NULL
    AND OLD.tenant_id IS NOT DISTINCT FROM public.auth_tenant_id()
    AND (
      public.auth_is_owner(auth.uid())
      OR public.has_position('accountant')
    )
    AND public.has_permission_any('finance:expense_create')
    AND OLD.category <> 'bank_deposit'
    AND NOT EXISTS (
      SELECT 1
      FROM public.bank_transaction_expense_matches match
      WHERE match.tenant_id = OLD.tenant_id
        AND match.expense_id = OLD.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.webhook_events event
      WHERE event.tenant_id = OLD.tenant_id
        AND event.provider = 'sepay'
        AND event.expense_id = OLD.id
    )
  THEN
    RETURN OLD;
  END IF;

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
    PERFORM public.log_audit(
      'delete',
      'expense',
      OLD.id,
      to_jsonb(OLD),
      NULL
    );
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$_$;

CREATE OR REPLACE FUNCTION public.reconcile_bank_transaction_targets(p_bank_transaction_id bigint, p_target_type text, p_target_ids bigint[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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
    OR public.auth_role() NOT IN ('owner', 'accountant')
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
          'hospitality',
          'capital', 'construction', 'deposit',
          'other'
        )
        AND (
          v_transaction.webhook_event_id IS NOT NULL
          OR expense.payment_method IN ('transfer', 'unpaid')
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

CREATE OR REPLACE FUNCTION public.transition_expense_payment(p_expense_id bigint, p_target_method text) RETURNS TABLE(expense_id bigint, payment_method text, paid_at timestamp with time zone, transfer_content text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_user_id uuid := auth.uid();
  v_expense public.expenses%ROWTYPE;
  v_updated public.expenses%ROWTYPE;
  v_prelock_transfer_content text;
  v_is_paid_correction boolean := false;
BEGIN
  IF v_user_id IS NULL
    OR v_tenant_id IS NULL
    OR NOT (
      public.auth_is_owner(v_user_id)
      OR public.has_position('accountant')
    )
    OR NOT public.has_permission_any('finance:expense_create')
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

  IF p_target_method IS NULL
    OR p_target_method NOT IN ('cash', 'transfer', 'unpaid')
  THEN
    RAISE EXCEPTION 'expense_payment_target_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT expense.transfer_content
  INTO v_prelock_transfer_content
  FROM public.expenses expense
  WHERE expense.id = p_expense_id
    AND expense.tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_target_method = 'unpaid'
    AND v_prelock_transfer_content IS NOT NULL
  THEN
    PERFORM event.id
    FROM public.webhook_events event
    WHERE event.tenant_id = v_tenant_id
      AND event.provider = 'sepay'
      AND private.sepay_payload_contains_transfer_content(
        event.payload,
        v_prelock_transfer_content
      )
    ORDER BY event.id
    FOR UPDATE;
  END IF;

  SELECT expense.*
  INTO v_expense
  FROM public.expenses expense
  WHERE expense.id = p_expense_id
    AND expense.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_target_method = 'unpaid'
    AND v_expense.transfer_content IS NOT NULL
    AND v_expense.transfer_content IS DISTINCT FROM v_prelock_transfer_content
  THEN
    RAISE EXCEPTION 'expense_payment_state_changed' USING ERRCODE = '40001';
  END IF;

  IF NOT (
    v_expense.category = ANY (ARRAY[
      'rent',
      'utilities',
      'gas_fuel',
      'salary',
      'supplies',
      'repair',
      'marketing',
      'fees_tax',
      'hospitality',
      'capital', 'construction', 'deposit',
      'other'
    ]::text[])
  ) THEN
    RAISE EXCEPTION 'expense_payment_transition_not_operating'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bank_transaction_expense_matches match
    WHERE match.tenant_id = v_tenant_id
      AND match.expense_id = v_expense.id
  ) OR EXISTS (
    SELECT 1
    FROM public.webhook_events event
    WHERE event.tenant_id = v_tenant_id
      AND event.provider = 'sepay'
      AND event.expense_id = v_expense.id
  ) THEN
    RAISE EXCEPTION 'expense_already_matched' USING ERRCODE = '23505';
  END IF;

  IF p_target_method = 'cash'
    AND v_expense.payment_method = 'cash'
    AND v_expense.paid_at IS NOT NULL
    AND v_expense.transfer_content IS NULL
  THEN
    RETURN QUERY SELECT
      v_expense.id,
      v_expense.payment_method,
      v_expense.paid_at,
      v_expense.transfer_content;
    RETURN;
  END IF;

  IF p_target_method = 'transfer'
    AND v_expense.payment_method = 'transfer'
    AND v_expense.paid_at IS NOT NULL
  THEN
    RETURN QUERY SELECT
      v_expense.id,
      v_expense.payment_method,
      v_expense.paid_at,
      v_expense.transfer_content;
    RETURN;
  END IF;

  IF p_target_method = 'unpaid'
    AND v_expense.payment_method = 'unpaid'
    AND v_expense.paid_at IS NULL
    AND v_expense.transfer_content IS NULL
  THEN
    RETURN QUERY SELECT
      v_expense.id,
      v_expense.payment_method,
      v_expense.paid_at,
      v_expense.transfer_content;
    RETURN;
  END IF;

  v_is_paid_correction :=
    v_expense.paid_at IS NOT NULL
    AND v_expense.payment_method IN ('cash', 'transfer')
    AND p_target_method IS DISTINCT FROM v_expense.payment_method;

  IF v_is_paid_correction THEN
    NULL;
  ELSIF v_expense.payment_method = 'unpaid'
    AND v_expense.paid_at IS NULL
  THEN
    IF p_target_method = 'cash'
      AND v_expense.transfer_content IS NOT NULL
    THEN
      RAISE EXCEPTION 'expense_transfer_instruction_must_cancel'
        USING ERRCODE = '23514';
    END IF;

    IF p_target_method = 'unpaid'
      AND v_expense.transfer_content IS NULL
    THEN
      RAISE EXCEPTION 'expense_payment_state_final' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'expense_payment_state_final' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config(
    'app.expense_payment_transition_id',
    v_expense.id::text,
    true
  );

  UPDATE public.expenses expense
  SET payment_method = CASE
        WHEN p_target_method = 'cash' THEN 'cash'
        WHEN p_target_method = 'transfer' THEN 'transfer'
        ELSE 'unpaid'
      END,
      paid_at = CASE
        WHEN p_target_method = 'unpaid' THEN NULL
        WHEN v_expense.paid_at IS NOT NULL THEN v_expense.paid_at
        ELSE now()
      END,
      transfer_content = CASE
        WHEN p_target_method = 'transfer'
          AND NOT v_is_paid_correction
          THEN v_expense.transfer_content
        ELSE NULL
      END
  WHERE expense.id = v_expense.id
    AND expense.tenant_id = v_tenant_id
  RETURNING expense.* INTO v_updated;

  PERFORM set_config('app.expense_payment_transition_id', '', true);

  PERFORM public.log_audit(
    'update',
    'expense',
    v_expense.id,
    to_jsonb(v_expense),
    to_jsonb(v_updated)
  );

  RETURN QUERY SELECT
    v_updated.id,
    v_updated.payment_method,
    v_updated.paid_at,
    v_updated.transfer_content;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_operating_expense(p_expense_id bigint, p_branch_id bigint, p_expense_date date, p_category text, p_vat_breakdown jsonb, p_note text, p_invoice_attachment_url text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_user_id uuid := auth.uid();
  v_expense public.expenses%ROWTYPE;
  v_updated public.expenses%ROWTYPE;
  v_note text := NULLIF(btrim(p_note), '');
  v_attachment text := NULLIF(btrim(p_invoice_attachment_url), '');
BEGIN
  IF v_user_id IS NULL
    OR v_tenant_id IS NULL
    OR NOT (
      public.auth_is_owner(v_user_id)
      OR public.has_position('accountant')
    )
    OR NOT public.has_permission_any('finance:expense_create')
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
        'hospitality',
        'capital', 'construction', 'deposit',
        'other'
      ]::text[])
    )
    OR p_vat_breakdown IS NULL
    OR char_length(v_note) NOT BETWEEN 5 AND 500
    OR char_length(v_attachment) > 2048
    OR (v_attachment IS NOT NULL AND v_attachment !~* '^https?://')
  THEN
    RAISE EXCEPTION 'expense_update_invalid' USING ERRCODE = '23514';
  END IF;

  IF p_branch_id IS NOT NULL THEN
    PERFORM 1
    FROM public.branches branch
    WHERE branch.id = p_branch_id
      AND branch.tenant_id = v_tenant_id
      AND branch.is_active IS TRUE
    FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  SELECT expense.*
  INTO v_expense
  FROM public.expenses expense
  WHERE expense.id = p_expense_id
    AND expense.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    v_expense.category = ANY (ARRAY[
      'rent',
      'utilities',
      'gas_fuel',
      'salary',
      'supplies',
      'repair',
      'marketing',
      'fees_tax',
      'hospitality',
      'capital', 'construction', 'deposit',
      'other'
    ]::text[])
  ) THEN
    RAISE EXCEPTION 'expense_update_not_operating' USING ERRCODE = '23514';
  END IF;

  IF v_expense.transfer_content IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM public.bank_transaction_expense_matches match
      WHERE match.tenant_id = v_tenant_id
        AND match.expense_id = v_expense.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.webhook_events event
      WHERE event.tenant_id = v_tenant_id
        AND event.provider = 'sepay'
        AND event.expense_id = v_expense.id
    )
  THEN
    RAISE EXCEPTION 'expense_already_matched' USING ERRCODE = '23505';
  END IF;

  PERFORM set_config('app.expense_update_id', v_expense.id::text, true);

  UPDATE public.expenses expense
  SET
    branch_id = p_branch_id,
    expense_date = p_expense_date,
    category = p_category,
    vat_breakdown = p_vat_breakdown,
    note = v_note,
    invoice_attachment_url = v_attachment
  WHERE expense.id = v_expense.id
    AND expense.tenant_id = v_tenant_id
  RETURNING expense.* INTO v_updated;

  PERFORM public.log_audit(
    'update',
    'expense',
    v_expense.id,
    to_jsonb(v_expense),
    to_jsonb(v_updated)
  );

  PERFORM set_config('app.expense_update_id', '', true);

  RETURN jsonb_build_object('expense_id', v_updated.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_finance_startup_capital_summary(p_location text, p_branch_id bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_location text;
  v_sales_branch_ids bigint[] := ARRAY[]::bigint[];
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_location := lower(btrim(COALESCE(p_location, '')));
  IF v_location NOT IN ('all', 'company', 'branches', 'branch') THEN
    RAISE EXCEPTION 'invalid_location' USING ERRCODE = '22023';
  END IF;
  IF v_location = 'branch' AND p_branch_id IS NULL THEN
    RAISE EXCEPTION 'invalid_branch' USING ERRCODE = '22023';
  END IF;

  IF v_location = 'branches' THEN
    SELECT COALESCE(array_agg(branch.id), ARRAY[]::bigint[])
    INTO v_sales_branch_ids
    FROM public.branches branch
    WHERE branch.tenant_id = v_tenant
      AND branch.branch_kind = 'branch'
      AND COALESCE(branch.is_active, true);
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'startup_total',
        COALESCE(SUM(expense.amount), 0)::text,
      'startup_recorded', COUNT(*) > 0,
      'equipment_total',
        COALESCE(SUM(expense.amount)
          FILTER (WHERE expense.category = 'capital'), 0)::text,
      'equipment_recorded',
        COUNT(*) FILTER (WHERE expense.category = 'capital') > 0,
      'construction_total',
        COALESCE(SUM(expense.amount)
          FILTER (WHERE expense.category = 'construction'), 0)::text,
      'construction_recorded',
        COUNT(*) FILTER (WHERE expense.category = 'construction') > 0
    )
    FROM public.expenses expense
    WHERE expense.tenant_id = v_tenant
      AND expense.category IN ('capital', 'construction', 'deposit')
      AND (
        CASE v_location
          WHEN 'company' THEN expense.branch_id IS NULL
          WHEN 'branch' THEN expense.branch_id = p_branch_id
          WHEN 'branches' THEN expense.branch_id = ANY (v_sales_branch_ids)
          ELSE true
        END
      )
  );
END;
$$;

COMMENT ON FUNCTION public.get_finance_startup_capital_summary(text, bigint) IS
  'All-time gross capital+construction+deposit (Chi phí ban đầu), capital slice (Thiết bị), and construction slice (Thi công). Period is intentionally ignored; never part of the period result.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.expenses'::regclass
      AND conname = 'expenses_category_check'
      AND pg_get_constraintdef(oid) LIKE '%construction%'
  ) THEN
    RAISE EXCEPTION 'construction_expense_category_boundary_not_found';
  END IF;
END;
$$;
