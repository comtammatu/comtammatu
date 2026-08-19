-- Split book cash onto sales-branch ledgers. Company cash is the sum of
-- those books. Company bank stays one tenant ledger. `Kho Tổng` /
-- `Bếp Trung Tâm` never own a cash book.

CREATE OR REPLACE FUNCTION private.assert_sales_branch(
  p_tenant_id bigint,
  p_branch_id bigint
) RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $fn$
BEGIN
  IF p_branch_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.branches branch
      WHERE branch.id = p_branch_id
        AND branch.tenant_id = p_tenant_id
        AND branch.branch_kind = 'branch'
        AND COALESCE(branch.is_active, true)
    )
  THEN
    RAISE EXCEPTION 'finance_cash_branch_invalid'
      USING ERRCODE = '23514';
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION private.assert_sales_branch(bigint, bigint)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.sepay_cash_deposit_branch_id(
  p_payload jsonb
) RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $fn$
DECLARE
  v_memo text;
  v_match text[];
BEGIN
  v_memo := upper(regexp_replace(
    trim(
      both FROM concat_ws(
        ' ',
        COALESCE(p_payload->>'content', ''),
        COALESCE(p_payload->>'description', ''),
        COALESCE(p_payload->>'code', '')
      )
    ),
    '[^A-Z0-9]+',
    ' ',
    'g'
  ));
  v_match := regexp_match(v_memo, '\yNOP ([0-9]+)\y');
  IF v_match IS NULL OR v_match[1] IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN v_match[1]::bigint;
END;
$fn$;

REVOKE ALL ON FUNCTION private.sepay_cash_deposit_branch_id(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.finance_fund_entries
  ADD COLUMN IF NOT EXISTS branch_id bigint
    REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS finance_fund_entries_tenant_branch_idx
  ON public.finance_fund_entries (tenant_id, branch_id, effective_at, id);

CREATE OR REPLACE FUNCTION private.reject_finance_fund_entry_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.entry_type = 'opening'
    AND NEW.entry_type = 'opening'
    AND NEW.id = OLD.id
    AND NEW.tenant_id = OLD.tenant_id
    AND NEW.reason = OLD.reason
    AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
    AND NEW.created_at = OLD.created_at
    AND NEW.idempotency_key = OLD.idempotency_key
    AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id
    AND NEW.cash_delta = OLD.cash_delta
    AND NEW.bank_delta = OLD.bank_delta
    AND current_setting('app.finance_opening_repoint', true) = 'on'
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.entry_type = 'opening'
    AND NEW.entry_type = 'opening'
    AND NEW.id = OLD.id
    AND NEW.tenant_id = OLD.tenant_id
    AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id
    AND NEW.bank_delta = OLD.bank_delta
    AND NEW.reason = OLD.reason
    AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
    AND NEW.created_at = OLD.created_at
    AND NEW.idempotency_key = OLD.idempotency_key
    AND NEW.effective_at = OLD.effective_at
    AND current_setting('app.finance_branch_cash_cutover', true) = 'on'
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'finance_fund_entries_append_only'
    USING ERRCODE = '55000';
END;
$fn$;

DO $cutover$
DECLARE
  v_tenant_id bigint;
  v_opening public.finance_fund_entries%ROWTYPE;
  v_nht_id bigint;
  v_nht_count integer;
  v_sales_branch record;
  v_actor uuid;
  v_cash numeric;
BEGIN
  FOR v_opening IN
    SELECT *
    FROM public.finance_fund_entries entry
    WHERE entry.entry_type = 'opening'
      AND entry.branch_id IS NULL
      AND entry.cash_delta <> 0
  LOOP
    v_tenant_id := v_opening.tenant_id;

    SELECT count(*), min(branch.id)
    INTO v_nht_count, v_nht_id
    FROM public.branches branch
    WHERE branch.tenant_id = v_tenant_id
      AND branch.branch_kind = 'branch'
      AND branch.name ILIKE '%Nguyễn Hữu Thọ%';

    IF v_nht_count IS DISTINCT FROM 1 OR v_nht_id IS NULL THEN
      RAISE EXCEPTION 'branch_cash_cutover_nht_not_unique'
        USING ERRCODE = 'P0002';
    END IF;

    v_actor := v_opening.created_by;
    v_cash := v_opening.cash_delta;

    PERFORM set_config('app.finance_branch_cash_cutover', 'on', true);

    UPDATE public.finance_fund_entries entry
    SET cash_delta = 0
    WHERE entry.id = v_opening.id;

    PERFORM set_config('app.finance_branch_cash_cutover', '', true);

    INSERT INTO public.finance_fund_entries (
      tenant_id,
      branch_id,
      entry_type,
      cash_delta,
      bank_delta,
      effective_at,
      reason,
      created_by,
      idempotency_key,
      created_at
    ) VALUES (
      v_tenant_id,
      v_nht_id,
      'opening',
      v_cash,
      0,
      v_opening.effective_at,
      v_opening.reason,
      v_actor,
      gen_random_uuid(),
      v_opening.created_at
    );

    FOR v_sales_branch IN
      SELECT branch.id
      FROM public.branches branch
      WHERE branch.tenant_id = v_tenant_id
        AND branch.branch_kind = 'branch'
        AND COALESCE(branch.is_active, true)
        AND branch.id IS DISTINCT FROM v_nht_id
    LOOP
      INSERT INTO public.finance_fund_entries (
        tenant_id,
        branch_id,
        entry_type,
        cash_delta,
        bank_delta,
        effective_at,
        reason,
        created_by,
        idempotency_key,
        created_at
      ) VALUES (
        v_tenant_id,
        v_sales_branch.id,
        'opening',
        0,
        0,
        v_opening.effective_at,
        v_opening.reason,
        v_actor,
        gen_random_uuid(),
        v_opening.created_at
      );
    END LOOP;

  END LOOP;
END;
$cutover$;

-- Cash-scope backfill only stamps branch_id. Replica role skips deferred
-- evidence constraint triggers so later ALTER TABLE is not blocked by
-- pending trigger events (SQLSTATE 55006).
SET LOCAL session_replication_role = replica;

DO $backfill_expenses$
DECLARE
  v_tenant_id bigint;
  v_nht_id bigint;
  v_nht_count integer;
BEGIN
  FOR v_tenant_id IN
    SELECT DISTINCT expense.tenant_id
    FROM public.expenses expense
    WHERE expense.branch_id IS NULL
      AND (
        expense.payment_method = 'cash'
        OR expense.category = 'bank_deposit'
      )
  LOOP
    SELECT count(*), min(branch.id)
    INTO v_nht_count, v_nht_id
    FROM public.branches branch
    WHERE branch.tenant_id = v_tenant_id
      AND branch.branch_kind = 'branch'
      AND branch.name ILIKE '%Nguyễn Hữu Thọ%';

    IF v_nht_count IS DISTINCT FROM 1 OR v_nht_id IS NULL THEN
      RAISE EXCEPTION 'branch_cash_cutover_nht_not_unique'
        USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.expenses expense
    SET branch_id = v_nht_id
    WHERE expense.tenant_id = v_tenant_id
      AND expense.branch_id IS NULL
      AND (
        expense.payment_method = 'cash'
        OR expense.category = 'bank_deposit'
      );
  END LOOP;
END;
$backfill_expenses$;

DROP INDEX IF EXISTS public.finance_fund_entries_one_opening_per_tenant;

CREATE UNIQUE INDEX finance_fund_entries_one_company_opening
  ON public.finance_fund_entries (tenant_id)
  WHERE entry_type = 'opening' AND branch_id IS NULL;

CREATE UNIQUE INDEX finance_fund_entries_one_opening_per_branch
  ON public.finance_fund_entries (tenant_id, branch_id)
  WHERE entry_type = 'opening' AND branch_id IS NOT NULL;

ALTER TABLE public.finance_fund_entries
  DROP CONSTRAINT IF EXISTS finance_fund_entries_scope_amount;

ALTER TABLE public.finance_fund_entries
  ADD CONSTRAINT finance_fund_entries_scope_amount CHECK (
    (branch_id IS NULL AND cash_delta = 0)
    OR (branch_id IS NOT NULL AND bank_delta = 0)
  );

ALTER TABLE public.finance_fund_entries
  DROP CONSTRAINT IF EXISTS finance_fund_entries_entry_amount;

ALTER TABLE public.finance_fund_entries
  ADD CONSTRAINT finance_fund_entries_entry_amount CHECK (
    (
      entry_type = 'opening'
      AND cash_delta >= 0
      AND bank_delta >= 0
    )
    OR (
      entry_type = 'adjustment'
      AND (cash_delta <> 0 OR bank_delta <> 0)
    )
  );

COMMENT ON TABLE public.finance_fund_entries IS
  'Immutable company bank opening/adjustments (branch_id NULL) and sales-branch cash opening/adjustments. Operational movements stay in canonical ledgers.';

ALTER TABLE public.supplier_payments
  ADD COLUMN IF NOT EXISTS branch_id bigint
    REFERENCES public.branches(id);

DO $backfill_supplier$
DECLARE
  v_tenant_id bigint;
  v_nht_id bigint;
  v_nht_count integer;
BEGIN
  FOR v_tenant_id IN
    SELECT DISTINCT payment.tenant_id
    FROM public.supplier_payments payment
    WHERE payment.payment_method = 'cash'
      AND payment.branch_id IS NULL
  LOOP
    SELECT count(*), min(branch.id)
    INTO v_nht_count, v_nht_id
    FROM public.branches branch
    WHERE branch.tenant_id = v_tenant_id
      AND branch.branch_kind = 'branch'
      AND branch.name ILIKE '%Nguyễn Hữu Thọ%';

    IF v_nht_count IS DISTINCT FROM 1 OR v_nht_id IS NULL THEN
      RAISE EXCEPTION 'branch_cash_cutover_nht_not_unique'
        USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.supplier_payments payment
    SET branch_id = v_nht_id
    WHERE payment.tenant_id = v_tenant_id
      AND payment.payment_method = 'cash'
      AND payment.branch_id IS NULL;
  END LOOP;
END;
$backfill_supplier$;

SET LOCAL session_replication_role = DEFAULT;
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE public.supplier_payments
  DROP CONSTRAINT IF EXISTS supplier_payments_cash_requires_branch;

ALTER TABLE public.supplier_payments
  ADD CONSTRAINT supplier_payments_cash_requires_branch CHECK (
    payment_method <> 'cash' OR branch_id IS NOT NULL
  );

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_cash_requires_branch;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_cash_requires_branch CHECK (
    payment_method <> 'cash' OR branch_id IS NOT NULL
  );

CREATE OR REPLACE FUNCTION private.enforce_cash_sales_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
BEGIN
  IF TG_TABLE_NAME = 'expenses'
    AND (
      NEW.payment_method = 'cash'
      OR NEW.category = 'bank_deposit'
    )
  THEN
    PERFORM private.assert_sales_branch(NEW.tenant_id, NEW.branch_id);
  END IF;

  IF TG_TABLE_NAME = 'supplier_payments'
    AND NEW.payment_method = 'cash'
  THEN
    PERFORM private.assert_sales_branch(NEW.tenant_id, NEW.branch_id);
  END IF;

  IF TG_TABLE_NAME = 'finance_fund_entries'
    AND NEW.branch_id IS NOT NULL
  THEN
    PERFORM private.assert_sales_branch(NEW.tenant_id, NEW.branch_id);
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION private.enforce_cash_sales_branch()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS expenses_enforce_cash_sales_branch ON public.expenses;
CREATE TRIGGER expenses_enforce_cash_sales_branch
BEFORE INSERT OR UPDATE OF branch_id, payment_method, category
ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION private.enforce_cash_sales_branch();

DROP TRIGGER IF EXISTS supplier_payments_enforce_cash_sales_branch
  ON public.supplier_payments;
CREATE TRIGGER supplier_payments_enforce_cash_sales_branch
BEFORE INSERT OR UPDATE OF branch_id, payment_method
ON public.supplier_payments
FOR EACH ROW
EXECUTE FUNCTION private.enforce_cash_sales_branch();

DROP TRIGGER IF EXISTS finance_fund_entries_enforce_cash_sales_branch
  ON public.finance_fund_entries;
CREATE TRIGGER finance_fund_entries_enforce_cash_sales_branch
BEFORE INSERT OR UPDATE OF branch_id
ON public.finance_fund_entries
FOR EACH ROW
EXECUTE FUNCTION private.enforce_cash_sales_branch();

CREATE OR REPLACE FUNCTION public.initialize_finance_funds(
  p_cash_opening numeric,
  p_bank_opening numeric,
  p_effective_at timestamp with time zone,
  p_reason text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_now timestamptz := statement_timestamp();
  v_effective_at timestamptz := COALESCE(p_effective_at, statement_timestamp());
  v_reason text := btrim(p_reason);
  v_existing public.finance_fund_entries%ROWTYPE;
  v_entry public.finance_fund_entries%ROWTYPE;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT (public.auth_is_owner(v_actor) OR public.has_position('accountant'))
    OR NOT public.has_permission_any('finance:view')
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  IF p_cash_opening IS NULL
    OR p_cash_opening <> 0
  THEN
    RAISE EXCEPTION 'finance_fund_cash_requires_branch'
      USING ERRCODE = '22023';
  END IF;

  IF p_bank_opening IS NULL
    OR p_bank_opening < 0
    OR abs(p_bank_opening) > 100000000000
    OR NOT isfinite(v_effective_at)
    OR v_effective_at > v_now
    OR v_reason IS NULL
    OR char_length(v_reason) NOT BETWEEN 5 AND 500
    OR p_idempotency_key IS NULL
  THEN
    RAISE EXCEPTION 'finance_fund_opening_invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('finance_funds:' || v_tenant_id::text, 0)
  );

  SELECT *
  INTO v_existing
  FROM public.finance_fund_entries entry
  WHERE entry.tenant_id = v_tenant_id
    AND entry.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.entry_type = 'opening'
      AND v_existing.branch_id IS NULL
      AND v_existing.cash_delta = 0
      AND v_existing.bank_delta = p_bank_opening
      AND (
        v_existing.effective_at = p_effective_at
        OR (
          p_effective_at IS NULL
          AND v_existing.effective_at = v_existing.created_at
        )
      )
      AND v_existing.reason = v_reason
    THEN
      RETURN to_jsonb(v_existing);
    END IF;

    RAISE EXCEPTION 'finance_fund_idempotency_conflict'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.finance_fund_entries entry
    WHERE entry.tenant_id = v_tenant_id
      AND entry.entry_type = 'opening'
      AND entry.branch_id IS NULL
  ) THEN
    RAISE EXCEPTION 'finance_funds_already_initialized'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.system_settings setting
    WHERE setting.tenant_id = v_tenant_id
      AND setting.key IN (
        'cash_opening_balance',
        'bank_opening_balance',
        'cash_opening_date'
      )
  )
    AND current_setting(
      'app.finance_legacy_cutover_idempotency_key',
      true
    ) IS DISTINCT FROM p_idempotency_key::text
  THEN
    RAISE EXCEPTION 'finance_fund_legacy_cutover_required'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.finance_fund_entries (
    tenant_id,
    branch_id,
    entry_type,
    cash_delta,
    bank_delta,
    effective_at,
    reason,
    created_by,
    idempotency_key,
    created_at
  ) VALUES (
    v_tenant_id,
    NULL,
    'opening',
    0,
    p_bank_opening,
    v_effective_at,
    v_reason,
    v_actor,
    p_idempotency_key,
    v_now
  )
  RETURNING * INTO v_entry;

  PERFORM public.log_audit(
    'finance_fund_opening_created',
    'finance_fund_entry',
    v_entry.id,
    NULL,
    jsonb_build_object(
      'entry_type', v_entry.entry_type,
      'branch_id', NULL,
      'cash_delta', v_entry.cash_delta,
      'bank_delta', v_entry.bank_delta,
      'effective_at', v_entry.effective_at,
      'reason', v_entry.reason,
      'idempotency_key', v_entry.idempotency_key
    )
  );

  RETURN to_jsonb(v_entry);
END;
$fn$;

COMMENT ON FUNCTION public.initialize_finance_funds(
  numeric, numeric, timestamptz, text, uuid
) IS
  'Creates the immutable company bank opening once. Cash openings use initialize_branch_cash_opening. p_cash_opening must be 0.';

CREATE OR REPLACE FUNCTION public.initialize_branch_cash_opening(
  p_branch_id bigint,
  p_cash_opening numeric,
  p_effective_at timestamp with time zone,
  p_reason text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_now timestamptz := statement_timestamp();
  v_effective_at timestamptz := COALESCE(p_effective_at, statement_timestamp());
  v_reason text := btrim(p_reason);
  v_existing public.finance_fund_entries%ROWTYPE;
  v_company public.finance_fund_entries%ROWTYPE;
  v_entry public.finance_fund_entries%ROWTYPE;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT (public.auth_is_owner(v_actor) OR public.has_position('accountant'))
    OR NOT public.has_permission_any('finance:view')
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  PERFORM private.assert_sales_branch(v_tenant_id, p_branch_id);

  IF p_cash_opening IS NULL
    OR p_cash_opening < 0
    OR abs(p_cash_opening) > 100000000000
    OR NOT isfinite(v_effective_at)
    OR v_effective_at > v_now
    OR v_reason IS NULL
    OR char_length(v_reason) NOT BETWEEN 5 AND 500
    OR p_idempotency_key IS NULL
  THEN
    RAISE EXCEPTION 'finance_fund_opening_invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('finance_funds:' || v_tenant_id::text, 0)
  );

  SELECT *
  INTO v_company
  FROM public.finance_fund_entries entry
  WHERE entry.tenant_id = v_tenant_id
    AND entry.entry_type = 'opening'
    AND entry.branch_id IS NULL;

  IF v_company.id IS NULL THEN
    RAISE EXCEPTION 'finance_funds_not_initialized'
      USING ERRCODE = '55000';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.finance_fund_entries entry
  WHERE entry.tenant_id = v_tenant_id
    AND entry.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.entry_type = 'opening'
      AND v_existing.branch_id = p_branch_id
      AND v_existing.cash_delta = p_cash_opening
      AND v_existing.bank_delta = 0
      AND (
        v_existing.effective_at = p_effective_at
        OR (
          p_effective_at IS NULL
          AND v_existing.effective_at = v_existing.created_at
        )
      )
      AND v_existing.reason = v_reason
    THEN
      RETURN to_jsonb(v_existing);
    END IF;

    RAISE EXCEPTION 'finance_fund_idempotency_conflict'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.finance_fund_entries entry
    WHERE entry.tenant_id = v_tenant_id
      AND entry.entry_type = 'opening'
      AND entry.branch_id = p_branch_id
  ) THEN
    RAISE EXCEPTION 'finance_funds_already_initialized'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.finance_fund_entries (
    tenant_id,
    branch_id,
    entry_type,
    cash_delta,
    bank_delta,
    effective_at,
    reason,
    created_by,
    idempotency_key,
    created_at
  ) VALUES (
    v_tenant_id,
    p_branch_id,
    'opening',
    p_cash_opening,
    0,
    v_effective_at,
    v_reason,
    v_actor,
    p_idempotency_key,
    v_now
  )
  RETURNING * INTO v_entry;

  PERFORM public.log_audit(
    'finance_fund_opening_created',
    'finance_fund_entry',
    v_entry.id,
    NULL,
    jsonb_build_object(
      'entry_type', v_entry.entry_type,
      'branch_id', v_entry.branch_id,
      'cash_delta', v_entry.cash_delta,
      'bank_delta', v_entry.bank_delta,
      'effective_at', v_entry.effective_at,
      'reason', v_entry.reason,
      'idempotency_key', v_entry.idempotency_key
    )
  );

  RETURN to_jsonb(v_entry);
END;
$fn$;

REVOKE ALL ON FUNCTION public.initialize_branch_cash_opening(
  bigint, numeric, timestamptz, text, uuid
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.initialize_branch_cash_opening(
  bigint, numeric, timestamptz, text, uuid
) TO authenticated;

COMMENT ON FUNCTION public.initialize_branch_cash_opening(
  bigint, numeric, timestamptz, text, uuid
) IS
  'Creates the immutable sales-branch cash opening once. Company bank opening must already exist.';

DROP FUNCTION IF EXISTS public.create_finance_fund_adjustment(
  numeric, numeric, text, uuid
);

CREATE FUNCTION public.create_finance_fund_adjustment(
  p_cash_delta numeric,
  p_bank_delta numeric,
  p_reason text,
  p_idempotency_key uuid,
  p_branch_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_now timestamptz := statement_timestamp();
  v_reason text := btrim(p_reason);
  v_existing public.finance_fund_entries%ROWTYPE;
  v_entry public.finance_fund_entries%ROWTYPE;
  v_cash numeric := COALESCE(p_cash_delta, 0);
  v_bank numeric := COALESCE(p_bank_delta, 0);
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT (public.auth_is_owner(v_actor) OR public.has_position('accountant'))
    OR NOT public.has_permission_any('finance:view')
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  IF (v_cash = 0 AND v_bank = 0)
    OR abs(v_cash) > 100000000000
    OR abs(v_bank) > 100000000000
    OR v_reason IS NULL
    OR char_length(v_reason) NOT BETWEEN 5 AND 500
    OR p_idempotency_key IS NULL
  THEN
    RAISE EXCEPTION 'finance_fund_adjustment_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF v_cash <> 0 AND v_bank <> 0 THEN
    RAISE EXCEPTION 'finance_fund_adjustment_mixed_scope'
      USING ERRCODE = '22023';
  END IF;

  IF v_cash <> 0 THEN
    PERFORM private.assert_sales_branch(v_tenant_id, p_branch_id);
  ELSIF p_branch_id IS NOT NULL THEN
    RAISE EXCEPTION 'finance_fund_adjustment_mixed_scope'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('finance_funds:' || v_tenant_id::text, 0)
  );

  SELECT *
  INTO v_existing
  FROM public.finance_fund_entries entry
  WHERE entry.tenant_id = v_tenant_id
    AND entry.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.entry_type = 'adjustment'
      AND v_existing.cash_delta = v_cash
      AND v_existing.bank_delta = v_bank
      AND v_existing.branch_id IS NOT DISTINCT FROM p_branch_id
      AND v_existing.reason = v_reason
    THEN
      RETURN to_jsonb(v_existing);
    END IF;

    RAISE EXCEPTION 'finance_fund_idempotency_conflict'
      USING ERRCODE = '23505';
  END IF;

  IF v_bank <> 0 AND NOT EXISTS (
    SELECT 1
    FROM public.finance_fund_entries entry
    WHERE entry.tenant_id = v_tenant_id
      AND entry.entry_type = 'opening'
      AND entry.branch_id IS NULL
  ) THEN
    RAISE EXCEPTION 'finance_funds_not_initialized'
      USING ERRCODE = '55000';
  END IF;

  IF v_cash <> 0 AND NOT EXISTS (
    SELECT 1
    FROM public.finance_fund_entries entry
    WHERE entry.tenant_id = v_tenant_id
      AND entry.entry_type = 'opening'
      AND entry.branch_id = p_branch_id
  ) THEN
    RAISE EXCEPTION 'finance_funds_not_initialized'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.finance_fund_entries (
    tenant_id,
    branch_id,
    entry_type,
    cash_delta,
    bank_delta,
    effective_at,
    reason,
    created_by,
    idempotency_key,
    created_at
  ) VALUES (
    v_tenant_id,
    CASE WHEN v_cash <> 0 THEN p_branch_id ELSE NULL END,
    'adjustment',
    v_cash,
    v_bank,
    v_now,
    v_reason,
    v_actor,
    p_idempotency_key,
    v_now
  )
  RETURNING * INTO v_entry;

  PERFORM public.log_audit(
    'finance_fund_adjustment_created',
    'finance_fund_entry',
    v_entry.id,
    NULL,
    jsonb_build_object(
      'entry_type', v_entry.entry_type,
      'branch_id', v_entry.branch_id,
      'cash_delta', v_entry.cash_delta,
      'bank_delta', v_entry.bank_delta,
      'effective_at', v_entry.effective_at,
      'reason', v_entry.reason,
      'idempotency_key', v_entry.idempotency_key
    )
  );

  RETURN to_jsonb(v_entry);
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_finance_fund_adjustment(
  numeric, numeric, text, uuid, bigint
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_finance_fund_adjustment(
  numeric, numeric, text, uuid, bigint
) TO authenticated;

COMMENT ON FUNCTION public.create_finance_fund_adjustment(
  numeric, numeric, text, uuid, bigint
) IS
  'Appends one audited correction. Cash requires p_branch_id; bank requires NULL. Mixed cash+bank in one call is rejected.';

CREATE OR REPLACE FUNCTION public.repoint_finance_fund_opening(
  p_effective_at timestamp with time zone,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_now timestamptz := statement_timestamp();
  v_reason text := btrim(p_reason);
  v_opening public.finance_fund_entries%ROWTYPE;
  v_previous_effective_at timestamptz;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.auth_is_owner(v_actor)
    OR NOT EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.id = v_actor
        AND profile.tenant_id = v_tenant_id
        AND COALESCE(profile.is_active, true)
    )
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  IF p_effective_at IS NULL
    OR NOT isfinite(p_effective_at)
    OR p_effective_at > v_now
    OR v_reason IS NULL
    OR char_length(v_reason) NOT BETWEEN 5 AND 500
  THEN
    RAISE EXCEPTION 'finance_fund_opening_invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('finance_funds:' || v_tenant_id::text, 0)
  );

  SELECT *
  INTO v_opening
  FROM public.finance_fund_entries entry
  WHERE entry.tenant_id = v_tenant_id
    AND entry.entry_type = 'opening'
    AND entry.branch_id IS NULL;

  IF v_opening.id IS NULL THEN
    RAISE EXCEPTION 'finance_funds_not_initialized'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_opening.effective_at = p_effective_at THEN
    RETURN to_jsonb(v_opening);
  END IF;

  v_previous_effective_at := v_opening.effective_at;

  BEGIN
    PERFORM set_config('app.finance_opening_repoint', 'on', true);

    UPDATE public.finance_fund_entries entry
    SET effective_at = p_effective_at
    WHERE entry.tenant_id = v_tenant_id
      AND entry.entry_type = 'opening';

    SELECT *
    INTO v_opening
    FROM public.finance_fund_entries entry
    WHERE entry.id = v_opening.id;

    PERFORM set_config('app.finance_opening_repoint', '', true);
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('app.finance_opening_repoint', '', true);
      RAISE;
  END;

  PERFORM public.log_audit(
    'finance_fund_opening_repointed',
    'finance_fund_entry',
    v_opening.id,
    jsonb_build_object(
      'effective_at', v_previous_effective_at
    ),
    jsonb_build_object(
      'effective_at', v_opening.effective_at,
      'reason', v_reason
    )
  );

  RETURN to_jsonb(v_opening);
END;
$fn$;

DROP FUNCTION IF EXISTS public.get_cash_ledger_movement_since(timestamptz);

CREATE FUNCTION public.get_cash_ledger_movement_since(
  p_since timestamp with time zone,
  p_branch_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
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
    OR NOT public.has_permission_any('finance:view')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_branch_id IS NOT NULL THEN
    PERFORM private.assert_sales_branch(v_tenant_id, p_branch_id);
  END IF;

  SELECT COALESCE(sum(payment.amount), 0)
  INTO v_cash_collections
  FROM public.payments payment
  WHERE payment.tenant_id = v_tenant_id
    AND payment.method = 'cash'
    AND payment.status IN ('completed', 'refunded')
    AND payment.paid_at >= p_since
    AND (
      p_branch_id IS NULL
      OR payment.branch_id = p_branch_id
    );

  SELECT COALESCE(sum(refund.amount), 0)
  INTO v_cash_refunds
  FROM public.refunds refund
  WHERE refund.tenant_id = v_tenant_id
    AND refund.status = 'approved'
    AND refund.payout_method = 'cash'
    AND refund.approved_at >= p_since
    AND (
      p_branch_id IS NULL
      OR refund.branch_id = p_branch_id
    );

  SELECT COALESCE(sum(expense.amount), 0)
  INTO v_cash_expenses
  FROM public.expenses expense
  WHERE expense.tenant_id = v_tenant_id
    AND expense.payment_method = 'cash'
    AND expense.paid_at >= p_since
    AND (
      p_branch_id IS NULL
      OR expense.branch_id = p_branch_id
    );

  SELECT COALESCE(sum(supplier_payment.amount), 0)
  INTO v_cash_supplier_payments
  FROM public.supplier_payments supplier_payment
  WHERE supplier_payment.tenant_id = v_tenant_id
    AND supplier_payment.payment_method = 'cash'
    AND supplier_payment.payment_date >= p_since
    AND (
      p_branch_id IS NULL
      OR supplier_payment.branch_id = p_branch_id
    );

  RETURN jsonb_build_object(
    'cash_collections', v_cash_collections,
    'cash_refunds', v_cash_refunds,
    'cash_expenses', v_cash_expenses,
    'cash_supplier_payments', v_cash_supplier_payments,
    'cash_variance_adjustments', 0
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_cash_ledger_movement_since(timestamptz, bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cash_ledger_movement_since(timestamptz, bigint)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_cash_ledger_movement_since(timestamptz, bigint) IS
  'Returns cash-book movements for one sales branch, or the company rollup when p_branch_id is NULL.';

CREATE OR REPLACE FUNCTION public.get_finance_current_funds()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_company public.finance_fund_entries%ROWTYPE;
  v_bank_movement jsonb;
  v_bank_adjustments numeric;
  v_bank_in numeric;
  v_bank_out numeric;
  v_legacy_settings_present boolean;
  v_branches jsonb := '[]'::jsonb;
  v_branch record;
  v_opening public.finance_fund_entries%ROWTYPE;
  v_cash_movement jsonb;
  v_cash_adjustments numeric;
  v_opening_cash numeric := 0;
  v_cash_collections numeric := 0;
  v_cash_refunds numeric := 0;
  v_cash_expenses numeric := 0;
  v_cash_supplier_payments numeric := 0;
  v_cash_adjustments_total numeric := 0;
  v_missing integer := 0;
  v_active integer := 0;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.has_permission_any('finance:view')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_company
  FROM public.finance_fund_entries entry
  WHERE entry.tenant_id = v_tenant_id
    AND entry.entry_type = 'opening'
    AND entry.branch_id IS NULL;

  SELECT EXISTS (
    SELECT 1
    FROM public.system_settings setting
    WHERE setting.tenant_id = v_tenant_id
      AND setting.key IN (
        'cash_opening_balance',
        'bank_opening_balance',
        'cash_opening_date'
      )
  )
  INTO v_legacy_settings_present;

  FOR v_branch IN
    SELECT branch.id, branch.name
    FROM public.branches branch
    WHERE branch.tenant_id = v_tenant_id
      AND branch.branch_kind = 'branch'
      AND COALESCE(branch.is_active, true)
    ORDER BY branch.name, branch.id
  LOOP
    v_active := v_active + 1;

    SELECT *
    INTO v_opening
    FROM public.finance_fund_entries entry
    WHERE entry.tenant_id = v_tenant_id
      AND entry.entry_type = 'opening'
      AND entry.branch_id = v_branch.id;

    IF v_opening.id IS NULL THEN
      v_missing := v_missing + 1;
      v_branches := v_branches || jsonb_build_array(
        jsonb_build_object(
          'branch_id', v_branch.id,
          'branch_name', v_branch.name,
          'has_opening', false,
          'opening_entry_id', NULL,
          'opening_cash', 0,
          'opening_effective_at', NULL,
          'cash_collections', 0,
          'cash_refunds', 0,
          'cash_expenses', 0,
          'cash_supplier_payments', 0,
          'cash_adjustments', 0,
          'cash_current', 0
        )
      );
      CONTINUE;
    END IF;

    v_cash_movement :=
      public.get_cash_ledger_movement_since(
        v_opening.effective_at,
        v_branch.id
      );

    SELECT COALESCE(sum(entry.cash_delta), 0)
    INTO v_cash_adjustments
    FROM public.finance_fund_entries entry
    WHERE entry.tenant_id = v_tenant_id
      AND entry.entry_type = 'adjustment'
      AND entry.branch_id = v_branch.id
      AND entry.effective_at >= v_opening.effective_at;

    v_branches := v_branches || jsonb_build_array(
      jsonb_build_object(
        'branch_id', v_branch.id,
        'branch_name', v_branch.name,
        'has_opening', true,
        'opening_entry_id', v_opening.id,
        'opening_cash', v_opening.cash_delta,
        'opening_effective_at', v_opening.effective_at,
        'cash_collections',
          COALESCE((v_cash_movement ->> 'cash_collections')::numeric, 0),
        'cash_refunds',
          COALESCE((v_cash_movement ->> 'cash_refunds')::numeric, 0),
        'cash_expenses',
          COALESCE((v_cash_movement ->> 'cash_expenses')::numeric, 0),
        'cash_supplier_payments',
          COALESCE((v_cash_movement ->> 'cash_supplier_payments')::numeric, 0),
        'cash_adjustments', v_cash_adjustments,
        'cash_current',
          v_opening.cash_delta
          + COALESCE((v_cash_movement ->> 'cash_collections')::numeric, 0)
          - COALESCE((v_cash_movement ->> 'cash_refunds')::numeric, 0)
          - COALESCE((v_cash_movement ->> 'cash_expenses')::numeric, 0)
          - COALESCE((v_cash_movement ->> 'cash_supplier_payments')::numeric, 0)
          + v_cash_adjustments
      )
    );

    v_opening_cash := v_opening_cash + v_opening.cash_delta;
    v_cash_collections := v_cash_collections
      + COALESCE((v_cash_movement ->> 'cash_collections')::numeric, 0);
    v_cash_refunds := v_cash_refunds
      + COALESCE((v_cash_movement ->> 'cash_refunds')::numeric, 0);
    v_cash_expenses := v_cash_expenses
      + COALESCE((v_cash_movement ->> 'cash_expenses')::numeric, 0);
    v_cash_supplier_payments := v_cash_supplier_payments
      + COALESCE((v_cash_movement ->> 'cash_supplier_payments')::numeric, 0);
    v_cash_adjustments_total := v_cash_adjustments_total + v_cash_adjustments;
  END LOOP;

  IF v_company.id IS NULL THEN
    RETURN jsonb_build_object(
      'has_opening', false,
      'has_company_opening', false,
      'branches_complete', v_active > 0 AND v_missing = 0,
      'opening_entry_id', NULL,
      'opening_cash', 0,
      'opening_bank', 0,
      'opening_effective_at', NULL,
      'cash_collections', 0,
      'cash_refunds', 0,
      'cash_expenses', 0,
      'cash_supplier_payments', 0,
      'cash_variance_adjustments', 0,
      'cash_adjustments', 0,
      'cash_current', 0,
      'bank_in', 0,
      'bank_out', 0,
      'bank_adjustments', 0,
      'bank_current', 0,
      'legacy_settings_present', v_legacy_settings_present,
      'branches', v_branches
    );
  END IF;

  v_bank_movement :=
    public.get_bank_ledger_movement_since(v_company.effective_at);

  SELECT COALESCE(sum(entry.bank_delta), 0)
  INTO v_bank_adjustments
  FROM public.finance_fund_entries entry
  WHERE entry.tenant_id = v_tenant_id
    AND entry.entry_type = 'adjustment'
    AND entry.branch_id IS NULL
    AND entry.effective_at >= v_company.effective_at;

  v_bank_in := COALESCE((v_bank_movement ->> 'bank_in')::numeric, 0);
  v_bank_out := COALESCE((v_bank_movement ->> 'bank_out')::numeric, 0);

  RETURN jsonb_build_object(
    'has_opening', true,
    'has_company_opening', true,
    'branches_complete', v_active > 0 AND v_missing = 0,
    'opening_entry_id', v_company.id,
    'opening_cash', CASE WHEN v_missing = 0 THEN v_opening_cash ELSE 0 END,
    'opening_bank', v_company.bank_delta,
    'opening_effective_at', v_company.effective_at,
    'cash_collections', CASE WHEN v_missing = 0 THEN v_cash_collections ELSE 0 END,
    'cash_refunds', CASE WHEN v_missing = 0 THEN v_cash_refunds ELSE 0 END,
    'cash_expenses', CASE WHEN v_missing = 0 THEN v_cash_expenses ELSE 0 END,
    'cash_supplier_payments',
      CASE WHEN v_missing = 0 THEN v_cash_supplier_payments ELSE 0 END,
    'cash_variance_adjustments', 0,
    'cash_adjustments',
      CASE WHEN v_missing = 0 THEN v_cash_adjustments_total ELSE 0 END,
    'cash_current',
      CASE WHEN v_missing = 0 THEN
        v_opening_cash
        + v_cash_collections
        - v_cash_refunds
        - v_cash_expenses
        - v_cash_supplier_payments
        + v_cash_adjustments_total
      ELSE 0 END,
    'bank_in', v_bank_in,
    'bank_out', v_bank_out,
    'bank_adjustments', v_bank_adjustments,
    'bank_current',
      v_company.bank_delta
      + v_bank_in
      - v_bank_out
      + v_bank_adjustments,
    'legacy_settings_present', v_legacy_settings_present,
    'branches', v_branches
  );
END;
$fn$;

COMMENT ON FUNCTION public.get_finance_current_funds() IS
  'Returns company bank funds plus per-sales-branch cash books in one snapshot. Company cash is the sum of branch books only when every active sales branch is opened.';

DROP FUNCTION IF EXISTS public.record_bank_transaction_cash_deposit(bigint);

CREATE FUNCTION public.record_bank_transaction_cash_deposit(
  p_bank_transaction_id bigint,
  p_branch_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_transaction public.bank_transactions%ROWTYPE;
  v_event public.webhook_events%ROWTYPE;
  v_expense_id bigint;
BEGIN
  IF v_actor IS NULL
    OR v_tenant_id IS NULL
    OR NOT public.auth_is_owner(v_actor)
    OR NOT public.has_permission_any('finance:view')
  THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  PERFORM private.assert_sales_branch(v_tenant_id, p_branch_id);

  SELECT transaction.*
  INTO v_transaction
  FROM public.bank_transactions transaction
  WHERE transaction.id = p_bank_transaction_id
    AND transaction.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bank_transaction_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_transaction.transfer_type <> 'in' THEN
    RAISE EXCEPTION 'bank_transaction_direction_mismatch'
      USING ERRCODE = '23514';
  END IF;

  SELECT expense.id
  INTO v_expense_id
  FROM public.bank_transaction_reconciliation_matches match
  JOIN public.expenses expense
    ON expense.id = match.expense_id
   AND expense.tenant_id = match.tenant_id
  WHERE match.tenant_id = v_tenant_id
    AND match.bank_transaction_id = v_transaction.id
    AND expense.category = 'bank_deposit'
    AND expense.payment_method = 'cash'
    AND expense.amount = v_transaction.amount
    AND match.matched_amount = v_transaction.amount;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'already_recorded',
      'expense_id', v_expense_id
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bank_transaction_reconciliation_matches match
    WHERE match.tenant_id = v_tenant_id
      AND match.bank_transaction_id = v_transaction.id
  ) THEN
    RAISE EXCEPTION 'bank_transaction_already_reconciled'
      USING ERRCODE = '23514';
  END IF;

  IF v_transaction.webhook_event_id IS NOT NULL THEN
    SELECT *
    INTO v_event
    FROM public.webhook_events event
    WHERE event.id = v_transaction.webhook_event_id
      AND event.tenant_id = v_tenant_id
    FOR UPDATE;

    IF NOT FOUND
      OR v_event.provider <> 'sepay'
      OR v_event.signature_valid IS NOT TRUE
      OR v_event.processing_status = 'failed'
      OR v_event.payment_id IS NOT NULL
    THEN
      RAISE EXCEPTION 'bank_transaction_already_reconciled'
        USING ERRCODE = '23514';
    END IF;

    IF v_event.expense_id IS NOT NULL THEN
      SELECT expense.id
      INTO v_expense_id
      FROM public.expenses expense
      WHERE expense.id = v_event.expense_id
        AND expense.tenant_id = v_tenant_id
        AND expense.category = 'bank_deposit'
        AND expense.payment_method = 'cash'
        AND expense.amount = v_transaction.amount;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'cash_deposit_link_invalid'
          USING ERRCODE = '23514';
      END IF;

      RETURN jsonb_build_object(
        'status', 'already_recorded',
        'expense_id', v_expense_id
      );
    END IF;
  END IF;

  INSERT INTO public.expenses (
    tenant_id,
    branch_id,
    category,
    amount,
    subtotal,
    vat_breakdown,
    vat_amount,
    payment_method,
    paid_at,
    expense_date,
    note,
    created_by
  ) VALUES (
    v_tenant_id,
    p_branch_id,
    'bank_deposit',
    v_transaction.amount,
    v_transaction.amount,
    jsonb_build_array(jsonb_build_object(
      'vat_rate', 0,
      'taxable_amount', v_transaction.amount,
      'vat_amount', 0
    )),
    0,
    'cash',
    v_transaction.occurred_at,
    (v_transaction.occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
    'Nộp tiền mặt vào ngân hàng',
    v_actor
  )
  RETURNING id INTO v_expense_id;

  INSERT INTO public.bank_transaction_reconciliation_matches (
    tenant_id,
    bank_transaction_id,
    expense_id,
    matched_amount,
    created_by
  ) VALUES (
    v_tenant_id,
    v_transaction.id,
    v_expense_id,
    v_transaction.amount,
    v_actor
  );

  IF v_transaction.webhook_event_id IS NOT NULL THEN
    UPDATE public.webhook_events
    SET expense_id = v_expense_id
    WHERE id = v_transaction.webhook_event_id
      AND tenant_id = v_tenant_id;
  END IF;

  SET CONSTRAINTS
    public.trg_expenses_require_bank_deposit_evidence,
    public.trg_webhook_events_require_finance_evidence,
    public.trg_bank_reconciliation_matches_require_evidence
  IMMEDIATE;

  PERFORM public.log_audit(
    'bank_transaction.cash_deposit',
    'bank_transaction',
    v_transaction.id,
    NULL,
    jsonb_build_object(
      'expense_id', v_expense_id,
      'branch_id', p_branch_id,
      'matched_amount', v_transaction.amount
    )
  );

  RETURN jsonb_build_object(
    'status', 'recorded',
    'expense_id', v_expense_id,
    'bank_transaction_id', v_transaction.id
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_bank_transaction_cash_deposit(bigint, bigint)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_bank_transaction_cash_deposit(bigint, bigint)
  TO authenticated;

COMMENT ON FUNCTION public.record_bank_transaction_cash_deposit(bigint, bigint) IS
  'Owner-only classification of a trusted inbound bank movement as a cash deposit from a sales-branch cash book; it never changes bank balance.';

CREATE OR REPLACE FUNCTION public.record_sepay_cash_deposit_as_system(
  p_event_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_event public.webhook_events%ROWTYPE;
  v_amount numeric;
  v_expense_date date;
  v_expense_id bigint;
  v_branch_id bigint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_event
  FROM public.webhook_events
  WHERE id = p_event_id
    AND provider = 'sepay'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'webhook_event_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_event.signature_valid IS NOT TRUE THEN
    RAISE EXCEPTION 'webhook_event_signature_invalid' USING ERRCODE = '23514';
  END IF;

  IF v_event.payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'webhook_event_matches_payment' USING ERRCODE = '23514';
  END IF;

  IF lower(COALESCE(v_event.payload->>'transferType', '')) <> 'in' THEN
    RAISE EXCEPTION 'webhook_event_not_in' USING ERRCODE = '23514';
  END IF;

  SELECT CASE
    WHEN COALESCE(v_event.payload->>'transferAmount', '') ~ '^[0-9]+(\.[0-9]+)?$'
      THEN (v_event.payload->>'transferAmount')::numeric
    ELSE NULL
  END
  INTO v_amount;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'cash_deposit_amount_invalid' USING ERRCODE = '23514';
  END IF;

  v_branch_id := private.sepay_cash_deposit_branch_id(v_event.payload);
  PERFORM private.assert_sales_branch(v_event.tenant_id, v_branch_id);

  IF v_event.expense_id IS NOT NULL THEN
    SELECT e.id
    INTO v_expense_id
    FROM public.expenses e
    WHERE e.id = v_event.expense_id
      AND e.tenant_id = v_event.tenant_id
      AND e.category = 'bank_deposit'
      AND e.payment_method = 'cash'
      AND e.amount = v_amount;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'cash_deposit_link_invalid' USING ERRCODE = '23514';
    END IF;

    RETURN jsonb_build_object(
      'status', 'already_recorded',
      'expense_id', v_expense_id
    );
  END IF;

  SELECT CASE
    WHEN COALESCE(v_event.payload->>'transactionDate', '') ~ '^\d{4}-\d{2}-\d{2}'
      THEN substring(v_event.payload->>'transactionDate' FROM 1 FOR 10)::date
    ELSE (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  END
  INTO v_expense_date;

  INSERT INTO public.expenses (
    tenant_id,
    branch_id,
    category,
    amount,
    subtotal,
    vat_breakdown,
    vat_amount,
    payment_method,
    paid_at,
    expense_date,
    note
  )
  VALUES (
    v_event.tenant_id,
    v_branch_id,
    'bank_deposit',
    v_amount,
    v_amount,
    jsonb_build_array(jsonb_build_object(
      'vat_rate', 0,
      'taxable_amount', v_amount,
      'vat_amount', 0
    )),
    0,
    'cash',
    COALESCE(v_event.processed_at, v_event.created_at, now()),
    v_expense_date,
    COALESCE(NULLIF(v_event.payload->>'content', ''), 'Nộp tiền mặt vào ngân hàng')
  )
  RETURNING id
  INTO v_expense_id;

  UPDATE public.webhook_events
  SET expense_id = v_expense_id
  WHERE id = p_event_id
    AND tenant_id = v_event.tenant_id;

  RETURN jsonb_build_object(
    'status', 'recorded',
    'expense_id', v_expense_id
  );
END;
$fn$;

DO $supplier_payment_branch$
DECLARE
  v_definition text;
  v_before text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.record_supplier_payment_allocated(bigint,bigint,numeric,text,uuid,text,jsonb)'::regprocedure
  );
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    'p_allocations jsonb)',
    'p_allocations jsonb, p_branch_id bigint DEFAULT NULL)'
  );
  v_definition := replace(
    v_definition,
    $$OR v_existing.payment_method IS DISTINCT FROM p_payment_method
       OR v_existing.reference_note IS DISTINCT FROM$$,
    $$OR v_existing.payment_method IS DISTINCT FROM p_payment_method
       OR v_existing.branch_id IS DISTINCT FROM p_branch_id
       OR v_existing.reference_note IS DISTINCT FROM$$
  );
  v_definition := replace(
    v_definition,
    E'    created_by,\n    idempotency_key,\n    idempotency_result_status\n  )',
    E'    created_by,\n    idempotency_key,\n    idempotency_result_status,\n    branch_id\n  )'
  );
  v_definition := replace(
    v_definition,
    E'    p_idempotency_key,\n    ''partial''\n  )',
    E'    p_idempotency_key,\n    ''partial'',\n    p_branch_id\n  )'
  );

  IF v_definition = v_before
    OR position('p_branch_id' in v_definition) = 0
  THEN
    RAISE EXCEPTION 'record_supplier_payment_allocated branch patch did not match';
  END IF;

  EXECUTE v_definition;
  DROP FUNCTION public.record_supplier_payment_allocated(
    bigint, bigint, numeric, text, uuid, text, jsonb
  );

  REVOKE ALL ON FUNCTION public.record_supplier_payment_allocated(
    bigint, bigint, numeric, text, uuid, text, jsonb, bigint
  ) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.record_supplier_payment_allocated(
    bigint, bigint, numeric, text, uuid, text, jsonb, bigint
  ) TO authenticated, service_role;
END;
$supplier_payment_branch$;

DO $supplier_payment_wrapper$
DECLARE
  v_definition text;
  v_before text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.record_supplier_payment(bigint,bigint,numeric,text,uuid,text)'::regprocedure
  );
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    'p_reference_note text DEFAULT NULL::text)',
    'p_reference_note text DEFAULT NULL::text, p_branch_id bigint DEFAULT NULL)'
  );
  v_definition := replace(
    v_definition,
    $$    p_reference_note,
    v_allocations
  );$$,
    $$    p_reference_note,
    v_allocations,
    p_branch_id
  );$$
  );

  IF v_definition = v_before
    OR position('p_branch_id' in v_definition) = 0
  THEN
    RAISE EXCEPTION 'record_supplier_payment branch patch did not match';
  END IF;

  EXECUTE v_definition;
  DROP FUNCTION public.record_supplier_payment(
    bigint, bigint, numeric, text, uuid, text
  );

  REVOKE ALL ON FUNCTION public.record_supplier_payment(
    bigint, bigint, numeric, text, uuid, text, bigint
  ) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.record_supplier_payment(
    bigint, bigint, numeric, text, uuid, text, bigint
  ) TO authenticated, service_role;
END;
$supplier_payment_wrapper$;
