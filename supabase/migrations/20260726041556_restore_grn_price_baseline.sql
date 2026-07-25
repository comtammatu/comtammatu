CREATE OR REPLACE FUNCTION private.compute_grn_price_baseline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_grn record;
  v_entry_factor numeric;
  v_baseline_cost numeric;
  v_sample_n integer;
  v_variance numeric;
  v_abs_variance numeric;
BEGIN
  SELECT note.tenant_id, note.supplier_id, note.status
  INTO v_grn
  FROM public.goods_received_notes AS note
  WHERE note.id = NEW.grn_id
    AND note.tenant_id = NEW.tenant_id;

  IF NOT FOUND OR v_grn.status <> 'draft' THEN
    RETURN NEW;
  END IF;

  IF NEW.unit_cost IS NULL OR NEW.unit_cost <= 0 THEN
    NEW.baseline_source := 'none';
    NEW.baseline_sample_n := 0;
    NEW.baseline_variance_pct := NULL;
    NEW.variance_tier := NULL;
    NEW.is_hard_blocked := false;
    RETURN NEW;
  END IF;

  IF NEW.entry_unit_id IS NULL THEN
    v_entry_factor := 1;
  ELSE
    SELECT ingredient_unit.to_base_factor
    INTO v_entry_factor
    FROM public.ingredient_units AS ingredient_unit
    WHERE ingredient_unit.tenant_id = NEW.tenant_id
      AND ingredient_unit.ingredient_id = NEW.ingredient_id
      AND ingredient_unit.unit_id = NEW.entry_unit_id
      AND ingredient_unit.is_active;

    IF v_entry_factor IS NULL OR v_entry_factor <= 0 THEN
      RAISE EXCEPTION 'grn_baseline_entry_unit_invalid'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  SELECT
    avg(history_item.unit_cost / COALESCE(history_unit.to_base_factor, 1)),
    count(*)::integer
  INTO v_baseline_cost, v_sample_n
  FROM public.grn_items AS history_item
  JOIN public.goods_received_notes AS history_note
    ON history_note.id = history_item.grn_id
   AND history_note.tenant_id = history_item.tenant_id
  LEFT JOIN public.ingredient_units AS history_unit
    ON history_unit.tenant_id = history_item.tenant_id
   AND history_unit.ingredient_id = history_item.ingredient_id
   AND history_unit.unit_id = history_item.entry_unit_id
   AND history_unit.is_active
  WHERE history_note.tenant_id = NEW.tenant_id
    AND history_note.supplier_id = v_grn.supplier_id
    AND history_note.status = 'confirmed'
    AND history_note.received_date >= CURRENT_DATE - INTERVAL '30 days'
    AND history_item.ingredient_id = NEW.ingredient_id
    AND history_item.unit_cost > 0
    AND history_item.received_quantity
          - COALESCE(history_item.rejected_quantity, 0) > 0
    AND (
      history_item.entry_unit_id IS NULL
      OR history_unit.id IS NOT NULL
    );

  NEW.baseline_sample_n := COALESCE(v_sample_n, 0);
  NEW.is_hard_blocked := false;

  IF v_sample_n < 3 OR v_baseline_cost IS NULL OR v_baseline_cost <= 0 THEN
    NEW.baseline_source := 'none';
    NEW.baseline_variance_pct := NULL;
    NEW.variance_tier := NULL;
    RETURN NEW;
  END IF;

  v_variance := ((NEW.unit_cost / v_entry_factor) - v_baseline_cost)
    / v_baseline_cost * 100;
  v_abs_variance := abs(v_variance);

  NEW.baseline_source := 'same_supplier';
  NEW.baseline_variance_pct := round(v_variance, 3);
  NEW.variance_tier := CASE
    WHEN v_abs_variance <= 15 THEN 0
    WHEN v_abs_variance <= 30 THEN 1
    WHEN v_abs_variance < 100 THEN 2
    ELSE 3
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.compute_grn_price_baseline()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_grn_items_compute_price_baseline
BEFORE INSERT OR UPDATE OF grn_id, ingredient_id, entry_unit_id, unit_cost
ON public.grn_items
FOR EACH ROW
EXECUTE FUNCTION private.compute_grn_price_baseline();

CREATE OR REPLACE FUNCTION private.validate_grn_qc_before_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_error text;
BEGIN
  SELECT invalid.error_code
  INTO v_error
  FROM public.grn_items AS item
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN item.quality_status = 'accepted'
        AND COALESCE(item.rejected_quantity, 0) <> 0
        THEN 'grn_qc_quantity_mismatch'
      WHEN item.quality_status = 'partial'
        AND NOT (
          item.received_quantity > 0
          AND item.rejected_quantity > 0
          AND item.rejected_quantity < item.received_quantity
        )
        THEN 'grn_qc_quantity_mismatch'
      WHEN item.quality_status = 'rejected'
        AND NOT (
          item.received_quantity > 0
          AND item.rejected_quantity = item.received_quantity
        )
        THEN 'grn_qc_quantity_mismatch'
      WHEN item.quality_status IN ('partial', 'rejected')
        AND NULLIF(btrim(item.rejection_reason), '') IS NULL
        THEN 'grn_qc_reason_required'
      WHEN item.quality_status IN ('partial', 'rejected')
        AND NULLIF(btrim(item.rejected_photo_url), '') IS NULL
        THEN 'grn_qc_photo_required'
      WHEN (
          item.requires_review
          OR abs(COALESCE(item.baseline_variance_pct, 0)) > 15
        )
        AND NULLIF(btrim(item.price_override_note), '') IS NULL
        THEN 'grn_qc_price_reason_required'
      WHEN (
          item.requires_review
          OR abs(COALESCE(item.baseline_variance_pct, 0)) > 15
        )
        AND NULLIF(btrim(item.price_override_photo_url), '') IS NULL
        THEN 'grn_qc_price_photo_required'
    END AS error_code
  ) AS invalid
  WHERE item.grn_id = NEW.id
    AND item.tenant_id = NEW.tenant_id
    AND invalid.error_code IS NOT NULL
  ORDER BY item.id
  LIMIT 1;

  IF v_error IS NOT NULL THEN
    RAISE EXCEPTION '%', v_error
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_grn_qc_before_confirm()
  FROM PUBLIC, anon, authenticated, service_role;

UPDATE public.grn_items AS item
SET unit_cost = item.unit_cost
FROM public.goods_received_notes AS note
WHERE note.id = item.grn_id
  AND note.tenant_id = item.tenant_id
  AND note.status = 'draft';
