-- ADR 0026 & ADR 0040: Universal Shortfall Synthesis for Resilient Inventory Valuation.
-- Prevents 23514 (inventory_valuation_insufficient_quantity) on ALL negative movements
-- (kitchen production consumption, waste, issues, returns, stocktake adjustments, and sales)
-- by synthesizing an inventory_shortfall cost origin instead of throwing an unhandled exception.

-- 1. Extend cost origin source kind constraint to include inventory_shortfall
ALTER TABLE public.inventory_cost_origins
  DROP CONSTRAINT IF EXISTS inventory_cost_origins_source_kind_check;

ALTER TABLE public.inventory_cost_origins
  ADD CONSTRAINT inventory_cost_origins_source_kind_check
  CHECK (
    source_kind = ANY (
      ARRAY[
        'opening'::text,
        'grn_receipt'::text,
        'stocktake_found'::text,
        'production_output'::text,
        'pos_sale_shortfall'::text,
        'transfer_shortfall'::text,
        'inventory_shortfall'::text
      ]
    )
  );

COMMENT ON CONSTRAINT inventory_cost_origins_source_kind_check
  ON public.inventory_cost_origins IS
  'Cost origin sources; shortfall origins book ADR 0026 post-and-flag oversell for all operational movements.';

-- 2. Update reprice_zero_value_origins to support all shortfall source kinds
CREATE OR REPLACE FUNCTION private.reprice_zero_value_origins(
  p_tenant_id bigint,
  p_ingredient_id bigint
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_origin public.inventory_cost_origins%ROWTYPE;
  v_unit numeric(24, 8);
  v_new numeric(20, 2);
  v_delta numeric(20, 2);
  v_event_id bigint;
  v_now timestamptz := pg_catalog.now();
  v_year integer;
  v_month integer;
  v_count integer := 0;
BEGIN
  v_year := extract(YEAR FROM v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer;
  v_month := extract(MONTH FROM v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer;

  FOR v_origin IN
    SELECT origin.*
    FROM public.inventory_cost_origins AS origin
    WHERE origin.tenant_id = p_tenant_id
      AND origin.ingredient_id = p_ingredient_id
      AND origin.source_kind IN (
        'grn_receipt',
        'pos_sale_shortfall',
        'transfer_shortfall',
        'inventory_shortfall'
      )
      AND origin.cost_status IN ('pending', 'provisional')
      AND coalesce(origin.provisional_value, 0) = 0
      AND origin.original_quantity > 0
    ORDER BY origin.id
    FOR UPDATE
  LOOP
    v_unit := private.ingredient_provisional_unit_cost(
      p_tenant_id,
      p_ingredient_id
    );
    IF v_unit IS NULL OR v_unit <= 0 THEN
      CONTINUE;
    END IF;

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
      p_tenant_id,
      p_ingredient_id,
      'provisional_reprice',
      0,
      v_delta,
      v_now,
      v_year,
      v_month,
      pg_catalog.md5(
        'provisional-reprice:'
          || p_tenant_id::text || ':'
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
      WHERE event.tenant_id = p_tenant_id
        AND event.idempotency_key = pg_catalog.md5(
          'provisional-reprice:'
            || p_tenant_id::text || ':'
            || v_origin.id::text || ':'
            || v_new::text
        )::uuid;
    END IF;

    PERFORM private.propagate_inventory_origin_reprice(
      p_tenant_id,
      v_event_id,
      v_origin.id,
      v_delta
    );

    UPDATE public.inventory_cost_origins
    SET provisional_value = v_new,
        cost_status = 'provisional'
    WHERE id = v_origin.id
      AND tenant_id = p_tenant_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 3. Replace post_stock_movement_valuation with universal shortfall handling
CREATE OR REPLACE FUNCTION private.post_stock_movement_valuation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_mode text;
  v_account public.inventory_valuation_accounts%ROWTYPE;
  v_event_id bigint;
  v_origin_id bigint;
  v_balance record;
  v_to_balance_id bigint;
  v_derived_origin_id bigint;
  v_quantity numeric(20,3) := pg_catalog.abs(NEW.quantity_change);
  v_value numeric(20,2);
  v_fraction numeric(24,12);
  v_alloc_quantity numeric(20,3);
  v_alloc_value numeric(20,2);
  v_remaining_quantity numeric(20,3);
  v_remaining_value numeric(20,2);
  v_holder_quantity numeric(20,3);
  v_holder_value numeric(20,2);
  v_holder_id bigint;
  v_original_event_id bigint;
  v_original_quantity numeric(20,3);
  v_original_value numeric(20,2);
  v_balance_count integer;
  v_position integer;
  v_source_kind text;
  v_event_type text;
  v_terminal_bucket text;
  v_year integer;
  v_month integer;
  v_covered_quantity numeric(20,3);
  v_shortfall_quantity numeric(20,3);
  v_shortfall_value numeric(20,2);
  v_idempotency_key uuid :=
    pg_catalog.md5('stock-movement:' || NEW.id::text)::uuid;
BEGIN
  v_mode := private.inventory_valuation_mode(NEW.tenant_id);
  IF v_mode = 'inactive' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_valuation_events AS event
    WHERE event.tenant_id = NEW.tenant_id
      AND event.idempotency_key = v_idempotency_key
  ) THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.quantity_change, 0) = 0 THEN
    RETURN NEW;
  END IF;

  v_year := extract(
    YEAR FROM NEW.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )::integer;
  v_month := extract(
    MONTH FROM NEW.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )::integer;

  v_account := private.ensure_inventory_valuation_account(
    NEW.tenant_id,
    NEW.branch_id,
    NEW.location_id,
    NEW.ingredient_id
  );

  IF NEW.type = 'transfer_in' THEN
    SELECT item.id
    INTO v_holder_id
    FROM public.stock_transfer_items AS item
    WHERE item.tenant_id = NEW.tenant_id
      AND item.transfer_id = NEW.transfer_id
      AND item.ingredient_id = NEW.ingredient_id;
    IF v_holder_id IS NULL THEN
      RAISE EXCEPTION 'transfer_valuation_holder_missing'
        USING ERRCODE = '23514';
    END IF;

    PERFORM balance.id
    FROM public.inventory_origin_balances AS balance
    JOIN public.inventory_cost_origins AS origin
      ON origin.id = balance.origin_id
     AND origin.tenant_id = balance.tenant_id
    WHERE balance.tenant_id = NEW.tenant_id
      AND balance.holder_kind = 'transfer_item'
      AND balance.holder_id = v_holder_id
      AND origin.ingredient_id = NEW.ingredient_id
    ORDER BY balance.origin_id
    FOR UPDATE OF balance;

    SELECT
      coalesce(pg_catalog.sum(balance.quantity), 0),
      coalesce(pg_catalog.sum(balance.book_value), 0)
    INTO v_holder_quantity, v_holder_value
    FROM public.inventory_origin_balances AS balance
    JOIN public.inventory_cost_origins AS origin
      ON origin.id = balance.origin_id
     AND origin.tenant_id = balance.tenant_id
    WHERE balance.tenant_id = NEW.tenant_id
      AND balance.holder_kind = 'transfer_item'
      AND balance.holder_id = v_holder_id
      AND origin.ingredient_id = NEW.ingredient_id;

    IF v_holder_quantity < v_quantity OR v_holder_quantity <= 0 THEN
      v_shortfall_quantity := v_quantity - greatest(0::numeric, coalesce(v_holder_quantity, 0));
      v_shortfall_value := pg_catalog.round(
        v_shortfall_quantity * coalesce(
          NULLIF(NEW.unit_cost, 0),
          private.ingredient_provisional_unit_cost(NEW.tenant_id, NEW.ingredient_id),
          0
        ),
        2
      );

      v_origin_id := private.create_inventory_cost_origin(
        NEW.tenant_id,
        NEW.ingredient_id,
        'transfer_shortfall',
        v_holder_id,
        NULL,
        v_shortfall_quantity,
        v_shortfall_value,
        NEW.created_at,
        CASE WHEN v_shortfall_value > 0 THEN 'provisional' ELSE 'pending' END
      );

      INSERT INTO public.inventory_origin_balances (
        tenant_id,
        origin_id,
        holder_kind,
        holder_id,
        quantity,
        book_value
      )
      VALUES (
        NEW.tenant_id,
        v_origin_id,
        'transfer_item',
        v_holder_id,
        v_shortfall_quantity,
        v_shortfall_value
      )
      ON CONFLICT (
        tenant_id,
        origin_id,
        holder_kind,
        holder_id
      ) WHERE holder_kind IN ('transfer_item', 'production_run')
      DO UPDATE SET
        quantity = public.inventory_origin_balances.quantity + EXCLUDED.quantity,
        book_value = public.inventory_origin_balances.book_value + EXCLUDED.book_value,
        updated_at = pg_catalog.now();

      v_holder_quantity := v_holder_quantity + v_shortfall_quantity;
      v_holder_value := v_holder_value + v_shortfall_value;
    END IF;

    v_fraction := v_quantity / v_holder_quantity;
    v_value := CASE
      WHEN v_quantity = v_holder_quantity THEN v_holder_value
      ELSE pg_catalog.round(v_holder_value * v_fraction, 2)
    END;

    INSERT INTO public.inventory_valuation_events (
      tenant_id,
      ingredient_id,
      event_type,
      stock_movement_id,
      to_account_id,
      quantity_delta,
      value_delta,
      effective_at,
      posting_year,
      posting_month,
      idempotency_key,
      created_by,
      metadata
    )
    VALUES (
      NEW.tenant_id,
      NEW.ingredient_id,
      'transfer_receive',
      NEW.id,
      v_account.id,
      v_quantity,
      v_value,
      NEW.created_at,
      v_year,
      v_month,
      v_idempotency_key,
      NEW.created_by,
      pg_catalog.jsonb_build_object(
        'transfer_id', NEW.transfer_id,
        'transfer_item_id', v_holder_id
      )
    )
    RETURNING id INTO v_event_id;

    SELECT pg_catalog.count(*)
    INTO v_balance_count
    FROM public.inventory_origin_balances AS balance
    JOIN public.inventory_cost_origins AS origin
      ON origin.id = balance.origin_id
     AND origin.tenant_id = balance.tenant_id
    WHERE balance.tenant_id = NEW.tenant_id
      AND balance.holder_kind = 'transfer_item'
      AND balance.holder_id = v_holder_id
      AND origin.ingredient_id = NEW.ingredient_id
      AND balance.quantity > 0;

    v_position := 0;
    v_remaining_quantity := v_quantity;
    v_remaining_value := v_value;

    FOR v_balance IN
      SELECT
        balance.id,
        balance.origin_id,
        balance.quantity,
        balance.book_value
      FROM public.inventory_origin_balances AS balance
      JOIN public.inventory_cost_origins AS origin
        ON origin.id = balance.origin_id
       AND origin.tenant_id = balance.tenant_id
      WHERE balance.tenant_id = NEW.tenant_id
        AND balance.holder_kind = 'transfer_item'
        AND balance.holder_id = v_holder_id
        AND origin.ingredient_id = NEW.ingredient_id
        AND balance.quantity > 0
      ORDER BY balance.origin_id
      FOR UPDATE OF balance
    LOOP
      v_position := v_position + 1;
      IF v_position = v_balance_count THEN
        v_alloc_quantity := greatest(0::numeric, least(v_remaining_quantity, v_balance.quantity));
        v_alloc_value := greatest(0::numeric, least(v_remaining_value, v_balance.book_value));
      ELSE
        v_alloc_quantity := greatest(
          0::numeric,
          least(
            v_remaining_quantity,
            least(
              v_balance.quantity,
              pg_catalog.round(v_balance.quantity * v_fraction, 3)
            )
          )
        );
        v_alloc_value := greatest(
          0::numeric,
          least(
            v_remaining_value,
            least(
              v_balance.book_value,
              pg_catalog.round(v_balance.book_value * v_fraction, 2)
            )
          )
        );
      END IF;

      UPDATE public.inventory_origin_balances
      SET quantity = greatest(0::numeric, quantity - v_alloc_quantity),
          book_value = greatest(0::numeric, book_value - v_alloc_value),
          updated_at = pg_catalog.now()
      WHERE id = v_balance.id;

      INSERT INTO public.inventory_origin_balances (
        tenant_id,
        origin_id,
        holder_kind,
        valuation_account_id,
        quantity,
        book_value
      )
      VALUES (
        NEW.tenant_id,
        v_balance.origin_id,
        'stock_pool',
        v_account.id,
        v_alloc_quantity,
        v_alloc_value
      )
      ON CONFLICT (
        tenant_id,
        origin_id,
        valuation_account_id
      ) WHERE holder_kind = 'stock_pool'
      DO UPDATE SET
        quantity = public.inventory_origin_balances.quantity
          + EXCLUDED.quantity,
        book_value = public.inventory_origin_balances.book_value
          + EXCLUDED.book_value,
        updated_at = pg_catalog.now()
      RETURNING id INTO v_to_balance_id;

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
        NEW.tenant_id,
        v_event_id,
        v_balance.origin_id,
        v_to_balance_id,
        'inventory',
        v_alloc_quantity,
        v_alloc_value,
        CASE
          WHEN v_balance.quantity > 0 THEN v_alloc_quantity / v_balance.quantity
          ELSE 1
        END
      );

      v_remaining_quantity := v_remaining_quantity - v_alloc_quantity;
      v_remaining_value := v_remaining_value - v_alloc_value;
    END LOOP;

    UPDATE public.inventory_valuation_accounts
    SET quantity = quantity + v_quantity,
        book_value = book_value + v_value,
        valuation_version = valuation_version + 1,
        updated_at = pg_catalog.now()
    WHERE id = v_account.id;

  ELSIF NEW.type = 'refund_restore' THEN
    SELECT event.id, event.quantity_delta, event.value_delta
    INTO v_original_event_id, v_original_quantity, v_original_value
    FROM public.inventory_valuation_events AS event
    JOIN public.stock_movements AS original_movement
      ON original_movement.id = event.stock_movement_id
     AND original_movement.tenant_id = event.tenant_id
    WHERE event.tenant_id = NEW.tenant_id
      AND original_movement.order_id = NEW.order_id
      AND original_movement.ingredient_id = NEW.ingredient_id
      AND original_movement.location_id = NEW.location_id
      AND event.event_type = 'pos_sale'
    ORDER BY event.id DESC
    LIMIT 1;

    IF v_original_event_id IS NULL
       OR v_original_quantity <= 0
       OR v_quantity > v_original_quantity THEN
      RAISE EXCEPTION 'refund_valuation_lineage_invalid'
        USING ERRCODE = '23514';
    END IF;

    v_fraction := v_quantity / v_original_quantity;
    v_value := CASE
      WHEN v_quantity = v_original_quantity THEN v_original_value
      ELSE pg_catalog.round(v_original_value * v_fraction, 2)
    END;

    INSERT INTO public.inventory_valuation_events (
      tenant_id,
      ingredient_id,
      event_type,
      stock_movement_id,
      to_account_id,
      quantity_delta,
      value_delta,
      effective_at,
      posting_year,
      posting_month,
      idempotency_key,
      created_by,
      metadata
    )
    VALUES (
      NEW.tenant_id,
      NEW.ingredient_id,
      'refund_restore',
      NEW.id,
      v_account.id,
      v_quantity,
      v_value,
      NEW.created_at,
      v_year,
      v_month,
      v_idempotency_key,
      NEW.created_by,
      pg_catalog.jsonb_build_object(
        'order_id', NEW.order_id,
        'original_valuation_event_id', v_original_event_id
      )
    )
    RETURNING id INTO v_event_id;

    SELECT pg_catalog.count(*)
    INTO v_balance_count
    FROM public.inventory_value_allocations AS allocation
    WHERE allocation.tenant_id = NEW.tenant_id
      AND allocation.valuation_event_id = v_original_event_id;

    v_position := 0;
    v_remaining_quantity := v_quantity;
    v_remaining_value := v_value;

    FOR v_balance IN
      SELECT
        allocation.source_origin_id AS origin_id,
        allocation.allocated_quantity AS quantity,
        allocation.allocated_value AS book_value
      FROM public.inventory_value_allocations AS allocation
      WHERE allocation.tenant_id = NEW.tenant_id
        AND allocation.valuation_event_id = v_original_event_id
      ORDER BY allocation.id
    LOOP
      v_position := v_position + 1;
      IF v_position = v_balance_count THEN
        v_alloc_quantity := v_remaining_quantity;
        v_alloc_value := v_remaining_value;
      ELSE
        v_alloc_quantity := pg_catalog.least(
          v_remaining_quantity,
          pg_catalog.round(v_balance.quantity * v_fraction, 3)
        );
        v_alloc_value := pg_catalog.least(
          v_remaining_value,
          pg_catalog.round(v_balance.book_value * v_fraction, 2)
        );
      END IF;

      INSERT INTO public.inventory_origin_balances (
        tenant_id,
        origin_id,
        holder_kind,
        valuation_account_id,
        quantity,
        book_value
      )
      VALUES (
        NEW.tenant_id,
        v_balance.origin_id,
        'stock_pool',
        v_account.id,
        v_alloc_quantity,
        v_alloc_value
      )
      ON CONFLICT (
        tenant_id,
        origin_id,
        valuation_account_id
      ) WHERE holder_kind = 'stock_pool'
      DO UPDATE SET
        quantity = public.inventory_origin_balances.quantity
          + EXCLUDED.quantity,
        book_value = public.inventory_origin_balances.book_value
          + EXCLUDED.book_value,
        updated_at = pg_catalog.now()
      RETURNING id INTO v_to_balance_id;

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
        NEW.tenant_id,
        v_event_id,
        v_balance.origin_id,
        v_to_balance_id,
        'inventory',
        v_alloc_quantity,
        v_alloc_value,
        CASE
          WHEN v_balance.quantity > 0 THEN v_alloc_quantity / v_balance.quantity
          ELSE 1
        END
      );

      v_remaining_quantity := v_remaining_quantity - v_alloc_quantity;
      v_remaining_value := v_remaining_value - v_alloc_value;
    END LOOP;

    UPDATE public.inventory_valuation_accounts
    SET quantity = quantity + v_quantity,
        book_value = book_value + v_value,
        valuation_version = valuation_version + 1,
        updated_at = pg_catalog.now()
    WHERE id = v_account.id;

  ELSIF NEW.quantity_change > 0 THEN
    IF NEW.type = 'grn_receipt' AND coalesce(NEW.unit_cost, 0) = 0 THEN
      v_value := pg_catalog.round(
        v_quantity * coalesce(
          private.ingredient_provisional_unit_cost(
            NEW.tenant_id,
            NEW.ingredient_id
          ),
          0
        ),
        2
      );
    ELSE
      v_value := pg_catalog.round(v_quantity * coalesce(NEW.unit_cost, 0), 2);
    END IF;
    v_source_kind := CASE
      WHEN NEW.type = 'grn_receipt' THEN 'grn_receipt'
      ELSE 'stocktake_found'
    END;
    v_event_type := CASE
      WHEN NEW.type = 'grn_receipt' THEN 'receipt'
      ELSE 'stocktake_gain'
    END;

    v_origin_id := private.create_inventory_cost_origin(
      NEW.tenant_id,
      NEW.ingredient_id,
      v_source_kind,
      NEW.id,
      NEW.grn_item_id,
      v_quantity,
      v_value,
      NEW.created_at,
      CASE WHEN v_value > 0 THEN 'provisional' ELSE 'pending' END
    );

    INSERT INTO public.inventory_origin_balances (
      tenant_id,
      origin_id,
      holder_kind,
      valuation_account_id,
      quantity,
      book_value
    )
    VALUES (
      NEW.tenant_id,
      v_origin_id,
      'stock_pool',
      v_account.id,
      v_quantity,
      v_value
    )
    RETURNING id INTO v_to_balance_id;

    INSERT INTO public.inventory_valuation_events (
      tenant_id,
      ingredient_id,
      event_type,
      stock_movement_id,
      grn_item_id,
      to_account_id,
      quantity_delta,
      value_delta,
      effective_at,
      posting_year,
      posting_month,
      idempotency_key,
      created_by
    )
    VALUES (
      NEW.tenant_id,
      NEW.ingredient_id,
      v_event_type,
      NEW.id,
      NEW.grn_item_id,
      v_account.id,
      v_quantity,
      v_value,
      NEW.created_at,
      v_year,
      v_month,
      v_idempotency_key,
      NEW.created_by
    )
    RETURNING id INTO v_event_id;

    INSERT INTO public.inventory_value_allocations (
      tenant_id,
      valuation_event_id,
      source_origin_id,
      to_balance_id,
      allocated_quantity,
      allocated_value,
      allocation_fraction
    )
    VALUES (
      NEW.tenant_id,
      v_event_id,
      v_origin_id,
      v_to_balance_id,
      v_quantity,
      v_value,
      1
    );

    UPDATE public.inventory_valuation_accounts
    SET quantity = quantity + v_quantity,
        book_value = book_value + v_value,
        valuation_version = valuation_version + 1,
        updated_at = pg_catalog.now()
    WHERE id = v_account.id;

  ELSE
    -- Universal Shortfall Synthesis for all operational negative stock movements (ADR 0026 post-and-flag)
    IF (v_account.quantity < v_quantity OR v_account.quantity <= 0) THEN
      v_covered_quantity := GREATEST(
        0::numeric,
        LEAST(COALESCE(v_account.quantity, 0), v_quantity)
      );
      v_shortfall_quantity := v_quantity - v_covered_quantity;

      IF v_shortfall_quantity > 0 THEN
        v_shortfall_value := pg_catalog.round(
          v_shortfall_quantity * COALESCE(
            NULLIF(NEW.unit_cost, 0),
            private.ingredient_provisional_unit_cost(NEW.tenant_id, NEW.ingredient_id),
            0
          ),
          2
        );

        v_source_kind := CASE
          WHEN NEW.type = 'consumption' AND COALESCE(NEW.movement_subtype, '') = 'sale_consumption' THEN 'pos_sale_shortfall'
          ELSE 'inventory_shortfall'
        END;

        IF NOT EXISTS (
          SELECT 1
          FROM public.inventory_valuation_events AS event
          WHERE event.tenant_id = NEW.tenant_id
            AND event.idempotency_key = pg_catalog.md5(
              'stock-movement-shortfall-receive:' || NEW.id::text
            )::uuid
        ) THEN
          v_origin_id := private.create_inventory_cost_origin(
            NEW.tenant_id,
            NEW.ingredient_id,
            v_source_kind,
            NEW.id,
            NULL,
            v_shortfall_quantity,
            v_shortfall_value,
            NEW.created_at,
            CASE
              WHEN v_shortfall_value > 0 THEN 'provisional'
              ELSE 'pending'
            END
          );

          INSERT INTO public.inventory_origin_balances (
            tenant_id,
            origin_id,
            holder_kind,
            valuation_account_id,
            quantity,
            book_value
          )
          VALUES (
            NEW.tenant_id,
            v_origin_id,
            'stock_pool',
            v_account.id,
            v_shortfall_quantity,
            v_shortfall_value
          )
          ON CONFLICT (
            tenant_id,
            origin_id,
            valuation_account_id
          ) WHERE holder_kind = 'stock_pool'
          DO UPDATE SET
            quantity = public.inventory_origin_balances.quantity
              + EXCLUDED.quantity,
            book_value = public.inventory_origin_balances.book_value
              + EXCLUDED.book_value,
            updated_at = pg_catalog.now()
          RETURNING id INTO v_to_balance_id;

          INSERT INTO public.inventory_valuation_events (
            tenant_id,
            ingredient_id,
            event_type,
            stock_movement_id,
            to_account_id,
            quantity_delta,
            value_delta,
            effective_at,
            posting_year,
            posting_month,
            idempotency_key,
            created_by,
            metadata
          )
          VALUES (
            NEW.tenant_id,
            NEW.ingredient_id,
            'receipt',
            NEW.id,
            v_account.id,
            v_shortfall_quantity,
            v_shortfall_value,
            NEW.created_at,
            v_year,
            v_month,
            pg_catalog.md5(
              'stock-movement-shortfall-receive:' || NEW.id::text
            )::uuid,
            NEW.created_by,
            pg_catalog.jsonb_build_object(
              'source_kind', v_source_kind,
              'shortfall_quantity', v_shortfall_quantity,
              'covered_quantity', v_covered_quantity
            )
          )
          RETURNING id INTO v_event_id;

          INSERT INTO public.inventory_value_allocations (
            tenant_id,
            valuation_event_id,
            source_origin_id,
            to_balance_id,
            allocated_quantity,
            allocated_value,
            allocation_fraction
          )
          VALUES (
            NEW.tenant_id,
            v_event_id,
            v_origin_id,
            v_to_balance_id,
            v_shortfall_quantity,
            v_shortfall_value,
            1
          );

          UPDATE public.inventory_valuation_accounts
          SET quantity = quantity + v_shortfall_quantity,
              book_value = book_value + v_shortfall_value,
              valuation_version = valuation_version + 1,
              updated_at = pg_catalog.now()
          WHERE id = v_account.id
          RETURNING * INTO v_account;
        ELSE
          SELECT *
          INTO v_account
          FROM public.inventory_valuation_accounts
          WHERE id = v_account.id;
        END IF;
      END IF;
    END IF;

    IF v_account.quantity <= 0 THEN
      v_fraction := 1;
      v_value := 0;
    ELSE
      v_fraction := least(1::numeric, v_quantity / v_account.quantity);
      v_value := CASE
        WHEN v_quantity >= v_account.quantity THEN v_account.book_value
        ELSE pg_catalog.round(v_account.book_value * v_fraction, 2)
      END;
    END IF;

    v_event_type := CASE NEW.type
      WHEN 'transfer_out' THEN 'transfer_out'
      WHEN 'production_consumption' THEN 'production_input'
      WHEN 'supplier_return' THEN 'supplier_return'
      WHEN 'count_adjustment' THEN 'stocktake_loss'
      ELSE 'issue'
    END;
    v_terminal_bucket := CASE
      WHEN NEW.type = 'consumption'
        AND NEW.movement_subtype IN (
          'storage_loss',
          'writeoff',
          'cancelled_after_kds_ready'
        ) THEN 'waste'
      WHEN NEW.type = 'consumption' THEN 'food_cost'
      WHEN NEW.type = 'supplier_return' THEN 'supplier_return'
      WHEN NEW.type = 'count_adjustment' THEN 'waste'
      ELSE 'food_cost'
    END;

    IF NEW.type = 'transfer_out' THEN
      SELECT item.id
      INTO v_holder_id
      FROM public.stock_transfer_items AS item
      WHERE item.tenant_id = NEW.tenant_id
        AND item.transfer_id = NEW.transfer_id
        AND item.ingredient_id = NEW.ingredient_id;
      IF v_holder_id IS NULL THEN
        RAISE EXCEPTION 'transfer_valuation_holder_missing'
          USING ERRCODE = '23514';
      END IF;
    ELSIF NEW.type = 'production_consumption' THEN
      v_holder_id := NEW.production_run_id;
      IF v_holder_id IS NULL THEN
        RAISE EXCEPTION 'production_valuation_holder_missing'
          USING ERRCODE = '23514';
      END IF;
    ELSE
      v_holder_id := NULL;
    END IF;

    INSERT INTO public.inventory_valuation_events (
      tenant_id,
      ingredient_id,
      event_type,
      stock_movement_id,
      from_account_id,
      quantity_delta,
      value_delta,
      effective_at,
      posting_year,
      posting_month,
      idempotency_key,
      created_by,
      metadata
    )
    VALUES (
      NEW.tenant_id,
      NEW.ingredient_id,
      v_event_type,
      NEW.id,
      v_account.id,
      v_quantity,
      v_value,
      NEW.created_at,
      v_year,
      v_month,
      v_idempotency_key,
      NEW.created_by,
      pg_catalog.jsonb_build_object(
        'transfer_id', NEW.transfer_id,
        'transfer_item_id', v_holder_id,
        'order_id', NEW.order_id,
        'movement_subtype', NEW.movement_subtype,
        'production_run_id', NEW.production_run_id
      )
    )
    RETURNING id INTO v_event_id;

    SELECT pg_catalog.count(*)
    INTO v_balance_count
    FROM public.inventory_origin_balances AS balance
    WHERE balance.tenant_id = NEW.tenant_id
      AND balance.valuation_account_id = v_account.id
      AND balance.holder_kind = 'stock_pool'
      AND balance.quantity > 0;

    v_position := 0;
    v_remaining_quantity := v_quantity;
    v_remaining_value := v_value;

    FOR v_balance IN
      SELECT
        balance.id,
        balance.origin_id,
        balance.quantity,
        balance.book_value
      FROM public.inventory_origin_balances AS balance
      WHERE balance.tenant_id = NEW.tenant_id
        AND balance.valuation_account_id = v_account.id
        AND balance.holder_kind = 'stock_pool'
        AND balance.quantity > 0
      ORDER BY balance.id
      FOR UPDATE
    LOOP
      v_position := v_position + 1;
      IF v_position = v_balance_count THEN
        v_alloc_quantity := greatest(0::numeric, least(v_remaining_quantity, v_balance.quantity));
        v_alloc_value := greatest(0::numeric, least(v_remaining_value, v_balance.book_value));
      ELSE
        v_alloc_quantity := greatest(
          0::numeric,
          least(
            v_remaining_quantity,
            least(
              v_balance.quantity,
              pg_catalog.round(v_balance.quantity * v_fraction, 3)
            )
          )
        );
        v_alloc_value := greatest(
          0::numeric,
          least(
            v_remaining_value,
            least(
              v_balance.book_value,
              pg_catalog.round(v_balance.book_value * v_fraction, 2)
            )
          )
        );
      END IF;

      UPDATE public.inventory_origin_balances
      SET quantity = greatest(0::numeric, quantity - v_alloc_quantity),
          book_value = greatest(0::numeric, book_value - v_alloc_value),
          updated_at = pg_catalog.now()
      WHERE id = v_balance.id;

      IF NEW.type IN ('transfer_out', 'production_consumption') THEN
        INSERT INTO public.inventory_origin_balances (
          tenant_id,
          origin_id,
          holder_kind,
          holder_id,
          quantity,
          book_value
        )
        VALUES (
          NEW.tenant_id,
          v_balance.origin_id,
          CASE
            WHEN NEW.type = 'transfer_out' THEN 'transfer_item'
            ELSE 'production_run'
          END,
          v_holder_id,
          v_alloc_quantity,
          v_alloc_value
        )
        ON CONFLICT (
          tenant_id,
          origin_id,
          holder_kind,
          holder_id
        ) WHERE holder_kind IN ('transfer_item', 'production_run')
        DO UPDATE SET
          quantity = public.inventory_origin_balances.quantity
            + EXCLUDED.quantity,
          book_value = public.inventory_origin_balances.book_value
            + EXCLUDED.book_value,
          updated_at = pg_catalog.now()
        RETURNING id INTO v_to_balance_id;
      ELSE
        v_to_balance_id := NULL;
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
        NEW.tenant_id,
        v_event_id,
        v_balance.origin_id,
        v_to_balance_id,
        CASE
          WHEN NEW.type = 'transfer_out' THEN 'transfer_holder'
          WHEN NEW.type = 'production_consumption' THEN 'production_inventory'
          ELSE v_terminal_bucket
        END,
        v_alloc_quantity,
        v_alloc_value,
        CASE
          WHEN v_balance.quantity > 0 THEN v_alloc_quantity / v_balance.quantity
          ELSE 1
        END
      );

      v_remaining_quantity := v_remaining_quantity - v_alloc_quantity;
      v_remaining_value := v_remaining_value - v_alloc_value;
    END LOOP;

    UPDATE public.inventory_valuation_accounts
    SET quantity = greatest(0::numeric, quantity - v_quantity),
        book_value = greatest(0::numeric, book_value - v_value),
        valuation_version = valuation_version + 1,
        updated_at = pg_catalog.now()
    WHERE id = v_account.id;
  END IF;

  IF v_mode = 'active' THEN
    PERFORM private.project_company_wac(NEW.tenant_id, NEW.ingredient_id);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.post_stock_movement_valuation() IS
  'ADR 0026 & ADR 0040: Universal resilient valuation posting. Synthesizes shortfall origins for unbacked inventory consumption across all movement types.';
