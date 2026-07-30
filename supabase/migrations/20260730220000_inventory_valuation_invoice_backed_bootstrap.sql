BEGIN;

ALTER TABLE public.supplier_invoice_receipt_allocations
  DROP CONSTRAINT IF EXISTS supplier_invoice_receipt_allocations_valuation_status_check,
  ADD CONSTRAINT supplier_invoice_receipt_allocations_valuation_status_check
    CHECK (
      valuation_status IN (
        'pending',
        'not_applicable',
        'opening',
        'settled',
        'settled_current_period'
      )
    );

CREATE OR REPLACE FUNCTION private.inventory_valuation_bootstrap_allocation_values(
  p_tenant_id bigint
) RETURNS TABLE (
  allocation_id bigint,
  grn_item_id bigint,
  branch_id bigint,
  location_id bigint,
  ingredient_id bigint,
  billed_base_quantity numeric,
  allocation_value numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH ranked_lines AS (
    SELECT
      invoice.id AS invoice_id,
      line.id AS invoice_line_id,
      line.line_total,
      invoice.document_discount_amount,
      pg_catalog.row_number() OVER (
        PARTITION BY invoice.id
        ORDER BY line.id
      ) AS position,
      pg_catalog.count(*) OVER (
        PARTITION BY invoice.id
      ) AS line_count,
      pg_catalog.round(
        coalesce(invoice.document_discount_amount, 0)
          * line.line_total
          / nullif(
              pg_catalog.sum(line.line_total) OVER (
                PARTITION BY invoice.id
              ),
              0::numeric
            ),
        2
      ) AS rounded_discount
    FROM public.supplier_invoices AS invoice
    JOIN public.supplier_invoice_lines AS line
      ON line.supplier_invoice_id = invoice.id
     AND line.tenant_id = invoice.tenant_id
    WHERE invoice.tenant_id = p_tenant_id
      AND invoice.document_status = 'confirmed'
      AND invoice.invoice_kind = 'goods'
  ),
  resolved_line_discounts AS (
    SELECT
      ranked.invoice_line_id,
      CASE
        WHEN ranked.position = ranked.line_count THEN
          coalesce(ranked.document_discount_amount, 0)
          - coalesce(
              pg_catalog.sum(ranked.rounded_discount) OVER (
                PARTITION BY ranked.invoice_id
                ORDER BY ranked.invoice_line_id
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
              ),
              0
            )
        ELSE ranked.rounded_discount
      END AS allocated_discount
    FROM ranked_lines AS ranked
  ),
  ranked AS (
    SELECT
      allocation.id AS allocation_id,
      line.id AS invoice_line_id,
      allocation.grn_item_id,
      receipt.branch_id,
      receipt.location_id,
      line.ingredient_id,
      public.inv_to_base_for_tenant(
        allocation.tenant_id,
        line.ingredient_id,
        line.unit_id,
        allocation.billed_quantity
      ) AS billed_base_quantity,
      pg_catalog.round(
        line.line_total - discount.allocated_discount,
        2
      ) AS line_net_value,
      allocation.billed_quantity,
      line.quantity AS line_quantity,
      pg_catalog.row_number() OVER (
        PARTITION BY line.id
        ORDER BY line.id, allocation.grn_item_id, allocation.id
      ) AS allocation_position,
      pg_catalog.count(*) OVER (
        PARTITION BY line.id
      ) AS allocation_count
    FROM public.supplier_invoice_receipt_allocations AS allocation
    JOIN public.supplier_invoices AS invoice
      ON invoice.id = allocation.supplier_invoice_id
     AND invoice.tenant_id = allocation.tenant_id
     AND invoice.document_status = 'confirmed'
     AND invoice.invoice_kind = 'goods'
    JOIN public.supplier_invoice_lines AS line
      ON line.id = allocation.invoice_line_id
     AND line.tenant_id = allocation.tenant_id
     AND line.supplier_invoice_id = invoice.id
    JOIN resolved_line_discounts AS discount
      ON discount.invoice_line_id = line.id
    JOIN public.grn_items AS item
      ON item.id = allocation.grn_item_id
     AND item.tenant_id = allocation.tenant_id
    JOIN public.goods_received_notes AS receipt
      ON receipt.id = item.grn_id
     AND receipt.tenant_id = item.tenant_id
     AND receipt.status = 'confirmed'
    WHERE allocation.tenant_id = p_tenant_id
  ),
  provisional AS (
    SELECT
      ranked.*,
      CASE
        WHEN ranked.allocation_position < ranked.allocation_count
          THEN pg_catalog.round(
            ranked.line_net_value
              * ranked.billed_quantity
              / nullif(ranked.line_quantity, 0::numeric),
            2
          )
        ELSE NULL
      END AS provisional_value
    FROM ranked
  ),
  valued AS (
    SELECT
      provisional.*,
      CASE
        WHEN provisional.allocation_position = provisional.allocation_count
          THEN provisional.line_net_value - coalesce(
            pg_catalog.sum(provisional.provisional_value) OVER (
              PARTITION BY provisional.invoice_line_id
            ),
            0
          )
        ELSE provisional.provisional_value
      END AS final_value
    FROM provisional
  )
  SELECT
    valued.allocation_id,
    valued.grn_item_id,
    valued.branch_id,
    valued.location_id,
    valued.ingredient_id,
    valued.billed_base_quantity,
    valued.final_value AS allocation_value
  FROM valued;
$$;

REVOKE ALL ON FUNCTION
  private.inventory_valuation_bootstrap_allocation_values(bigint)
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION
private.inventory_valuation_bootstrap_value_is_representable(
  p_quantity numeric,
  p_book_value numeric
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT
    p_quantity > 0
    AND p_book_value >= 0
    AND pg_catalog.round(
      p_quantity * pg_catalog.round(p_book_value / p_quantity, 8),
      2
    ) = pg_catalog.round(p_book_value, 2);
$$;

REVOKE ALL ON FUNCTION
  private.inventory_valuation_bootstrap_value_is_representable(
    numeric,
    numeric
  )
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.inventory_valuation_bootstrap_readiness(
  p_tenant_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_status text := 'inactive';
  v_cutover_exists boolean := false;
  v_positive_pool_count integer := 0;
  v_zero_cost_pool_count integer := 0;
  v_confirmed_grn_item_count integer := 0;
  v_fully_billed_grn_item_count integer := 0;
  v_missing_grn_item_count integer := 0;
  v_zero_value_pool_count integer := 0;
  v_unrepresentable_pool_count integer := 0;
  v_unsupported_movement_count integer := 0;
  v_ledger_row_count integer := 0;
  v_invalid_invoice_line_count integer := 0;
  v_quantity_drift_count integer := 0;
  v_confirmed_net_value numeric(20,2) := 0;
  v_blockers text[] := ARRAY[]::text[];
  v_can_prepare boolean;
BEGIN
  SELECT
    pg_catalog.count(*) > 0,
    coalesce(pg_catalog.max(cutover.status), 'inactive')
  INTO v_cutover_exists, v_status
  FROM public.inventory_valuation_cutovers AS cutover
  WHERE cutover.tenant_id = p_tenant_id;

  SELECT
    pg_catalog.count(*) FILTER (WHERE stock.current_quantity > 0),
    pg_catalog.count(*) FILTER (
      WHERE stock.current_quantity > 0
        AND coalesce(stock.avg_unit_cost, 0) <= 0
    )
  INTO v_positive_pool_count, v_zero_cost_pool_count
  FROM public.stock_levels AS stock
  WHERE stock.tenant_id = p_tenant_id;

  SELECT
    (SELECT pg_catalog.count(*) FROM public.inventory_valuation_accounts
      WHERE tenant_id = p_tenant_id)
      + (SELECT pg_catalog.count(*) FROM public.inventory_cost_origins
        WHERE tenant_id = p_tenant_id)
      + (SELECT pg_catalog.count(*) FROM public.inventory_origin_balances
        WHERE tenant_id = p_tenant_id)
      + (SELECT pg_catalog.count(*) FROM public.inventory_valuation_events
        WHERE tenant_id = p_tenant_id)
      + (SELECT pg_catalog.count(*) FROM public.inventory_value_allocations
        WHERE tenant_id = p_tenant_id)
  INTO v_ledger_row_count;

  SELECT pg_catalog.count(*)
  INTO v_unsupported_movement_count
  FROM public.stock_movements AS movement
  WHERE movement.tenant_id = p_tenant_id
    AND movement.type NOT IN ('grn_receipt', 'grn_amend');

  SELECT pg_catalog.count(*)
  INTO v_invalid_invoice_line_count
  FROM public.supplier_invoice_lines AS line
  JOIN public.supplier_invoices AS invoice
    ON invoice.id = line.supplier_invoice_id
   AND invoice.tenant_id = line.tenant_id
   AND invoice.document_status = 'confirmed'
   AND invoice.invoice_kind = 'goods'
  LEFT JOIN LATERAL (
    SELECT coalesce(pg_catalog.sum(allocation.billed_quantity), 0) AS billed
    FROM public.supplier_invoice_receipt_allocations AS allocation
    WHERE allocation.tenant_id = line.tenant_id
      AND allocation.supplier_invoice_id = invoice.id
      AND allocation.invoice_line_id = line.id
  ) AS allocated ON TRUE
  WHERE line.tenant_id = p_tenant_id
    AND allocated.billed IS DISTINCT FROM line.quantity;

  WITH movement_totals AS (
    SELECT
      movement.tenant_id,
      movement.branch_id,
      movement.location_id,
      movement.ingredient_id,
      pg_catalog.sum(movement.quantity_change) AS quantity
    FROM public.stock_movements AS movement
    WHERE movement.tenant_id = p_tenant_id
    GROUP BY
      movement.tenant_id,
      movement.branch_id,
      movement.location_id,
      movement.ingredient_id
  )
  SELECT pg_catalog.count(*)
  INTO v_quantity_drift_count
  FROM public.stock_levels AS stock
  FULL JOIN movement_totals AS movement
    ON movement.tenant_id = stock.tenant_id
   AND movement.branch_id = stock.branch_id
   AND movement.location_id = stock.location_id
   AND movement.ingredient_id = stock.ingredient_id
  WHERE coalesce(stock.tenant_id, movement.tenant_id) = p_tenant_id
    AND coalesce(stock.current_quantity, 0)
      IS DISTINCT FROM coalesce(movement.quantity, 0);

  WITH receipt_quantities AS (
    SELECT
      item.id AS grn_item_id,
      public.inv_to_base_for_tenant(
        item.tenant_id,
        item.ingredient_id,
        item.entry_unit_id,
        item.received_quantity - item.rejected_quantity
      ) AS accepted_base_quantity
    FROM public.grn_items AS item
    JOIN public.goods_received_notes AS receipt
      ON receipt.id = item.grn_id
     AND receipt.tenant_id = item.tenant_id
     AND receipt.status = 'confirmed'
    WHERE item.tenant_id = p_tenant_id
  ),
  billed_quantities AS (
    SELECT
      value.grn_item_id,
      pg_catalog.sum(value.billed_base_quantity) AS billed_base_quantity
    FROM private.inventory_valuation_bootstrap_allocation_values(
      p_tenant_id
    ) AS value
    GROUP BY value.grn_item_id
  )
  SELECT
    pg_catalog.count(*),
    pg_catalog.count(*) FILTER (
      WHERE coalesce(billed.billed_base_quantity, 0) =
        receipt.accepted_base_quantity
    ),
    pg_catalog.count(*) FILTER (
      WHERE coalesce(billed.billed_base_quantity, 0) IS DISTINCT FROM
        receipt.accepted_base_quantity
    )
  INTO
    v_confirmed_grn_item_count,
    v_fully_billed_grn_item_count,
    v_missing_grn_item_count
  FROM receipt_quantities AS receipt
  LEFT JOIN billed_quantities AS billed
    ON billed.grn_item_id = receipt.grn_item_id;

  WITH pool_values AS (
    SELECT
      value.branch_id,
      value.location_id,
      value.ingredient_id,
      pg_catalog.sum(value.allocation_value) AS book_value
    FROM private.inventory_valuation_bootstrap_allocation_values(
      p_tenant_id
    ) AS value
    GROUP BY value.branch_id, value.location_id, value.ingredient_id
  )
  SELECT
    pg_catalog.count(*) FILTER (
      WHERE coalesce(pool.book_value, 0) <= 0
    ),
    pg_catalog.count(*) FILTER (
      WHERE pool.book_value > 0
        AND NOT private.inventory_valuation_bootstrap_value_is_representable(
          stock.current_quantity,
          pool.book_value
        )
    )
  INTO v_zero_value_pool_count, v_unrepresentable_pool_count
  FROM public.stock_levels AS stock
  LEFT JOIN pool_values AS pool
    ON pool.branch_id = stock.branch_id
   AND pool.location_id = stock.location_id
   AND pool.ingredient_id = stock.ingredient_id
  WHERE stock.tenant_id = p_tenant_id
    AND stock.current_quantity > 0;

  SELECT coalesce(pg_catalog.sum(value.allocation_value), 0)
  INTO v_confirmed_net_value
  FROM private.inventory_valuation_bootstrap_allocation_values(
    p_tenant_id
  ) AS value;

  IF v_cutover_exists THEN
    v_blockers := pg_catalog.array_append(
      v_blockers,
      'inventory_valuation_bootstrap_cutover_exists'
    );
  END IF;
  IF v_quantity_drift_count > 0 THEN
    v_blockers := pg_catalog.array_append(
      v_blockers,
      'inventory_valuation_quantity_drift'
    );
  END IF;
  IF v_zero_cost_pool_count > 0
     AND v_zero_cost_pool_count <> v_positive_pool_count THEN
    v_blockers := pg_catalog.array_append(
      v_blockers,
      'inventory_valuation_bootstrap_mixed_cost_basis'
    );
  END IF;
  IF v_zero_cost_pool_count > 0 AND v_ledger_row_count > 0 THEN
    v_blockers := pg_catalog.array_append(
      v_blockers,
      'inventory_valuation_bootstrap_ledger_not_pristine'
    );
  END IF;
  IF v_zero_cost_pool_count > 0 AND v_unsupported_movement_count > 0 THEN
    v_blockers := pg_catalog.array_append(
      v_blockers,
      'inventory_valuation_bootstrap_unsupported_movement'
    );
  END IF;
  IF v_zero_cost_pool_count > 0
     AND (
       v_invalid_invoice_line_count > 0
       OR v_missing_grn_item_count > 0
     ) THEN
    v_blockers := pg_catalog.array_append(
      v_blockers,
      'inventory_valuation_bootstrap_missing_invoice_coverage'
    );
  END IF;
  IF v_zero_cost_pool_count > 0 AND v_zero_value_pool_count > 0 THEN
    v_blockers := pg_catalog.array_append(
      v_blockers,
      'inventory_valuation_bootstrap_zero_value_pool'
    );
  END IF;
  IF v_zero_cost_pool_count > 0
     AND v_unrepresentable_pool_count > 0 THEN
    v_blockers := pg_catalog.array_append(
      v_blockers,
      'inventory_valuation_bootstrap_value_not_representable'
    );
  END IF;

  v_can_prepare :=
    NOT v_cutover_exists
    AND v_quantity_drift_count = 0
    AND (
      v_zero_cost_pool_count = 0
      OR (
        v_zero_cost_pool_count = v_positive_pool_count
        AND v_ledger_row_count = 0
        AND v_unsupported_movement_count = 0
        AND v_invalid_invoice_line_count = 0
        AND v_missing_grn_item_count = 0
        AND v_zero_value_pool_count = 0
        AND v_unrepresentable_pool_count = 0
      )
    );

  RETURN pg_catalog.jsonb_build_object(
    'cutover_status', v_status,
    'positive_stock_pool_count', v_positive_pool_count,
    'zero_cost_stock_pool_count', v_zero_cost_pool_count,
    'confirmed_grn_item_count', v_confirmed_grn_item_count,
    'fully_billed_grn_item_count', v_fully_billed_grn_item_count,
    'missing_grn_item_count', v_missing_grn_item_count,
    'unrepresentable_pool_count', v_unrepresentable_pool_count,
    'confirmed_net_inventory_value', v_confirmed_net_value,
    'can_prepare', v_can_prepare,
    'blockers', pg_catalog.to_jsonb(v_blockers)
  );
END;
$$;

REVOKE ALL ON FUNCTION
  private.inventory_valuation_bootstrap_readiness(bigint)
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_inventory_valuation_bootstrap_readiness()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.auth_is_owner(auth.uid())
     OR NOT public.has_permission_any('inventory:valuation_read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN private.inventory_valuation_bootstrap_readiness(v_tenant);
END;
$$;

REVOKE ALL ON FUNCTION
  public.prepare_inventory_valuation_cutover(uuid),
  public.activate_inventory_valuation_cutover(uuid)
FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.prepare_inventory_valuation_cutover(uuid)
  RENAME TO prepare_inventory_valuation_cutover_prebootstrap;
ALTER FUNCTION public.prepare_inventory_valuation_cutover_prebootstrap(uuid)
  SET SCHEMA private;

ALTER FUNCTION public.activate_inventory_valuation_cutover(uuid)
  RENAME TO activate_inventory_valuation_cutover_prebootstrap;
ALTER FUNCTION public.activate_inventory_valuation_cutover_prebootstrap(uuid)
  SET SCHEMA private;

REVOKE ALL ON FUNCTION
  private.prepare_inventory_valuation_cutover_prebootstrap(uuid),
  private.activate_inventory_valuation_cutover_prebootstrap(uuid)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.bootstrap_inventory_valuation_from_invoices(
  p_tenant_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_readiness jsonb;
  v_blockers jsonb;
  v_updated_pools integer;
  v_positive_pools integer;
  v_unrepresentable_pool_count integer;
BEGIN
  v_readiness :=
    private.inventory_valuation_bootstrap_readiness(p_tenant_id);
  v_blockers := v_readiness->'blockers';

  IF v_blockers ? 'inventory_valuation_quantity_drift' THEN
    RAISE EXCEPTION 'inventory_valuation_quantity_drift'
      USING ERRCODE = '23514';
  END IF;
  IF v_blockers ? 'inventory_valuation_bootstrap_ledger_not_pristine' THEN
    RAISE EXCEPTION 'inventory_valuation_bootstrap_ledger_not_pristine'
      USING ERRCODE = '23514';
  END IF;
  IF v_blockers ? 'inventory_valuation_bootstrap_unsupported_movement' THEN
    RAISE EXCEPTION 'inventory_valuation_bootstrap_unsupported_movement'
      USING ERRCODE = '23514';
  END IF;
  IF v_blockers ? 'inventory_valuation_bootstrap_mixed_cost_basis' THEN
    RAISE EXCEPTION 'inventory_valuation_bootstrap_mixed_cost_basis'
      USING ERRCODE = '23514';
  END IF;
  IF v_blockers ? 'inventory_valuation_bootstrap_missing_invoice_coverage' THEN
    RAISE EXCEPTION 'inventory_valuation_bootstrap_missing_invoice_coverage'
      USING ERRCODE = '23514';
  END IF;
  IF v_blockers ? 'inventory_valuation_bootstrap_zero_value_pool' THEN
    RAISE EXCEPTION 'inventory_valuation_bootstrap_zero_value_pool'
      USING ERRCODE = '23514';
  END IF;
  IF v_blockers
     ? 'inventory_valuation_bootstrap_value_not_representable' THEN
    RAISE EXCEPTION
      'inventory_valuation_bootstrap_value_not_representable'
      USING ERRCODE = '23514';
  END IF;
  IF NOT (v_readiness->>'can_prepare')::boolean THEN
    RAISE EXCEPTION 'inventory_valuation_bootstrap_not_ready'
      USING ERRCODE = '23514';
  END IF;

  DROP TABLE IF EXISTS pg_temp.inventory_valuation_bootstrap_values;
  CREATE TEMP TABLE inventory_valuation_bootstrap_values
  ON COMMIT DROP
  AS
  SELECT *
  FROM private.inventory_valuation_bootstrap_allocation_values(
    p_tenant_id
  );

  WITH pool_values AS (
    SELECT
      value.branch_id,
      value.location_id,
      value.ingredient_id,
      pg_catalog.sum(value.allocation_value) AS book_value
    FROM pg_temp.inventory_valuation_bootstrap_values AS value
    GROUP BY value.branch_id, value.location_id, value.ingredient_id
  )
  UPDATE public.stock_levels AS stock
  SET avg_unit_cost = pg_catalog.round(
        pool.book_value / stock.current_quantity,
        8
      ),
      updated_at = pg_catalog.now()
  FROM pool_values AS pool
  WHERE stock.tenant_id = p_tenant_id
    AND stock.current_quantity > 0
    AND stock.branch_id = pool.branch_id
    AND stock.location_id = pool.location_id
    AND stock.ingredient_id = pool.ingredient_id;

  GET DIAGNOSTICS v_updated_pools = ROW_COUNT;

  SELECT pg_catalog.count(*)
  INTO v_positive_pools
  FROM public.stock_levels AS stock
  WHERE stock.tenant_id = p_tenant_id
    AND stock.current_quantity > 0;

  IF v_updated_pools <> v_positive_pools THEN
    RAISE EXCEPTION 'inventory_valuation_bootstrap_zero_value_pool'
      USING ERRCODE = '23514';
  END IF;

  WITH pool_values AS (
    SELECT
      value.branch_id,
      value.location_id,
      value.ingredient_id,
      pg_catalog.round(
        pg_catalog.sum(value.allocation_value),
        2
      ) AS book_value
    FROM pg_temp.inventory_valuation_bootstrap_values AS value
    GROUP BY value.branch_id, value.location_id, value.ingredient_id
  )
  SELECT pg_catalog.count(*)
  INTO v_unrepresentable_pool_count
  FROM public.stock_levels AS stock
  JOIN pool_values AS pool
    ON pool.branch_id = stock.branch_id
   AND pool.location_id = stock.location_id
   AND pool.ingredient_id = stock.ingredient_id
  WHERE stock.tenant_id = p_tenant_id
    AND pg_catalog.round(
      stock.current_quantity * stock.avg_unit_cost,
      2
    ) IS DISTINCT FROM pool.book_value;

  IF v_unrepresentable_pool_count > 0 THEN
    RAISE EXCEPTION 'inventory_valuation_bootstrap_value_not_representable'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.supplier_invoice_receipt_allocations AS allocation
  SET confirmed_net_inventory_amount = value.allocation_value,
      valuation_status = 'opening'
  FROM pg_temp.inventory_valuation_bootstrap_values AS value
  WHERE allocation.id = value.allocation_id
    AND allocation.tenant_id = p_tenant_id;

  RETURN pg_catalog.jsonb_build_object(
    'updated_pool_count', v_updated_pools,
    'confirmed_net_inventory_value',
      v_readiness->'confirmed_net_inventory_value'
  );
END;
$$;

REVOKE ALL ON FUNCTION
  private.bootstrap_inventory_valuation_from_invoices(bigint)
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prepare_inventory_valuation_cutover(
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_cutover_exists boolean := false;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.auth_is_owner(auth.uid())
     OR NOT public.has_permission_any('inventory:valuation_read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'inventory_valuation_cutover_invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'inventory-valuation-cutover:' || v_tenant::text,
      0
    )
  );

  LOCK TABLE
    public.stock_levels,
    public.stock_movements,
    public.goods_received_notes,
    public.grn_items,
    public.supplier_invoices,
    public.supplier_invoice_lines,
    public.supplier_invoice_receipt_allocations
  IN SHARE ROW EXCLUSIVE MODE;

  SELECT pg_catalog.count(*) > 0
  INTO v_cutover_exists
  FROM public.inventory_valuation_cutovers AS cutover
  WHERE cutover.tenant_id = v_tenant;

  IF NOT v_cutover_exists
     AND EXISTS (
       SELECT 1
       FROM public.stock_levels AS stock
       WHERE stock.tenant_id = v_tenant
         AND stock.current_quantity > 0
         AND coalesce(stock.avg_unit_cost, 0) <= 0
     ) THEN
    PERFORM private.bootstrap_inventory_valuation_from_invoices(v_tenant);
  END IF;

  RETURN private.prepare_inventory_valuation_cutover_prebootstrap(
    p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_inventory_valuation_cutover(
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_cutover public.inventory_valuation_cutovers%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.auth_is_owner(auth.uid())
     OR NOT public.has_permission_any('inventory:valuation_read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'inventory_valuation_activation_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT cutover.*
  INTO v_cutover
  FROM public.inventory_valuation_cutovers AS cutover
  WHERE cutover.tenant_id = v_tenant
  FOR UPDATE;

  IF FOUND
     AND v_cutover.status = 'shadow'
     AND v_cutover.prepared_at > pg_catalog.now() - interval '7 days' THEN
    RAISE EXCEPTION 'inventory_valuation_shadow_period_incomplete'
      USING ERRCODE = '23514';
  END IF;

  RETURN private.activate_inventory_valuation_cutover_prebootstrap(
    p_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.get_inventory_valuation_bootstrap_readiness(),
  public.prepare_inventory_valuation_cutover(uuid),
  public.activate_inventory_valuation_cutover(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.get_inventory_valuation_bootstrap_readiness(),
  public.prepare_inventory_valuation_cutover(uuid),
  public.activate_inventory_valuation_cutover(uuid)
TO authenticated, service_role;

COMMIT;
