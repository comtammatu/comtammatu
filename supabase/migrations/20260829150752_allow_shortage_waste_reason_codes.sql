-- Migration: allow_shortage_waste_reason_codes
-- Expand stock_issue_items and stocktake_lines reason_code check constraints
-- to allow count slip shortage reason codes (discrepancy, loss, damaged).
-- Align stock_issue_items_compute_waste_tier() so non-manual automated writeoffs
-- are not blocked by the manual tier-1 photo check.

ALTER TABLE public.stock_issue_items
  DROP CONSTRAINT IF EXISTS stock_issue_items_reason_code_check;

ALTER TABLE public.stock_issue_items
  ADD CONSTRAINT stock_issue_items_reason_code_check CHECK (
    reason_code IS NULL OR reason_code = ANY (ARRAY[
      'spoiled'::text,
      'expired'::text,
      'dropped'::text,
      'overcook'::text,
      'burned'::text,
      'contaminated'::text,
      'quality_fail'::text,
      'found_missing'::text,
      'theft_suspected'::text,
      'customer_return'::text,
      'kds_cancel_mid_cook'::text,
      'kds_cancel_after_cook'::text,
      'discrepancy'::text,
      'loss'::text,
      'damaged'::text,
      'other'::text
    ])
  );

ALTER TABLE public.stocktake_lines
  DROP CONSTRAINT IF EXISTS stocktake_lines_reason_code_check;

ALTER TABLE public.stocktake_lines
  ADD CONSTRAINT stocktake_lines_reason_code_check CHECK (
    reason_code IS NULL OR reason_code = ANY (ARRAY[
      'spoiled'::text,
      'expired'::text,
      'dropped'::text,
      'overcook'::text,
      'burned'::text,
      'contaminated'::text,
      'quality_fail'::text,
      'found_missing'::text,
      'theft_suspected'::text,
      'customer_return'::text,
      'kds_cancel_mid_cook'::text,
      'kds_cancel_after_cook'::text,
      'discrepancy'::text,
      'loss'::text,
      'damaged'::text,
      'other'::text
    ])
  );

COMMENT ON COLUMN public.stock_issue_items.reason_code IS
  'Causal reason code: physical waste (spoiled, expired, dropped, damaged, contaminated, quality_fail), operational cancel (overcook, burned, customer_return, kds_cancel_*), count/stocktake variance (discrepancy, loss, found_missing, theft_suspected), or other.';

COMMENT ON COLUMN public.stocktake_lines.reason_code IS
  'Constrained English variance reason shared with waste reason_code; free-text note stays in variance_reason.';

CREATE OR REPLACE FUNCTION public.stock_issue_items_compute_waste_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_parent record;
  v_item_value numeric(15,2);
  v_stock record;
  v_quantity_ratio numeric(5,4);
  v_rolling_sum numeric(15,2);
  v_shift_sum numeric(15,2);
  v_branch_cap record;
  v_branch_today numeric(15,2);
  v_photo boolean := FALSE;
  v_approve boolean := FALSE;
  v_tier smallint := 0;
  v_quantity_base numeric(15,3);
  v_risky_reasons constant text[] := ARRAY[
    'dropped',
    'quality_fail',
    'contaminated',
    'found_missing',
    'theft_suspected'
  ];
  v_always_tier2 constant text[] := ARRAY[
    'found_missing',
    'theft_suspected'
  ];
  v_tier1_threshold constant numeric := 150000;
  v_tier2_threshold constant numeric := 500000;
  v_shift_cap constant numeric := 1500000;
BEGIN
  SELECT
    issue.tenant_id,
    issue.branch_id,
    issue.source_location_id,
    issue.created_by,
    issue.issue_type,
    issue.source_type,
    issue.shift_key,
    issue.issued_at
  INTO v_parent
  FROM public.stock_issues AS issue
  WHERE issue.id = NEW.issue_id;

  IF NOT FOUND OR v_parent.issue_type <> 'writeoff' THEN
    RETURN NEW;
  END IF;

  v_quantity_base := public.inv_to_base(
    NEW.ingredient_id,
    NEW.entry_unit_id,
    NEW.quantity
  );

  IF NEW.unit_cost IS NOT NULL AND NEW.unit_cost > 0 THEN
    v_item_value := v_quantity_base * NEW.unit_cost;
  ELSE
    SELECT stock.current_quantity, stock.avg_unit_cost
    INTO v_stock
    FROM public.stock_levels AS stock
    WHERE stock.branch_id = v_parent.branch_id
      AND stock.ingredient_id = NEW.ingredient_id
      AND (
        v_parent.source_location_id IS NULL
        OR stock.location_id = v_parent.source_location_id
      )
    ORDER BY stock.location_id
    LIMIT 1;
    v_item_value := coalesce(
      v_quantity_base * v_stock.avg_unit_cost,
      0
    );
  END IF;

  SELECT stock.current_quantity
  INTO v_stock
  FROM public.stock_levels AS stock
  WHERE stock.branch_id = v_parent.branch_id
    AND stock.ingredient_id = NEW.ingredient_id
    AND (
      v_parent.source_location_id IS NULL
      OR stock.location_id = v_parent.source_location_id
    )
    ORDER BY stock.location_id
    LIMIT 1;

  IF v_stock.current_quantity IS NOT NULL
     AND v_stock.current_quantity > 0 THEN
    v_quantity_ratio := least(
      v_quantity_base / v_stock.current_quantity,
      9.9999
    )::numeric(5,4);
  ELSE
    v_quantity_ratio := NULL;
  END IF;

  SELECT coalesce(sum(
    public.inv_to_base(
      item.ingredient_id,
      item.entry_unit_id,
      item.quantity
    ) * item.unit_cost
  ), 0)
  INTO v_rolling_sum
  FROM public.stock_issue_items AS item
  JOIN public.stock_issues AS issue
    ON issue.id = item.issue_id
  WHERE issue.issue_type = 'writeoff'
    AND issue.created_by = v_parent.created_by
    AND issue.branch_id = v_parent.branch_id
    AND item.ingredient_id = NEW.ingredient_id
    AND issue.created_at > now() - interval '15 minutes'
    AND item.id <> coalesce(NEW.id, -1);

  IF v_parent.shift_key IS NOT NULL THEN
    SELECT coalesce(sum(
      public.inv_to_base(
        item.ingredient_id,
        item.entry_unit_id,
        item.quantity
      ) * item.unit_cost
    ), 0)
    INTO v_shift_sum
    FROM public.stock_issue_items AS item
    JOIN public.stock_issues AS issue
      ON issue.id = item.issue_id
    WHERE issue.issue_type = 'writeoff'
      AND issue.created_by = v_parent.created_by
      AND issue.branch_id = v_parent.branch_id
      AND issue.shift_key = v_parent.shift_key
      AND item.id <> coalesce(NEW.id, -1);
  ELSE
    v_shift_sum := 0;
  END IF;

  SELECT cap.cap_vnd, cap.avg_revenue_7d
  INTO v_branch_cap
  FROM public.branch_daily_waste_cap AS cap
  WHERE cap.branch_id = v_parent.branch_id;

  SELECT coalesce(sum(
    public.inv_to_base(
      item.ingredient_id,
      item.entry_unit_id,
      item.quantity
    ) * item.unit_cost
  ), 0)
  INTO v_branch_today
  FROM public.stock_issue_items AS item
  JOIN public.stock_issues AS issue
    ON issue.id = item.issue_id
  WHERE issue.issue_type = 'writeoff'
    AND issue.branch_id = v_parent.branch_id
    AND issue.issued_at >= date_trunc(
      'day',
      now() AT TIME ZONE coalesce(
        (
          SELECT branch.timezone
          FROM public.branches AS branch
          WHERE branch.id = v_parent.branch_id
        ),
        'Asia/Ho_Chi_Minh'
      )
    )
    AND item.id <> coalesce(NEW.id, -1);

  v_photo := v_item_value >= v_tier1_threshold
    OR (
      v_quantity_ratio IS NOT NULL
      AND v_quantity_ratio >= 0.5
    )
    OR (
      NEW.reason_code IS NOT NULL
      AND NEW.reason_code = ANY(v_risky_reasons)
    )
    OR v_rolling_sum + v_item_value >= v_tier1_threshold;

  v_approve := v_item_value >= v_tier2_threshold
    OR v_shift_sum + v_item_value >= v_shift_cap
    OR (
      NEW.reason_code IS NOT NULL
      AND NEW.reason_code = ANY(v_always_tier2)
    )
    OR (
      v_branch_cap.cap_vnd IS NOT NULL
      AND v_branch_today + v_item_value > v_branch_cap.cap_vnd
    );

  IF v_approve THEN
    v_tier := 2;
  ELSIF v_photo THEN
    v_tier := 1;
  END IF;

  NEW.waste_tier := v_tier;
  NEW.photo_required := v_photo;
  NEW.approval_required := v_approve;
  NEW.qty_ratio := v_quantity_ratio;
  NEW.rolling_15min_sum := v_rolling_sum;

  IF v_photo
     AND coalesce(v_parent.source_type, 'manual') = 'manual'
     AND coalesce(array_length(NEW.photo_urls, 1), 0) = 0
     AND NOT public.has_permission(
       v_parent.branch_id,
       'inventory:waste_bypass_photo'
     ) THEN
    RAISE EXCEPTION
      'waste photo required for tier >= 1 (reason=%, value=%, qty_ratio=%)',
      NEW.reason_code,
      v_item_value,
      v_quantity_ratio
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;
