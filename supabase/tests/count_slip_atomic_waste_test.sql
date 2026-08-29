\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_definition text;
  v_manual_waste_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.approve_inventory_count_slip_with_waste(bigint,jsonb)'::regprocedure
  )
  INTO v_definition;
  SELECT pg_get_functiondef(
    'public.create_waste_entry(bigint,bigint,jsonb,text,jsonb,text)'::regprocedure
  )
  INTO v_manual_waste_definition;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'COUNT SLIP WASTE: atomic RPC is missing';
  END IF;
  IF v_definition NOT LIKE '%count_slip_waste_photo_required%' THEN
    RAISE EXCEPTION 'COUNT SLIP WASTE: shortage photos are not enforced';
  END IF;
  IF v_definition NOT LIKE '%line.counted_base_quantity%' THEN
    RAISE EXCEPTION 'COUNT SLIP WASTE: snapshot base quantity is not used';
  END IF;
  IF v_definition NOT LIKE '%countSlipId%' THEN
    RAISE EXCEPTION 'COUNT SLIP WASTE: legacy retry linkage is not covered';
  END IF;

  IF v_definition !~
     'private\.execute_create_waste_entry(.|\n)*v_approval := public\.approve_inventory_count_slip' THEN
    RAISE EXCEPTION
      'COUNT SLIP WASTE: writeoff and approval are not atomically ordered';
  END IF;
  IF v_manual_waste_definition NOT LIKE '%waste_photo_required%'
     OR v_manual_waste_definition NOT LIKE
        '%coalesce(p_source_type, ''manual'') = ''manual''%' THEN
    RAISE EXCEPTION
      'COUNT SLIP WASTE: manual writeoff photo boundary is missing or over-broad';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stock_issues'::regclass
      AND conname = 'stock_issues_source_type_check'
      AND pg_get_constraintdef(oid) LIKE '%count_slip_auto_waste%'
  ) THEN
    RAISE EXCEPTION 'COUNT SLIP WASTE: stock_issues_source_type_check does not allow count_slip_auto_waste';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stock_issue_items'::regclass
      AND conname = 'stock_issue_items_reason_code_check'
      AND pg_get_constraintdef(oid) LIKE '%discrepancy%'
  ) THEN
    RAISE EXCEPTION 'COUNT SLIP WASTE: stock_issue_items_reason_code_check does not allow discrepancy';
  END IF;

  IF v_definition NOT LIKE '%approval_status = ''approved''%' THEN
    RAISE EXCEPTION 'COUNT SLIP WASTE: count slip auto-waste is not automatically approved';
  END IF;
END;
$$;

ROLLBACK;
