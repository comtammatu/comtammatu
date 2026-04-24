-- =============================================================
-- S2-a Patch — separate baseline_variance_pct from existing
-- generated price_variance_pct (which measures GRN↔PO, not
-- GRN↔baseline). The Q3 tier logic is about drift from the
-- 30-day baseline; overloading the PO column would silently
-- corrupt GRN matching. Keep the generated column intact.
--
-- Spec: docs/plan/inventory-redesign.md §Q3
-- =============================================================

ALTER TABLE public.grn_items
  ADD COLUMN IF NOT EXISTS baseline_variance_pct NUMERIC(7,3);

COMMENT ON COLUMN public.grn_items.baseline_variance_pct IS
  'Signed variance of unit_cost vs 30-day baseline from mv_grn_price_baseline, in percent. Populated by grn_items_compute_variance() trigger. Independent from price_variance_pct (which is GRN↔PO). NULL when baseline unavailable/paused.';

-- Redefine trigger to write baseline_variance_pct instead of price_variance_pct
CREATE OR REPLACE FUNCTION public.grn_items_compute_variance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_grn      RECORD;
  v_baseline RECORD;
  v_signed   NUMERIC;
  v_abs_pct  NUMERIC;
  v_tier     SMALLINT;
BEGIN
  IF NEW.unit_cost IS NULL OR NEW.unit_cost <= 0 THEN
    NEW.variance_tier         := NULL;
    NEW.baseline_source       := NULL;
    NEW.baseline_sample_n     := NULL;
    NEW.baseline_variance_pct := NULL;
    NEW.is_hard_blocked       := false;
    RETURN NEW;
  END IF;

  SELECT tenant_id, supplier_id INTO v_grn
  FROM public.goods_received_notes
  WHERE id = NEW.grn_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT avg_30d, sample_n, baseline_source INTO v_baseline
    FROM public._compute_grn_price_baseline(v_grn.tenant_id, v_grn.supplier_id, NEW.ingredient_id, NEW.unit);

  NEW.baseline_source   := v_baseline.baseline_source;
  NEW.baseline_sample_n := v_baseline.sample_n;

  IF v_baseline.avg_30d IS NULL THEN
    NEW.variance_tier         := NULL;
    NEW.baseline_variance_pct := NULL;
    NEW.is_hard_blocked       := false;
    RETURN NEW;
  END IF;

  v_signed  := (NEW.unit_cost - v_baseline.avg_30d) / v_baseline.avg_30d;
  v_abs_pct := ABS(v_signed);
  NEW.baseline_variance_pct := (v_signed * 100)::NUMERIC(7,3);

  IF      v_abs_pct < 0.15 THEN v_tier := 0;
  ELSIF   v_abs_pct < 0.30 THEN v_tier := 1;
  ELSIF   v_abs_pct < 1.00 THEN v_tier := 2;
  ELSE                          v_tier := 3;
  END IF;

  NEW.variance_tier   := v_tier;
  NEW.is_hard_blocked := (v_tier = 3)
                         AND NOT EXISTS (SELECT 1 FROM public.grn_hardblock_overrides WHERE grn_item_id = NEW.id);
  RETURN NEW;
END;
$function$;

-- Redefine override RPC to write baseline_variance_pct (not generated column)
CREATE OR REPLACE FUNCTION public.override_grn_hardblock(
  p_grn_item_id BIGINT, p_evidence_url TEXT, p_reason_code TEXT, p_note TEXT
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       UUID := auth.uid();
  v_item      RECORD;
  v_baseline  RECORD;
  v_recent    INT;
  v_ov_id     BIGINT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  SELECT gi.*, grn.branch_id, grn.tenant_id AS grn_tenant, grn.supplier_id AS grn_supplier
    INTO v_item
  FROM public.grn_items gi
  JOIN public.goods_received_notes grn ON grn.id = gi.grn_id
  WHERE gi.id = p_grn_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'grn_item not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.has_permission(v_item.branch_id, 'inventory:grn_hardblock_override') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_item.variance_tier IS NULL OR v_item.variance_tier < 3 THEN
    RAISE EXCEPTION 'grn_item is not hard-blocked' USING ERRCODE = '22023';
  END IF;
  IF length(COALESCE(p_note, '')) < 50 THEN RAISE EXCEPTION 'note must be at least 50 characters' USING ERRCODE = '22023'; END IF;
  IF p_evidence_url IS NULL OR length(p_evidence_url) = 0 THEN RAISE EXCEPTION 'evidence_url required' USING ERRCODE = '22023'; END IF;

  SELECT COUNT(*) INTO v_recent FROM public.grn_hardblock_overrides
    WHERE overridden_by = v_uid AND overridden_at > now() - INTERVAL '7 days';
  IF v_recent >= 2 THEN RAISE EXCEPTION 'hardblock override rate-limit (2/week) exceeded — escalate to admin' USING ERRCODE = '54000'; END IF;

  SELECT avg_30d INTO v_baseline
    FROM public._compute_grn_price_baseline(v_item.grn_tenant, v_item.grn_supplier, v_item.ingredient_id, v_item.unit);

  INSERT INTO public.grn_hardblock_overrides (
    tenant_id, branch_id, grn_item_id, supplier_id, ingredient_id, uom,
    submitted_price, baseline_avg_30d, variance_pct, evidence_url, reason_code, note, overridden_by
  ) VALUES (
    v_item.grn_tenant, v_item.branch_id, p_grn_item_id, v_item.grn_supplier, v_item.ingredient_id, v_item.unit,
    v_item.unit_cost, v_baseline.avg_30d, v_item.baseline_variance_pct,
    p_evidence_url, p_reason_code, p_note, v_uid
  ) RETURNING id INTO v_ov_id;

  INSERT INTO public.grn_baseline_pause (
    tenant_id, supplier_id, ingredient_id, uom, paused_until, reason, source_ref, created_by
  ) VALUES (
    v_item.grn_tenant, v_item.grn_supplier, v_item.ingredient_id, v_item.unit,
    CURRENT_DATE + INTERVAL '30 days', 'hardblock_override',
    jsonb_build_object('hardblock_override_id', v_ov_id, 'grn_id', v_item.grn_id), v_uid
  );

  UPDATE public.grn_items SET is_hard_blocked = false WHERE id = p_grn_item_id;
  RETURN v_ov_id;
END;
$function$;
