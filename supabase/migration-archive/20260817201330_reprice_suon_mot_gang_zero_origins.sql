-- Restate Thịt một gang pending GRN at last finalized invoice, then Sườn một
-- gang POS shortfalls at the restated production WAC. Meat was consumed at 0;
-- production output kept marinade-only value; Chi nhánh sales booked
-- shortfalls instead of the production lot. Append-only; GRN stays unpriced.

DO $reprice_suon_mot_gang$
DECLARE
  v_tenant bigint;
  v_meat bigint;
  v_fg bigint;
  v_origin public.inventory_cost_origins%ROWTYPE;
  v_unit numeric(24, 8);
  v_new numeric(20, 2);
  v_delta numeric(20, 2);
  v_event_id bigint;
  v_now timestamptz := pg_catalog.now();
  v_year integer;
  v_month integer;
BEGIN
  SELECT ingredient.tenant_id, ingredient.id
  INTO STRICT v_tenant, v_meat
  FROM public.ingredients AS ingredient
  WHERE ingredient.name = 'Thịt một gang'
    AND ingredient.item_kind = 'raw_material';

  SELECT ingredient.id
  INTO STRICT v_fg
  FROM public.ingredients AS ingredient
  WHERE ingredient.tenant_id = v_tenant
    AND ingredient.name = 'Sườn một gang'
    AND ingredient.item_kind = 'finished_good';

  PERFORM private.reprice_zero_value_origins(v_tenant, v_meat);
  PERFORM private.project_company_wac(v_tenant, v_meat);
  PERFORM private.project_company_wac(v_tenant, v_fg);

  IF EXISTS (
    SELECT 1
    FROM public.inventory_cost_origins AS origin
    WHERE origin.tenant_id = v_tenant
      AND origin.ingredient_id = v_meat
      AND origin.source_kind = 'grn_receipt'
      AND origin.cost_status IN ('pending', 'provisional')
      AND coalesce(origin.provisional_value, 0) = 0
      AND origin.original_quantity > 0
  ) THEN
    RAISE EXCEPTION 'thit_mot_gang_zero_provisional_remains'
      USING ERRCODE = 'P0001';
  END IF;

  -- Production origin.provisional_value stays marinade-only after input
  -- reprice; remaining-stock company WAC is the restated batch unit.
  v_unit := private.ingredient_company_wac(v_tenant, v_fg);
  IF v_unit IS NULL OR v_unit <= 0 THEN
    RAISE EXCEPTION 'suon_mot_gang_company_wac_missing'
      USING ERRCODE = 'P0001';
  END IF;

  v_year := extract(YEAR FROM v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer;
  v_month := extract(MONTH FROM v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer;

  FOR v_origin IN
    SELECT origin.*
    FROM public.inventory_cost_origins AS origin
    WHERE origin.tenant_id = v_tenant
      AND origin.ingredient_id = v_fg
      AND origin.source_kind = 'pos_sale_shortfall'
      AND origin.cost_status IN ('pending', 'provisional')
      AND origin.original_quantity > 0
    ORDER BY origin.id
    FOR UPDATE
  LOOP
    v_new := pg_catalog.round(v_origin.original_quantity * v_unit, 2);
    v_delta := v_new - coalesce(v_origin.provisional_value, 0);
    IF v_delta = 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.inventory_valuation_events (
      tenant_id,
      ingredient_id,
      event_type,
      quantity_delta,
      value_delta,
      effective_at,
      posting_year,
      posting_month,
      idempotency_key,
      metadata
    )
    VALUES (
      v_tenant,
      v_fg,
      'provisional_reprice',
      0,
      v_delta,
      v_now,
      v_year,
      v_month,
      pg_catalog.md5(
        'provisional-reprice:'
          || v_tenant::text || ':'
          || v_origin.id::text || ':'
          || v_new::text
      )::uuid,
      pg_catalog.jsonb_build_object(
        'origin_id', v_origin.id,
        'source_kind', v_origin.source_kind,
        'provisional_unit_cost', v_unit
      )
    )
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
    RETURNING id INTO v_event_id;

    IF v_event_id IS NULL THEN
      SELECT event.id
      INTO v_event_id
      FROM public.inventory_valuation_events AS event
      WHERE event.tenant_id = v_tenant
        AND event.idempotency_key = pg_catalog.md5(
          'provisional-reprice:'
            || v_tenant::text || ':'
            || v_origin.id::text || ':'
            || v_new::text
        )::uuid;
    END IF;

    PERFORM private.propagate_inventory_origin_reprice(
      v_tenant,
      v_event_id,
      v_origin.id,
      v_delta
    );

    UPDATE public.inventory_cost_origins
    SET provisional_value = v_new,
        cost_status = 'provisional'
    WHERE id = v_origin.id
      AND tenant_id = v_tenant;
  END LOOP;
END
$reprice_suon_mot_gang$;
