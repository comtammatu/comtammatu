-- Shared enforce_cash_sales_branch reads NEW.payment_method, which does not
-- exist on finance_fund_entries. Keep that function on expenses/supplier
-- payments; fund rows use a dedicated trigger.

CREATE OR REPLACE FUNCTION private.enforce_fund_entry_cash_sales_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
BEGIN
  IF NEW.branch_id IS NOT NULL THEN
    PERFORM private.assert_sales_branch(NEW.tenant_id, NEW.branch_id);
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION private.enforce_fund_entry_cash_sales_branch()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS finance_fund_entries_enforce_cash_sales_branch
  ON public.finance_fund_entries;
CREATE TRIGGER finance_fund_entries_enforce_cash_sales_branch
BEFORE INSERT OR UPDATE OF branch_id
ON public.finance_fund_entries
FOR EACH ROW
EXECUTE FUNCTION private.enforce_fund_entry_cash_sales_branch();

-- Stamp the Nguyễn Hữu Thọ cash book at 00:00 Vietnam time on 2026-08-14.
-- Current cash equals the restaurant drawer that was previously mixed into
-- the company book: opening + movements after that instant, with a signed
-- adjustment only when pre-book cash net is negative (openings cannot be).

DO $cutover$
DECLARE
  v_company public.finance_fund_entries%ROWTYPE;
  v_tenant_id bigint;
  v_nht_id bigint;
  v_nht_count integer;
  v_open_at timestamptz :=
    timezone('Asia/Ho_Chi_Minh', timestamp '2026-08-14 00:00:00');
  v_coll_current numeric;
  v_coll_since numeric;
  v_ref_current numeric;
  v_ref_since numeric;
  v_exp_current numeric;
  v_exp_since numeric;
  v_sp_current numeric;
  v_sp_since numeric;
  v_current numeric;
  v_since numeric;
  v_pre numeric;
  v_opening_cash numeric;
  v_adjustment numeric;
  v_opening_key uuid := 'c08f1408-2026-4a01-8c01-000000000001';
  v_adjustment_key uuid := 'c08f1408-2026-4a01-8c02-000000000001';
BEGIN
  FOR v_company IN
    SELECT *
    FROM public.finance_fund_entries entry
    WHERE entry.entry_type = 'opening'
      AND entry.branch_id IS NULL
  LOOP
    v_tenant_id := v_company.tenant_id;

    SELECT count(*), min(branch.id)
    INTO v_nht_count, v_nht_id
    FROM public.branches branch
    WHERE branch.tenant_id = v_tenant_id
      AND branch.branch_kind = 'branch'
      AND COALESCE(branch.is_active, true)
      AND branch.name ILIKE '%Nguyễn Hữu Thọ%';

    IF v_nht_count > 1 THEN
      RAISE EXCEPTION 'branch_cash_cutover_nht_not_unique'
        USING ERRCODE = 'P0002';
    END IF;

    IF v_nht_count IS DISTINCT FROM 1 OR v_nht_id IS NULL THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.finance_fund_entries entry
      WHERE entry.tenant_id = v_tenant_id
        AND entry.entry_type = 'opening'
        AND entry.branch_id = v_nht_id
    ) THEN
      CONTINUE;
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('finance_funds:' || v_tenant_id::text, 0)
    );

    SELECT
      COALESCE(
        sum(payment.amount) FILTER (
          WHERE payment.paid_at >= v_company.effective_at
        ),
        0
      ),
      COALESCE(
        sum(payment.amount) FILTER (
          WHERE payment.paid_at >= v_open_at
        ),
        0
      )
    INTO v_coll_current, v_coll_since
    FROM public.payments payment
    WHERE payment.tenant_id = v_tenant_id
      AND payment.method = 'cash'
      AND payment.status IN ('completed', 'refunded')
      AND payment.branch_id = v_nht_id;

    SELECT
      COALESCE(
        sum(refund.amount) FILTER (
          WHERE refund.approved_at >= v_company.effective_at
        ),
        0
      ),
      COALESCE(
        sum(refund.amount) FILTER (
          WHERE refund.approved_at >= v_open_at
        ),
        0
      )
    INTO v_ref_current, v_ref_since
    FROM public.refunds refund
    WHERE refund.tenant_id = v_tenant_id
      AND refund.status = 'approved'
      AND refund.payout_method = 'cash'
      AND refund.branch_id = v_nht_id;

    SELECT
      COALESCE(
        sum(expense.amount) FILTER (
          WHERE expense.paid_at >= v_company.effective_at
        ),
        0
      ),
      COALESCE(
        sum(expense.amount) FILTER (
          WHERE expense.paid_at >= v_open_at
        ),
        0
      )
    INTO v_exp_current, v_exp_since
    FROM public.expenses expense
    WHERE expense.tenant_id = v_tenant_id
      AND expense.payment_method = 'cash'
      AND expense.branch_id = v_nht_id;

    SELECT
      COALESCE(
        sum(payment.amount) FILTER (
          WHERE payment.payment_date >= v_company.effective_at
        ),
        0
      ),
      COALESCE(
        sum(payment.amount) FILTER (
          WHERE payment.payment_date >= v_open_at
        ),
        0
      )
    INTO v_sp_current, v_sp_since
    FROM public.supplier_payments payment
    WHERE payment.tenant_id = v_tenant_id
      AND payment.payment_method = 'cash'
      AND payment.branch_id = v_nht_id;

    v_current :=
      v_company.cash_delta
      + COALESCE(v_coll_current, 0)
      - COALESCE(v_ref_current, 0)
      - COALESCE(v_exp_current, 0)
      - COALESCE(v_sp_current, 0);
    v_since :=
      COALESCE(v_coll_since, 0)
      - COALESCE(v_ref_since, 0)
      - COALESCE(v_exp_since, 0)
      - COALESCE(v_sp_since, 0);
    v_pre := COALESCE(v_current, 0) - COALESCE(v_since, 0);
    v_opening_cash := GREATEST(v_pre, 0::numeric);
    v_adjustment := v_pre - v_opening_cash;

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
      v_opening_cash,
      0,
      v_open_at,
      'Mở sổ tiền mặt Nguyễn Hữu Thọ',
      v_company.created_by,
      v_opening_key,
      statement_timestamp()
    );

    IF v_adjustment <> 0 THEN
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
        'adjustment',
        v_adjustment,
        0,
        v_open_at,
        'Khớp quỹ quán trước ngày mở sổ chi nhánh',
        v_company.created_by,
        v_adjustment_key,
        statement_timestamp()
      );
    END IF;
  END LOOP;
END;
$cutover$;
