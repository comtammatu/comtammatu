-- Atomically settle supplier-invoice acquisition cost into inventory lineage.

CREATE OR REPLACE FUNCTION private.propagate_inventory_origin_reprice(
  p_tenant_id bigint,
  p_valuation_event_id bigint,
  p_origin_id bigint,
  p_delta numeric,
  p_inventory_bucket text DEFAULT 'inventory',
  p_depth integer DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_origin public.inventory_cost_origins%ROWTYPE;
  v_balance record;
  v_lineage record;
  v_terminal record;
  v_account record;
  v_share numeric(20,2);
BEGIN
  IF p_delta = 0 THEN
    RETURN;
  END IF;
  IF p_depth > 64 THEN
    RAISE EXCEPTION 'inventory_valuation_lineage_depth_exceeded'
      USING ERRCODE = '54001';
  END IF;

  FOR v_account IN
    SELECT DISTINCT
      account.id,
      account.branch_id,
      account.location_id,
      account.ingredient_id
    FROM public.inventory_origin_balances AS balance
    JOIN public.inventory_valuation_accounts AS account
      ON account.id = balance.valuation_account_id
     AND account.tenant_id = balance.tenant_id
    WHERE balance.tenant_id = p_tenant_id
      AND balance.origin_id = p_origin_id
      AND balance.holder_kind = 'stock_pool'
    ORDER BY
      account.branch_id,
      account.location_id,
      account.ingredient_id,
      account.id
  LOOP
    PERFORM private.lock_inventory_valuation_pool(
      p_tenant_id,
      v_account.branch_id,
      v_account.location_id,
      v_account.ingredient_id
    );
  END LOOP;

  PERFORM account.id
  FROM public.inventory_origin_balances AS balance
  JOIN public.inventory_valuation_accounts AS account
    ON account.id = balance.valuation_account_id
   AND account.tenant_id = balance.tenant_id
  WHERE balance.tenant_id = p_tenant_id
    AND balance.origin_id = p_origin_id
    AND balance.holder_kind = 'stock_pool'
  ORDER BY
    account.branch_id,
    account.location_id,
    account.ingredient_id,
    account.id
  FOR UPDATE OF account;

  SELECT origin.*
  INTO v_origin
  FROM public.inventory_cost_origins AS origin
  WHERE origin.id = p_origin_id
    AND origin.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND OR v_origin.original_quantity <= 0 THEN
    RAISE EXCEPTION 'inventory_valuation_origin_invalid'
      USING ERRCODE = '23514';
  END IF;

  FOR v_balance IN
    SELECT balance.*
    FROM public.inventory_origin_balances AS balance
    WHERE balance.tenant_id = p_tenant_id
      AND balance.origin_id = p_origin_id
      AND balance.quantity > 0
    ORDER BY balance.id
    FOR UPDATE
  LOOP
    v_share := pg_catalog.round(
      p_delta * v_balance.quantity / v_origin.original_quantity,
      2
    );

    UPDATE public.inventory_origin_balances
    SET book_value = book_value + v_share,
        updated_at = pg_catalog.now()
    WHERE id = v_balance.id;

    IF v_balance.valuation_account_id IS NOT NULL THEN
      UPDATE public.inventory_valuation_accounts
      SET book_value = book_value + v_share,
          valuation_version = valuation_version + 1,
          updated_at = pg_catalog.now()
      WHERE id = v_balance.valuation_account_id
        AND tenant_id = p_tenant_id;
    END IF;

    INSERT INTO public.inventory_value_allocations (
      tenant_id,
      valuation_event_id,
      source_origin_id,
      to_balance_id,
      allocation_bucket,
      allocated_quantity,
      allocated_value,
      allocation_fraction
    )
    VALUES (
      p_tenant_id,
      p_valuation_event_id,
      p_origin_id,
      v_balance.id,
      CASE
        WHEN v_balance.holder_kind = 'transfer_item'
          THEN 'transfer_holder'
        ELSE p_inventory_bucket
      END,
      v_balance.quantity,
      v_share,
      v_balance.quantity / v_origin.original_quantity
    );
  END LOOP;

  FOR v_lineage IN
    SELECT
      allocation.derived_origin_id,
      pg_catalog.sum(allocation.allocated_quantity) AS allocated_quantity
    FROM public.inventory_value_allocations AS allocation
    WHERE allocation.tenant_id = p_tenant_id
      AND allocation.source_origin_id = p_origin_id
      AND allocation.derived_origin_id IS NOT NULL
      AND allocation.valuation_event_id <> p_valuation_event_id
    GROUP BY allocation.derived_origin_id
    ORDER BY allocation.derived_origin_id
  LOOP
    v_share := pg_catalog.round(
      p_delta
        * v_lineage.allocated_quantity
        / v_origin.original_quantity,
      2
    );
    PERFORM private.propagate_inventory_origin_reprice(
      p_tenant_id,
      p_valuation_event_id,
      v_lineage.derived_origin_id,
      v_share,
      'production_inventory',
      p_depth + 1
    );
  END LOOP;

  FOR v_terminal IN
    SELECT
      event.terminal_bucket,
      pg_catalog.sum(allocation.allocated_quantity)
        - CASE
            WHEN event.terminal_bucket = 'food_cost' THEN (
              SELECT coalesce(
                pg_catalog.sum(restore_allocation.allocated_quantity),
                0
              )
              FROM public.inventory_value_allocations AS restore_allocation
              JOIN public.inventory_valuation_events AS restore_event
                ON restore_event.id = restore_allocation.valuation_event_id
               AND restore_event.tenant_id = restore_allocation.tenant_id
              WHERE restore_allocation.tenant_id = p_tenant_id
                AND restore_allocation.source_origin_id = p_origin_id
                AND restore_event.event_type = 'issue_restore'
            )
            ELSE 0
          END AS allocated_quantity
    FROM public.inventory_value_allocations AS allocation
    JOIN public.inventory_valuation_events AS event
      ON event.id = allocation.valuation_event_id
     AND event.tenant_id = allocation.tenant_id
    WHERE allocation.tenant_id = p_tenant_id
      AND allocation.source_origin_id = p_origin_id
      AND allocation.derived_origin_id IS NULL
      AND allocation.to_balance_id IS NULL
      AND event.terminal_bucket IS NOT NULL
      AND allocation.valuation_event_id <> p_valuation_event_id
    GROUP BY event.terminal_bucket
    HAVING pg_catalog.sum(allocation.allocated_quantity)
      - CASE
          WHEN event.terminal_bucket = 'food_cost' THEN (
            SELECT coalesce(
              pg_catalog.sum(restore_allocation.allocated_quantity),
              0
            )
            FROM public.inventory_value_allocations AS restore_allocation
            JOIN public.inventory_valuation_events AS restore_event
              ON restore_event.id = restore_allocation.valuation_event_id
             AND restore_event.tenant_id = restore_allocation.tenant_id
            WHERE restore_allocation.tenant_id = p_tenant_id
              AND restore_allocation.source_origin_id = p_origin_id
              AND restore_event.event_type = 'issue_restore'
          )
          ELSE 0
        END > 0
    ORDER BY event.terminal_bucket
  LOOP
    v_share := pg_catalog.round(
      p_delta
        * v_terminal.allocated_quantity
        / v_origin.original_quantity,
      2
    );
    INSERT INTO public.inventory_value_allocations (
      tenant_id,
      valuation_event_id,
      source_origin_id,
      allocation_bucket,
      allocated_quantity,
      allocated_value,
      allocation_fraction
    )
    VALUES (
      p_tenant_id,
      p_valuation_event_id,
      p_origin_id,
      v_terminal.terminal_bucket,
      v_terminal.allocated_quantity,
      v_share,
      v_terminal.allocated_quantity / v_origin.original_quantity
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION private.settle_supplier_invoice_valuation(
  p_invoice_id bigint,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_invoice public.supplier_invoices%ROWTYPE;
  v_line record;
  v_allocation record;
  v_origin public.inventory_cost_origins%ROWTYPE;
  v_mode text;
  v_line_net numeric(20,2);
  v_line_remaining numeric(20,2);
  v_allocation_net numeric(20,2);
  v_provisional numeric(20,2);
  v_delta numeric(20,2);
  v_allocated_delta numeric(20,2);
  v_rounding numeric(20,2);
  v_billed_base numeric(20,3);
  v_event_id bigint;
  v_event_key uuid;
  v_effective_at timestamptz;
  v_period_status text;
  v_status text;
  v_warning boolean := FALSE;
  v_warning_percent numeric;
  v_warning_amount numeric;
  v_total_provisional numeric(20,2) := 0;
  v_total_final numeric(20,2) := 0;
  v_allocation_position integer;
  v_allocation_count integer;
  v_has_origin boolean;
  v_accepted_base numeric(20,3);
BEGIN
  SELECT invoice.*
  INTO v_invoice
  FROM public.supplier_invoices AS invoice
  WHERE invoice.id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_invoice.invoice_kind = 'service' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_applicable');
  END IF;

  v_mode := private.inventory_valuation_mode(v_invoice.tenant_id);
  IF v_mode = 'inactive' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_applicable');
  END IF;

  INSERT INTO public.inventory_valuation_settings (tenant_id)
  VALUES (v_invoice.tenant_id)
  ON CONFLICT (tenant_id) DO NOTHING;

  SELECT
    settings.variance_warning_percent,
    settings.variance_warning_amount
  INTO v_warning_percent, v_warning_amount
  FROM public.inventory_valuation_settings AS settings
  WHERE settings.tenant_id = v_invoice.tenant_id;

  PERFORM allocation.id
  FROM public.supplier_invoice_receipt_allocations AS allocation
  WHERE allocation.tenant_id = v_invoice.tenant_id
    AND allocation.supplier_invoice_id = p_invoice_id
  ORDER BY allocation.grn_item_id, allocation.id
  FOR UPDATE;

  PERFORM item.id
  FROM public.grn_items AS item
  JOIN public.supplier_invoice_receipt_allocations AS allocation
    ON allocation.grn_item_id = item.id
   AND allocation.tenant_id = item.tenant_id
  WHERE allocation.tenant_id = v_invoice.tenant_id
    AND allocation.supplier_invoice_id = p_invoice_id
  ORDER BY item.id
  FOR UPDATE OF item;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_invoice_receipt_allocations AS allocation
    WHERE allocation.tenant_id = v_invoice.tenant_id
      AND allocation.supplier_invoice_id = p_invoice_id
      AND allocation.grn_item_id IS NULL
  ) THEN
    RAISE EXCEPTION 'supplier_invoice_allocation_grn_item_missing'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_invoice_receipt_allocations AS current_allocation
    JOIN public.grn_items AS item
      ON item.id = current_allocation.grn_item_id
     AND item.tenant_id = current_allocation.tenant_id
    LEFT JOIN LATERAL (
      SELECT coalesce(pg_catalog.sum(
        public.inv_to_base_for_tenant(
          other.tenant_id,
          other_line.ingredient_id,
          other_line.unit_id,
          other.billed_quantity
        )
      ), 0) AS billed
      FROM public.supplier_invoice_receipt_allocations AS other
      JOIN public.supplier_invoices AS other_invoice
        ON other_invoice.id = other.supplier_invoice_id
       AND other_invoice.tenant_id = other.tenant_id
      JOIN public.supplier_invoice_lines AS other_line
        ON other_line.id = other.invoice_line_id
       AND other_line.tenant_id = other.tenant_id
      WHERE other.tenant_id = current_allocation.tenant_id
        AND other.grn_item_id = current_allocation.grn_item_id
        AND (
          other_invoice.document_status = 'confirmed'
          OR other.supplier_invoice_id = p_invoice_id
        )
    ) AS billed ON TRUE
    WHERE current_allocation.tenant_id = v_invoice.tenant_id
      AND current_allocation.supplier_invoice_id = p_invoice_id
      AND billed.billed > public.inv_to_base_for_tenant(
        item.tenant_id,
        item.ingredient_id,
        item.entry_unit_id,
        item.received_quantity - item.rejected_quantity
      )
  ) THEN
    RAISE EXCEPTION 'supplier_invoice_allocation_overbilled'
      USING ERRCODE = '23514';
  END IF;

  WITH ranked_lines AS (
    SELECT
      line.id,
      pg_catalog.row_number() OVER (ORDER BY line.id) AS position,
      pg_catalog.count(*) OVER () AS line_count,
      pg_catalog.round(
        coalesce(v_invoice.document_discount_amount, 0)
          * line.line_total
          / pg_catalog.nullif(
              pg_catalog.sum(line.line_total) OVER (),
              0
            ),
        2
      ) AS rounded_discount
    FROM public.supplier_invoice_lines AS line
    WHERE line.tenant_id = v_invoice.tenant_id
      AND line.supplier_invoice_id = p_invoice_id
  ),
  resolved_lines AS (
    SELECT
      ranked.id,
      CASE
        WHEN ranked.position = ranked.line_count THEN
          coalesce(v_invoice.document_discount_amount, 0)
          - coalesce(
              pg_catalog.sum(ranked.rounded_discount) OVER (
                ORDER BY ranked.id
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
              ),
              0
            )
        ELSE ranked.rounded_discount
      END AS allocated_discount
    FROM ranked_lines AS ranked
  )
  UPDATE public.supplier_invoice_lines AS line
  SET allocated_document_discount = resolved.allocated_discount
  FROM resolved_lines AS resolved
  WHERE line.id = resolved.id
    AND line.tenant_id = v_invoice.tenant_id;

  FOR v_line IN
    SELECT line.*
    FROM public.supplier_invoice_lines AS line
    WHERE line.tenant_id = v_invoice.tenant_id
      AND line.supplier_invoice_id = p_invoice_id
      AND line.ingredient_id IS NOT NULL
      AND line.unit_id IS NOT NULL
    ORDER BY line.id
  LOOP
    v_line_net := pg_catalog.round(
      v_line.line_total - v_line.allocated_document_discount,
      2
    );
    v_line_remaining := v_line_net;

    SELECT pg_catalog.count(*)
    INTO v_allocation_count
    FROM public.supplier_invoice_receipt_allocations AS allocation
    WHERE allocation.tenant_id = v_invoice.tenant_id
      AND allocation.supplier_invoice_id = p_invoice_id
      AND allocation.invoice_line_id = v_line.id;
    v_allocation_position := 0;

    FOR v_allocation IN
      SELECT
        allocation.*,
        item.received_quantity,
        item.rejected_quantity,
        item.entry_unit_id,
        item.total_cost AS grn_provisional_value,
        grn.received_date,
        cutover.cutoff_at
      FROM public.supplier_invoice_receipt_allocations AS allocation
      JOIN public.grn_items AS item
        ON item.id = allocation.grn_item_id
       AND item.tenant_id = allocation.tenant_id
      JOIN public.goods_received_notes AS grn
        ON grn.id = item.grn_id
       AND grn.tenant_id = item.tenant_id
      JOIN public.inventory_valuation_cutovers AS cutover
        ON cutover.tenant_id = allocation.tenant_id
      WHERE allocation.tenant_id = v_invoice.tenant_id
        AND allocation.supplier_invoice_id = p_invoice_id
        AND allocation.invoice_line_id = v_line.id
      ORDER BY allocation.invoice_line_id, allocation.grn_item_id, allocation.id
    LOOP
      v_allocation_position := v_allocation_position + 1;
      IF v_allocation_position = v_allocation_count THEN
        v_allocation_net := v_line_remaining;
      ELSE
        v_allocation_net := pg_catalog.round(
          v_line_net * v_allocation.billed_quantity
            / pg_catalog.nullif(v_line.quantity, 0),
          2
        );
      END IF;
      v_line_remaining := v_line_remaining - v_allocation_net;

      v_billed_base := public.inv_to_base_for_tenant(
        v_invoice.tenant_id,
        v_line.ingredient_id,
        v_line.unit_id,
        v_allocation.billed_quantity
      );
      v_accepted_base := public.inv_to_base_for_tenant(
        v_invoice.tenant_id,
        v_line.ingredient_id,
        v_allocation.entry_unit_id,
        v_allocation.received_quantity - v_allocation.rejected_quantity
      );

      SELECT origin.*
      INTO v_origin
      FROM public.inventory_cost_origins AS origin
      WHERE origin.tenant_id = v_invoice.tenant_id
        AND origin.source_kind = 'grn_receipt'
        AND origin.grn_item_id = v_allocation.grn_item_id
      ORDER BY origin.id
      LIMIT 1
      FOR UPDATE;
      v_has_origin := FOUND;

      IF v_allocation.received_date < v_allocation.cutoff_at
         OR NOT v_has_origin THEN
        v_provisional := pg_catalog.round(
          v_allocation.grn_provisional_value
            * v_billed_base
            / pg_catalog.nullif(v_accepted_base, 0),
          2
        );
        v_status := 'settled_current_period';
      ELSE
        IF v_origin.finalized_quantity + v_billed_base
           > v_origin.original_quantity THEN
          RAISE EXCEPTION 'inventory_valuation_origin_overfinalized'
            USING ERRCODE = '23514';
        END IF;
        v_provisional := pg_catalog.round(
          v_origin.provisional_value
            * v_billed_base
            / pg_catalog.nullif(v_origin.original_quantity, 0),
          2
        );
        v_period_status := public.period_status_at(
          v_invoice.tenant_id,
          v_allocation.received_date
        );
        IF v_period_status = 'open' THEN
          v_effective_at := v_allocation.received_date;
          v_status := 'settled';
        ELSE
          v_effective_at := pg_catalog.now();
          v_status := 'settled_current_period';
        END IF;
      END IF;

      IF v_status = 'settled_current_period' THEN
        v_effective_at := pg_catalog.now();
      END IF;
      v_delta := v_allocation_net - v_provisional;
      v_event_key := pg_catalog.md5(
        'supplier-invoice-valuation:'
          || p_invoice_id::text || ':'
          || v_allocation.id::text
      )::uuid;

      INSERT INTO public.inventory_valuation_events (
        tenant_id,
        ingredient_id,
        event_type,
        source_invoice_id,
        source_invoice_line_id,
        grn_item_id,
        quantity_delta,
        value_delta,
        effective_at,
        posting_year,
        posting_month,
        idempotency_key,
        metadata,
        created_by
      )
      VALUES (
        v_invoice.tenant_id,
        v_line.ingredient_id,
        'invoice_reprice',
        p_invoice_id,
        v_line.id,
        v_allocation.grn_item_id,
        0,
        v_delta,
        v_effective_at,
        extract(
          YEAR FROM v_effective_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
        )::integer,
        extract(
          MONTH FROM v_effective_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
        )::integer,
        v_event_key,
        pg_catalog.jsonb_build_object(
          'allocation_id', v_allocation.id,
          'confirmation_key', p_idempotency_key,
          'status', v_status
        ),
        v_invoice.confirmed_by
      )
      ON CONFLICT (tenant_id, idempotency_key)
      DO NOTHING
      RETURNING id INTO v_event_id;

      IF v_event_id IS NULL THEN
        SELECT event.id
        INTO v_event_id
        FROM public.inventory_valuation_events AS event
        WHERE event.tenant_id = v_invoice.tenant_id
          AND event.idempotency_key = v_event_key;
      END IF;

      IF v_allocation.received_date < v_allocation.cutoff_at
         OR NOT v_has_origin THEN
        INSERT INTO public.inventory_value_allocations (
          tenant_id,
          valuation_event_id,
          source_origin_id,
          allocation_bucket,
          allocated_quantity,
          allocated_value
        )
        VALUES (
          v_invoice.tenant_id,
          v_event_id,
          NULL,
          'legacy_purchase_price_variance',
          0,
          v_delta
        );
      ELSE
        PERFORM private.propagate_inventory_origin_reprice(
          v_invoice.tenant_id,
          v_event_id,
          v_origin.id,
          v_delta
        );

        SELECT coalesce(pg_catalog.sum(allocation.allocated_value), 0)
        INTO v_allocated_delta
        FROM public.inventory_value_allocations AS allocation
        WHERE allocation.tenant_id = v_invoice.tenant_id
          AND allocation.valuation_event_id = v_event_id;

        v_rounding := v_delta - v_allocated_delta;
        IF v_rounding <> 0 THEN
          INSERT INTO public.inventory_value_allocations (
            tenant_id,
            valuation_event_id,
            source_origin_id,
            allocation_bucket,
            allocated_quantity,
            allocated_value
          )
          VALUES (
            v_invoice.tenant_id,
            v_event_id,
            v_origin.id,
            'rounding',
            0,
            v_rounding
          );
        END IF;

        UPDATE public.inventory_cost_origins
        SET finalized_quantity = finalized_quantity + v_billed_base,
            finalized_value = finalized_value + v_allocation_net,
            cost_status = CASE
              WHEN finalized_quantity + v_billed_base = original_quantity
                THEN 'finalized'
              ELSE 'partial'
            END
        WHERE id = v_origin.id
          AND tenant_id = v_invoice.tenant_id;
      END IF;

      UPDATE public.supplier_invoice_receipt_allocations
      SET confirmed_net_inventory_amount = v_allocation_net,
          valuation_event_id = v_event_id,
          valuation_status = v_status
      WHERE id = v_allocation.id
        AND tenant_id = v_invoice.tenant_id;

      v_total_provisional := v_total_provisional + v_provisional;
      v_total_final := v_total_final + v_allocation_net;
      IF pg_catalog.abs(v_delta) >= v_warning_amount
         OR (
           v_provisional > 0
           AND pg_catalog.abs(v_delta) * 100 / v_provisional
             >= v_warning_percent
         ) THEN
        v_warning := TRUE;
      END IF;
    END LOOP;
  END LOOP;

  IF v_mode = 'active' THEN
    UPDATE public.stock_levels AS stock
    SET avg_unit_cost = CASE
          WHEN account.quantity > 0
            THEN pg_catalog.round(
              account.book_value / account.quantity,
              8
            )
          ELSE 0
        END,
        updated_at = pg_catalog.now()
    FROM public.inventory_valuation_accounts AS account
    WHERE account.tenant_id = v_invoice.tenant_id
      AND stock.tenant_id = account.tenant_id
      AND stock.branch_id = account.branch_id
      AND stock.location_id = account.location_id
      AND stock.ingredient_id = account.ingredient_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'status',
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.supplier_invoice_receipt_allocations AS allocation
          WHERE allocation.tenant_id = v_invoice.tenant_id
            AND allocation.supplier_invoice_id = p_invoice_id
            AND allocation.valuation_status = 'settled_current_period'
        ) THEN 'settled_current_period'
        ELSE 'settled'
      END,
    'provisional_value', v_total_provisional,
    'final_net_value', v_total_final,
    'warning', v_warning
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_supplier_invoice_valuation_summary(
  p_invoice_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_kind text;
  v_status text;
  v_provisional numeric(20,2);
  v_final numeric(20,2);
  v_warning boolean;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (
    public.has_permission_any('procurement:invoice_match')
    OR public.has_permission_any('inventory:valuation_read')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT invoice.invoice_kind
  INTO v_kind
  FROM public.supplier_invoices AS invoice
  WHERE invoice.id = p_invoice_id
    AND invoice.tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_kind = 'service' THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'not_applicable',
      'provisionalValue', 0,
      'finalNetValue', 0,
      'inventoryAdjustment', 0,
      'productionInventoryAdjustment', 0,
      'foodCostVariance', 0,
      'wasteVariance', 0,
      'supplierReturnVariance', 0,
      'currentPeriodVariance', 0,
      'warning', FALSE
    );
  END IF;

  SELECT
    CASE
      WHEN pg_catalog.bool_or(
        allocation.valuation_status = 'settled_current_period'
      ) THEN 'settled_current_period'
      WHEN pg_catalog.bool_and(allocation.valuation_status = 'settled')
        THEN 'settled'
      ELSE 'not_applicable'
    END,
    coalesce(pg_catalog.sum(
      allocation.confirmed_net_inventory_amount - event.value_delta
    ), 0),
    coalesce(pg_catalog.sum(allocation.confirmed_net_inventory_amount), 0)
  INTO v_status, v_provisional, v_final
  FROM public.supplier_invoice_receipt_allocations AS allocation
  LEFT JOIN public.inventory_valuation_events AS event
    ON event.id = allocation.valuation_event_id
   AND event.tenant_id = allocation.tenant_id
  WHERE allocation.tenant_id = v_tenant
    AND allocation.supplier_invoice_id = p_invoice_id;

  SELECT coalesce(pg_catalog.bool_or(
    pg_catalog.abs(event.value_delta) >= settings.variance_warning_amount
    OR (
      allocation.confirmed_net_inventory_amount - event.value_delta > 0
      AND pg_catalog.abs(event.value_delta) * 100
        / (
          allocation.confirmed_net_inventory_amount - event.value_delta
        ) >= settings.variance_warning_percent
    )
  ), FALSE)
  INTO v_warning
  FROM public.inventory_valuation_events AS event
  JOIN public.supplier_invoice_receipt_allocations AS allocation
    ON allocation.valuation_event_id = event.id
   AND allocation.tenant_id = event.tenant_id
  JOIN public.inventory_valuation_settings AS settings
    ON settings.tenant_id = event.tenant_id
  WHERE event.tenant_id = v_tenant
    AND event.source_invoice_id = p_invoice_id;

  RETURN pg_catalog.jsonb_build_object(
    'status', coalesce(v_status, 'not_applicable'),
    'provisionalValue', v_provisional,
    'finalNetValue', v_final,
    'inventoryAdjustment', coalesce((
      SELECT pg_catalog.sum(value_allocation.allocated_value)
      FROM public.inventory_value_allocations AS value_allocation
      JOIN public.inventory_valuation_events AS event
        ON event.id = value_allocation.valuation_event_id
       AND event.tenant_id = value_allocation.tenant_id
      WHERE event.tenant_id = v_tenant
        AND event.source_invoice_id = p_invoice_id
        AND value_allocation.allocation_bucket IN (
          'inventory',
          'transfer_holder'
        )
    ), 0),
    'productionInventoryAdjustment', coalesce((
      SELECT pg_catalog.sum(value_allocation.allocated_value)
      FROM public.inventory_value_allocations AS value_allocation
      JOIN public.inventory_valuation_events AS event
        ON event.id = value_allocation.valuation_event_id
       AND event.tenant_id = value_allocation.tenant_id
      WHERE event.tenant_id = v_tenant
        AND event.source_invoice_id = p_invoice_id
        AND value_allocation.allocation_bucket = 'production_inventory'
    ), 0),
    'foodCostVariance', coalesce((
      SELECT pg_catalog.sum(value_allocation.allocated_value)
      FROM public.inventory_value_allocations AS value_allocation
      JOIN public.inventory_valuation_events AS event
        ON event.id = value_allocation.valuation_event_id
       AND event.tenant_id = value_allocation.tenant_id
      WHERE event.tenant_id = v_tenant
        AND event.source_invoice_id = p_invoice_id
        AND value_allocation.allocation_bucket = 'food_cost'
    ), 0),
    'wasteVariance', coalesce((
      SELECT pg_catalog.sum(value_allocation.allocated_value)
      FROM public.inventory_value_allocations AS value_allocation
      JOIN public.inventory_valuation_events AS event
        ON event.id = value_allocation.valuation_event_id
       AND event.tenant_id = value_allocation.tenant_id
      WHERE event.tenant_id = v_tenant
        AND event.source_invoice_id = p_invoice_id
        AND value_allocation.allocation_bucket IN (
          'waste',
          'stocktake_loss',
          'transfer_loss'
        )
    ), 0),
    'supplierReturnVariance', coalesce((
      SELECT pg_catalog.sum(value_allocation.allocated_value)
      FROM public.inventory_value_allocations AS value_allocation
      JOIN public.inventory_valuation_events AS event
        ON event.id = value_allocation.valuation_event_id
       AND event.tenant_id = value_allocation.tenant_id
      WHERE event.tenant_id = v_tenant
        AND event.source_invoice_id = p_invoice_id
        AND value_allocation.allocation_bucket = 'supplier_return'
    ), 0),
    'currentPeriodVariance', coalesce((
      SELECT pg_catalog.sum(value_allocation.allocated_value)
      FROM public.inventory_value_allocations AS value_allocation
      JOIN public.inventory_valuation_events AS event
        ON event.id = value_allocation.valuation_event_id
       AND event.tenant_id = value_allocation.tenant_id
      WHERE event.tenant_id = v_tenant
        AND event.source_invoice_id = p_invoice_id
        AND value_allocation.allocation_bucket IN (
          'legacy_purchase_price_variance',
          'rounding'
        )
    ), 0),
    'warning', v_warning
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_supplier_invoice(
  p_invoice_id bigint,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_invoice public.supplier_invoices%ROWTYPE;
  v_result jsonb;
  v_valuation jsonb;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('procurement:invoice_match') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'supplier_invoice_confirm_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT invoice.*
  INTO v_invoice
  FROM public.supplier_invoices AS invoice
  WHERE invoice.id = p_invoice_id
    AND invoice.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_invoice.document_status = 'confirmed' THEN
    v_valuation := public.get_supplier_invoice_valuation_summary(p_invoice_id);
    RETURN pg_catalog.jsonb_build_object(
      'invoice_id', p_invoice_id,
      'document_status', 'confirmed',
      'matching_status', v_invoice.matching_status,
      'valuation', v_valuation
    );
  END IF;
  IF v_invoice.document_status <> 'draft' THEN
    RAISE EXCEPTION 'supplier_invoice_not_confirmable'
      USING ERRCODE = '23514';
  END IF;

  v_result := private.apply_supplier_invoice_matching(p_invoice_id);
  IF v_result->>'matching_status' <> 'matched' THEN
    RAISE EXCEPTION 'supplier_invoice_not_matched'
      USING ERRCODE = '23514';
  END IF;
  IF v_invoice.invoice_kind = 'service'
     AND v_invoice.service_verified_at IS NULL THEN
    RAISE EXCEPTION 'service_invoice_not_verified'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.supplier_invoices
  SET confirmed_by = v_uid
  WHERE id = p_invoice_id
    AND tenant_id = v_tenant;
  v_invoice.confirmed_by := v_uid;

  v_valuation := private.settle_supplier_invoice_valuation(
    p_invoice_id,
    p_idempotency_key
  );

  UPDATE public.supplier_invoices
  SET document_status = 'confirmed',
      confirmed_at = pg_catalog.now(),
      confirmed_by = v_uid,
      updated_at = pg_catalog.now()
  WHERE id = p_invoice_id
    AND tenant_id = v_tenant;

  INSERT INTO public.supplier_ingredient_price_history (
    tenant_id,
    supplier_id,
    ingredient_id,
    unit_id,
    unit_price,
    effective_net_unit_price,
    supplier_invoice_id,
    supplier_invoice_line_id,
    confirmed_at,
    created_by
  )
  SELECT
    v_tenant,
    v_invoice.supplier_id,
    line.ingredient_id,
    line.unit_id,
    CASE
      WHEN line.quantity > 0
        THEN pg_catalog.round(
          (
            line.line_total - line.allocated_document_discount
          ) / line.quantity,
          8
        )
      ELSE 0
    END,
    CASE
      WHEN line.quantity > 0
        THEN pg_catalog.round(
          (
            line.line_total - line.allocated_document_discount
          ) / line.quantity,
          8
        )
      ELSE 0
    END,
    p_invoice_id,
    line.id,
    pg_catalog.now(),
    v_uid
  FROM public.supplier_invoice_lines AS line
  WHERE line.tenant_id = v_tenant
    AND line.supplier_invoice_id = p_invoice_id
    AND line.ingredient_id IS NOT NULL
    AND line.unit_id IS NOT NULL
  ON CONFLICT (supplier_invoice_line_id) DO NOTHING;

  PERFORM public.log_audit(
    'supplier_invoice.confirmed',
    'supplier_invoice',
    p_invoice_id,
    pg_catalog.jsonb_build_object('document_status', 'draft'),
    pg_catalog.jsonb_build_object(
      'document_status', 'confirmed',
      'matching_status', v_result->>'matching_status',
      'valuation', v_valuation
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'invoice_id', p_invoice_id,
    'document_status', 'confirmed',
    'matching_status', v_result->>'matching_status',
    'valuation', v_valuation
  );
END;
$$;

REVOKE ALL ON FUNCTION
  private.propagate_inventory_origin_reprice(
    bigint,
    bigint,
    bigint,
    numeric,
    text,
    integer
  ),
  private.settle_supplier_invoice_valuation(bigint, uuid)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  public.get_supplier_invoice_valuation_summary(bigint)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.get_supplier_invoice_valuation_summary(bigint)
TO authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.confirm_supplier_invoice(bigint, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.confirm_supplier_invoice(bigint, uuid)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.apply_latest_supplier_price_to_grn_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_supplier_id bigint;
  v_unit_price numeric(24,8);
BEGIN
  SELECT grn.supplier_id
  INTO v_supplier_id
  FROM public.goods_received_notes AS grn
  WHERE grn.id = NEW.grn_id
    AND grn.tenant_id = NEW.tenant_id;

  SELECT history.effective_net_unit_price
  INTO v_unit_price
  FROM public.supplier_ingredient_price_history AS history
  WHERE history.tenant_id = NEW.tenant_id
    AND history.supplier_id = v_supplier_id
    AND history.ingredient_id = NEW.ingredient_id
    AND history.unit_id = NEW.entry_unit_id
  ORDER BY history.confirmed_at DESC, history.id DESC
  LIMIT 1;

  IF v_unit_price IS NOT NULL THEN
    NEW.unit_cost := v_unit_price;
    NEW.cost_pending := FALSE;
    NEW.provisional_cost_source := 'invoice';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.apply_latest_supplier_price_to_grn_line()
FROM PUBLIC, anon, authenticated;
