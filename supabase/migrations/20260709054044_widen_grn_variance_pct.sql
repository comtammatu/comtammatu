BEGIN;

SET search_path TO '';

ALTER TABLE public.grn_items
  ALTER COLUMN price_variance_pct TYPE numeric,
  ALTER COLUMN baseline_variance_pct TYPE numeric;

CREATE OR REPLACE FUNCTION public.grn_items_compute_variance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_grn RECORD;
  v_baseline RECORD;
  v_signed NUMERIC;
  v_abs_pct NUMERIC;
  v_tier SMALLINT;
BEGIN
  IF NEW.unit_cost IS NULL OR NEW.unit_cost <= 0 THEN
    NEW.variance_tier := NULL;
    NEW.baseline_source := NULL;
    NEW.baseline_sample_n := NULL;
    NEW.baseline_variance_pct := NULL;
    NEW.is_hard_blocked := false;
    RETURN NEW;
  END IF;

  SELECT tenant_id, supplier_id
  INTO v_grn
  FROM public.goods_received_notes
  WHERE id = NEW.grn_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT avg_30d, sample_n, baseline_source
  INTO v_baseline
  FROM public._compute_grn_price_baseline(
    v_grn.tenant_id,
    v_grn.supplier_id,
    NEW.ingredient_id,
    NEW.unit
  );

  NEW.baseline_source := v_baseline.baseline_source;
  NEW.baseline_sample_n := v_baseline.sample_n;

  IF v_baseline.avg_30d IS NULL THEN
    NEW.variance_tier := NULL;
    NEW.baseline_variance_pct := NULL;
    NEW.is_hard_blocked := false;
    RETURN NEW;
  END IF;

  v_signed := (NEW.unit_cost - v_baseline.avg_30d) / v_baseline.avg_30d;
  v_abs_pct := ABS(v_signed);
  NEW.baseline_variance_pct := ROUND(v_signed * 100, 3);

  IF      v_abs_pct < 0.15 THEN v_tier := 0;
  ELSIF   v_abs_pct < 0.30 THEN v_tier := 1;
  ELSIF   v_abs_pct < 1.00 THEN v_tier := 2;
  ELSE                          v_tier := 3;
  END IF;

  NEW.variance_tier := v_tier;
  NEW.is_hard_blocked := (v_tier = 3) AND NOT EXISTS (
    SELECT 1
    FROM public.grn_hardblock_overrides
    WHERE grn_item_id = NEW.id
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.grn_items_compute_variance() FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.grn_items_compute_variance() TO service_role;

COMMIT;
