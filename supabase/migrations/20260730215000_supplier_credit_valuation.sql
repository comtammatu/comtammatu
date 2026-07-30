-- Append-only negative repricing for supplier credits applied after confirmation.

CREATE OR REPLACE FUNCTION private.post_supplier_credit_valuation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_credit public.supplier_credit_notes%ROWTYPE;
  v_invoice public.supplier_invoices%ROWTYPE;
  v_source record;
  v_total_basis numeric(20,2);
  v_invoice_inventory_basis numeric(20,2);
  v_net_inventory_credit numeric(20,2);
  v_remaining numeric(20,2);
  v_share numeric(20,2);
  v_position integer := 0;
  v_count integer;
  v_event_id bigint;
  v_event_key uuid;
  v_now timestamptz := pg_catalog.now();
BEGIN
  SELECT credit.*
  INTO v_credit
  FROM public.supplier_credit_notes AS credit
  WHERE credit.id = NEW.supplier_credit_note_id
    AND credit.tenant_id = NEW.tenant_id
  FOR UPDATE;
  SELECT invoice.*
  INTO v_invoice
  FROM public.supplier_invoices AS invoice
  WHERE invoice.id = NEW.supplier_invoice_id
    AND invoice.tenant_id = NEW.tenant_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_invoice.document_status NOT IN ('confirmed', 'adjusted')
     OR private.inventory_valuation_mode(NEW.tenant_id) = 'inactive' THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(pg_catalog.sum(
    allocation.confirmed_net_inventory_amount
  ), 0)
  INTO v_invoice_inventory_basis
  FROM public.supplier_invoice_receipt_allocations AS allocation
  WHERE allocation.tenant_id = NEW.tenant_id
    AND allocation.supplier_invoice_id = NEW.supplier_invoice_id;

  IF v_invoice_inventory_basis <= 0 OR v_invoice.total_amount <= 0 THEN
    RETURN NEW;
  END IF;
  v_net_inventory_credit := pg_catalog.round(
    NEW.amount
      * pg_catalog.least(
          1,
          v_invoice_inventory_basis / v_invoice.total_amount
        ),
    2
  );
  v_remaining := -v_net_inventory_credit;

  IF v_credit.return_id IS NOT NULL THEN
    SELECT
      pg_catalog.count(*),
      coalesce(pg_catalog.sum(source.returned_value), 0)
    INTO v_count, v_total_basis
    FROM (
      SELECT
        allocation.source_origin_id,
        pg_catalog.sum(allocation.allocated_value) AS returned_value
      FROM public.supplier_return_items AS return_item
      JOIN public.inventory_valuation_events AS event
        ON event.stock_movement_id = return_item.stock_movement_id
       AND event.tenant_id = return_item.tenant_id
       AND event.event_type = 'supplier_return'
      JOIN public.inventory_value_allocations AS allocation
        ON allocation.valuation_event_id = event.id
       AND allocation.tenant_id = event.tenant_id
      WHERE return_item.tenant_id = NEW.tenant_id
        AND return_item.return_id = v_credit.return_id
        AND allocation.source_origin_id IS NOT NULL
      GROUP BY allocation.source_origin_id
    ) AS source;

    IF v_total_basis <= 0 OR v_count = 0 THEN
      RAISE EXCEPTION 'supplier_credit_return_valuation_missing'
        USING ERRCODE = '23514';
    END IF;

    FOR v_source IN
      SELECT
        allocation.source_origin_id,
        origin.ingredient_id,
        pg_catalog.sum(allocation.allocated_value) AS returned_value
      FROM public.supplier_return_items AS return_item
      JOIN public.inventory_valuation_events AS return_event
        ON return_event.stock_movement_id = return_item.stock_movement_id
       AND return_event.tenant_id = return_item.tenant_id
       AND return_event.event_type = 'supplier_return'
      JOIN public.inventory_value_allocations AS allocation
        ON allocation.valuation_event_id = return_event.id
       AND allocation.tenant_id = return_event.tenant_id
      JOIN public.inventory_cost_origins AS origin
        ON origin.id = allocation.source_origin_id
       AND origin.tenant_id = allocation.tenant_id
      WHERE return_item.tenant_id = NEW.tenant_id
        AND return_item.return_id = v_credit.return_id
        AND allocation.source_origin_id IS NOT NULL
      GROUP BY allocation.source_origin_id, origin.ingredient_id
      ORDER BY allocation.source_origin_id
    LOOP
      v_position := v_position + 1;
      v_share := CASE
        WHEN v_position = v_count THEN v_remaining
        ELSE pg_catalog.round(
          -v_net_inventory_credit
            * v_source.returned_value
            / v_total_basis,
          2
        )
      END;
      v_remaining := v_remaining - v_share;
      v_event_key := pg_catalog.md5(
        'supplier-credit-valuation:'
          || NEW.id::text || ':' || v_source.source_origin_id::text
      )::uuid;

      INSERT INTO public.inventory_valuation_events (
        tenant_id,
        ingredient_id,
        event_type,
        terminal_bucket,
        source_invoice_id,
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
        NEW.tenant_id,
        v_source.ingredient_id,
        'credit_reprice',
        'supplier_return',
        NEW.supplier_invoice_id,
        0,
        v_share,
        v_now,
        extract(YEAR FROM v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer,
        extract(MONTH FROM v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer,
        v_event_key,
        pg_catalog.jsonb_build_object(
          'supplier_credit_allocation_id', NEW.id,
          'supplier_credit_note_id', NEW.supplier_credit_note_id,
          'supplier_return_id', v_credit.return_id
        ),
        v_credit.created_by
      )
      ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
      RETURNING id INTO v_event_id;

      IF v_event_id IS NOT NULL THEN
        INSERT INTO public.inventory_value_allocations (
          tenant_id,
          valuation_event_id,
          source_origin_id,
          allocation_bucket,
          allocated_quantity,
          allocated_value
        )
        VALUES (
          NEW.tenant_id,
          v_event_id,
          v_source.source_origin_id,
          'supplier_return',
          0,
          v_share
        );
      END IF;
    END LOOP;
  ELSE
    SELECT
      pg_catalog.count(*),
      coalesce(pg_catalog.sum(
        allocation.confirmed_net_inventory_amount
      ), 0)
    INTO v_count, v_total_basis
    FROM public.supplier_invoice_receipt_allocations AS allocation
    JOIN public.inventory_cost_origins AS origin
      ON origin.grn_item_id = allocation.grn_item_id
     AND origin.tenant_id = allocation.tenant_id
     AND origin.source_kind = 'grn_receipt'
    WHERE allocation.tenant_id = NEW.tenant_id
      AND allocation.supplier_invoice_id = NEW.supplier_invoice_id
      AND allocation.confirmed_net_inventory_amount > 0;

    IF v_total_basis <= 0 OR v_count = 0 THEN
      RETURN NEW;
    END IF;

    FOR v_source IN
      SELECT
        allocation.id AS invoice_allocation_id,
        allocation.invoice_line_id,
        allocation.confirmed_net_inventory_amount,
        origin.id AS origin_id,
        origin.ingredient_id
      FROM public.supplier_invoice_receipt_allocations AS allocation
      JOIN public.inventory_cost_origins AS origin
        ON origin.grn_item_id = allocation.grn_item_id
       AND origin.tenant_id = allocation.tenant_id
       AND origin.source_kind = 'grn_receipt'
      WHERE allocation.tenant_id = NEW.tenant_id
        AND allocation.supplier_invoice_id = NEW.supplier_invoice_id
        AND allocation.confirmed_net_inventory_amount > 0
      ORDER BY allocation.invoice_line_id, allocation.grn_item_id, allocation.id
    LOOP
      v_position := v_position + 1;
      v_share := CASE
        WHEN v_position = v_count THEN v_remaining
        ELSE pg_catalog.round(
          -v_net_inventory_credit
            * v_source.confirmed_net_inventory_amount
            / v_total_basis,
          2
        )
      END;
      v_remaining := v_remaining - v_share;
      v_event_key := pg_catalog.md5(
        'supplier-credit-valuation:'
          || NEW.id::text || ':' || v_source.invoice_allocation_id::text
      )::uuid;

      INSERT INTO public.inventory_valuation_events (
        tenant_id,
        ingredient_id,
        event_type,
        source_invoice_id,
        source_invoice_line_id,
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
        NEW.tenant_id,
        v_source.ingredient_id,
        'credit_reprice',
        NEW.supplier_invoice_id,
        v_source.invoice_line_id,
        0,
        v_share,
        v_now,
        extract(YEAR FROM v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer,
        extract(MONTH FROM v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer,
        v_event_key,
        pg_catalog.jsonb_build_object(
          'supplier_credit_allocation_id', NEW.id,
          'supplier_credit_note_id', NEW.supplier_credit_note_id
        ),
        v_credit.created_by
      )
      ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
      RETURNING id INTO v_event_id;

      IF v_event_id IS NOT NULL THEN
        PERFORM private.propagate_inventory_origin_reprice(
          NEW.tenant_id,
          v_event_id,
          v_source.origin_id,
          v_share
        );
      END IF;
    END LOOP;
  END IF;

  IF private.inventory_valuation_mode(NEW.tenant_id) = 'active' THEN
    UPDATE public.stock_levels AS stock
    SET avg_unit_cost = CASE
          WHEN account.quantity > 0
            THEN pg_catalog.round(account.book_value / account.quantity, 8)
          ELSE 0
        END,
        updated_at = pg_catalog.now()
    FROM public.inventory_valuation_accounts AS account
    WHERE account.tenant_id = NEW.tenant_id
      AND stock.tenant_id = account.tenant_id
      AND stock.branch_id = account.branch_id
      AND stock.location_id = account.location_id
      AND stock.ingredient_id = account.ingredient_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_supplier_credit_valuation
ON public.supplier_credit_allocations;
CREATE TRIGGER zz_supplier_credit_valuation
AFTER INSERT ON public.supplier_credit_allocations
FOR EACH ROW
EXECUTE FUNCTION private.post_supplier_credit_valuation();

REVOKE ALL ON FUNCTION private.post_supplier_credit_valuation()
FROM PUBLIC, anon, authenticated;
