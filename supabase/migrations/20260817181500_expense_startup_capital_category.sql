-- Startup capital and deposits are money out, not period operating expense.

ALTER TABLE public.expenses
  DROP CONSTRAINT expenses_category_check,
  ADD CONSTRAINT expenses_category_check CHECK (
    category = ANY (ARRAY[
      'rent',
      'utilities',
      'gas_fuel',
      'salary',
      'cogs_manual',
      'supplies',
      'repair',
      'marketing',
      'fees_tax',
      'hospitality',
      'capital',
      'deposit',
      'bank_deposit',
      'other'
    ]::text[])
  );

DO $startup_capital_expense_category$
DECLARE
  v_before text;
  v_definition text;
  v_proc regprocedure;
BEGIN
  FOREACH v_proc IN ARRAY ARRAY[
    'public.cancel_expense(bigint)'::regprocedure,
    'public.create_expense_transfer_intent(bigint,date,text,jsonb,text,text,text)'::regprocedure,
    'public.guard_finance_expense_evidence_mutation()'::regprocedure,
    'public.reconcile_bank_transaction_targets(bigint,text,bigint[])'::regprocedure,
    'public.transition_expense_payment(bigint,text)'::regprocedure,
    'public.update_operating_expense(bigint,bigint,date,text,jsonb,text,text)'::regprocedure
  ]
  LOOP
    SELECT pg_catalog.pg_get_functiondef(v_proc) INTO v_definition;
    v_before := v_definition;
    v_definition := regexp_replace(
      v_definition,
      $$('hospitality',)([[:space:]]*)'other'$$,
      $$\1\2'capital',\2'deposit',\2'other'$$,
      'g'
    );
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'startup_capital_expense_category_boundary_not_found'
        USING DETAIL = v_proc::text;
    END IF;
    EXECUTE v_definition;
  END LOOP;
END;
$startup_capital_expense_category$;

-- Category-only backfill. Bank-matched rows raise reconciled_expense_immutable
-- from trg_expenses_guard_finance_evidence; replica role skips user triggers
-- for this statement. SET LOCAL reverts at transaction end.
SET LOCAL session_replication_role = replica;

UPDATE public.expenses AS expense
SET category = classified.category
FROM (
  VALUES
    (20, 'deposit'::text, '%cọc 3 tháng%'),
    (67, 'deposit', '%Dien Luc Tan Thuan%'),
    (1, 'capital', '%CREDENT%'),
    (3, 'capital', '%KIẾN CONS%'),
    (4, 'capital', '%KIẾN CONS%'),
    (5, 'capital', '%CNV%'),
    (7, 'capital', '%QUẢNG CÁO NHÂN%'),
    (10, 'capital', '%BẾP VIỆT%'),
    (11, 'capital', '%NEWTECH%'),
    (12, 'capital', '%AIRCOOL%'),
    (15, 'capital', '%Á CHÂU%'),
    (17, 'capital', '%KIẾN CONS%'),
    (19, 'capital', '%Sài Gon Hoa%'),
    (21, 'capital', '%dien may xanh%'),
    (22, 'capital', '%dien may xanh%'),
    (25, 'capital', '%Home Wood%'),
    (26, 'capital', '%CREDENT%'),
    (28, 'capital', '%Van Trắng%'),
    (29, 'capital', '%Van Trắng%'),
    (30, 'capital', '%máy thái bì%'),
    (31, 'capital', '%Quang Nhung%'),
    (32, 'capital', '%TAGA%'),
    (33, 'capital', '%TAGA%'),
    (35, 'capital', '%bảo hiểm xe Van%'),
    (38, 'capital', '%Viet Nam Moving%'),
    (39, 'capital', '%Kim Quoc Tien%'),
    (40, 'capital', '%Go Mot Tam%'),
    (41, 'capital', '%kien cons%'),
    (42, 'capital', '%sunvina%'),
    (43, 'capital', '%cân%'),
    (44, 'capital', '%CNV%'),
    (46, 'capital', '%Máy Hồng Phát%'),
    (47, 'capital', '%dien máy xanh%'),
    (48, 'capital', '%dien may xanh%'),
    (49, 'capital', '%in quảng cáo%'),
    (50, 'capital', '%ĐIỆN MÁY XANH%'),
    (52, 'capital', '%Phương Anh Hùng%'),
    (53, 'capital', '%Phương Anh Hùng%'),
    (54, 'capital', '%IDC Dong Phuong%'),
    (55, 'capital', '%QC Nhân%'),
    (57, 'capital', '%Cao Phong%'),
    (58, 'capital', '%Xpos%'),
    (59, 'capital', '%Xpos%'),
    (60, 'capital', '%oto Hai Trieu%'),
    (61, 'capital', '%Dien may xanh%'),
    (62, 'capital', '%in an Q7%'),
    (63, 'capital', '%QC Nhân%'),
    (64, 'capital', '%Huy Linh%'),
    (65, 'capital', '%IDC DOng Phuong%'),
    (66, 'capital', '%In An Q7%'),
    (68, 'capital', '%Á Châu%'),
    (70, 'capital', '%Quang Nhung%')
) AS classified (id, category, note_match)
WHERE expense.id = classified.id
  AND expense.note ILIKE classified.note_match
  AND expense.category IN ('other', 'rent', 'utilities', 'repair');
