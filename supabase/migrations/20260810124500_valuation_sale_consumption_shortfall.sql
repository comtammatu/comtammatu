-- ADR 0026 follow-up: allow valuation posting for POS sale_consumption shortfall.
-- Root cause: zz_inventory_valuation_posting → private.post_stock_movement_valuation()
-- still raised inventory_valuation_insufficient_quantity when the valuation account
-- had qty ≤ 0 / < need, rolling back stock_movements despite post-and-flag.

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
        'pos_sale_shortfall'::text
      ]
    )
  );

COMMENT ON CONSTRAINT inventory_cost_origins_source_kind_check
  ON public.inventory_cost_origins IS
  'Cost origin sources; pos_sale_shortfall books ADR 0026 post-and-flag oversell.';

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
      RAISE EXCEPTION 'transfer_valuation_quantity_missing'
        USING ERRCODE = '23514';
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
      created_by
    )
    VALUES (
      NEW.tenant_id,
      NEW.ingredient_id,
      'transfer_in',
      NEW.id,
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

    v_remaining_quantity := v_quantity;
    v_remaining_value := v_value;
    SELECT pg_catalog.count(*)
    INTO v_balance_count
    FROM public.inventory_origin_balances AS balance
    JOIN public.inventory_cost_origins AS origin
      ON origin.id = balance.origin_id
     AND origin.tenant_id = balance.tenant_id
    WHERE balance.tenant_id = NEW.tenant_id
      AND balance.holder_kind = 'transfer_item'
      AND balance.holder_id = v_holder_id
      AND balance.quantity > 0
      AND origin.ingredient_id = NEW.ingredient_id;
    v_position := 0;
    FOR v_balance IN
      SELECT
        balance.*
      FROM public.inventory_origin_balances AS balance
      JOIN public.inventory_cost_origins AS origin
        ON origin.id = balance.origin_id
       AND origin.tenant_id = balance.tenant_id
      WHERE balance.tenant_id = NEW.tenant_id
        AND balance.holder_kind = 'transfer_item'
        AND balance.holder_id = v_holder_id
        AND balance.quantity > 0
        AND origin.ingredient_id = NEW.ingredient_id
      ORDER BY balance.origin_id
      FOR UPDATE OF balance
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

      UPDATE public.inventory_origin_balances
      SET quantity = quantity - v_alloc_quantity,
          book_value = book_value - v_alloc_value,
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
        from_balance_id,
        to_balance_id,
        allocated_quantity,
        allocated_value,
        allocation_fraction
      )
      VALUES (
        NEW.tenant_id,
        v_event_id,
        v_balance.origin_id,
        v_balance.id,
        v_to_balance_id,
        v_alloc_quantity,
        v_alloc_value,
        v_fraction
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

  ELSIF NEW.type = 'production_output' THEN
    v_holder_id := NEW.production_run_id;
    IF v_holder_id IS NULL THEN
      RAISE EXCEPTION 'production_valuation_holder_missing'
        USING ERRCODE = '23514';
    END IF;

    PERFORM balance.id
    FROM public.inventory_origin_balances AS balance
    WHERE balance.tenant_id = NEW.tenant_id
      AND balance.holder_kind = 'production_run'
      AND balance.holder_id = v_holder_id
      AND balance.quantity > 0
    ORDER BY balance.origin_id
    FOR UPDATE;

    SELECT
      coalesce(pg_catalog.sum(balance.quantity), 0),
      coalesce(pg_catalog.sum(balance.book_value), 0)
    INTO v_holder_quantity, v_value
    FROM public.inventory_origin_balances AS balance
    WHERE balance.tenant_id = NEW.tenant_id
      AND balance.holder_kind = 'production_run'
      AND balance.holder_id = v_holder_id
      AND balance.quantity > 0;

    IF v_value <= 0 AND coalesce(NEW.unit_cost, 0) > 0 THEN
      v_value := pg_catalog.round(v_quantity * NEW.unit_cost, 2);
    END IF;

    v_derived_origin_id := private.create_inventory_cost_origin(
      NEW.tenant_id,
      NEW.ingredient_id,
      'production_output',
      NEW.id,
      NULL,
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
      v_derived_origin_id,
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
      'production_output',
      NEW.id,
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

    FOR v_balance IN
      SELECT balance.*
      FROM public.inventory_origin_balances AS balance
      WHERE balance.tenant_id = NEW.tenant_id
        AND balance.holder_kind = 'production_run'
        AND balance.holder_id = v_holder_id
        AND balance.quantity > 0
      ORDER BY balance.origin_id
      FOR UPDATE
    LOOP
      INSERT INTO public.inventory_value_allocations (
        tenant_id,
        valuation_event_id,
        source_origin_id,
        derived_origin_id,
        from_balance_id,
        to_balance_id,
        allocation_bucket,
        allocated_quantity,
        allocated_value
      )
      VALUES (
        NEW.tenant_id,
        v_event_id,
        v_balance.origin_id,
        v_derived_origin_id,
        v_balance.id,
        v_to_balance_id,
        'production_inventory',
        v_balance.quantity,
        v_balance.book_value
      );

      UPDATE public.inventory_origin_balances
      SET quantity = 0,
          book_value = 0,
          updated_at = pg_catalog.now()
      WHERE id = v_balance.id;
    END LOOP;

    UPDATE public.inventory_valuation_accounts
    SET quantity = quantity + v_quantity,
        book_value = book_value + v_value,
        valuation_version = valuation_version + 1,
        updated_at = pg_catalog.now()
    WHERE id = v_account.id;

  ELSIF NEW.type = 'refund_restore' THEN
    SELECT
      event.id,
      pg_catalog.abs(event.quantity_delta),
      pg_catalog.abs(event.value_delta)
    INTO
      v_original_event_id,
      v_original_quantity,
      v_original_value
    FROM public.inventory_valuation_events AS event
    JOIN public.stock_movements AS movement
      ON movement.id = event.stock_movement_id
     AND movement.tenant_id = event.tenant_id
    WHERE event.tenant_id = NEW.tenant_id
      AND movement.order_id = NEW.order_id
      AND movement.ingredient_id = NEW.ingredient_id
      AND movement.location_id = NEW.location_id
      AND movement.type = 'consumption'
      AND (
        movement.movement_subtype IS NULL
        OR movement.movement_subtype = 'sale_consumption'
      )
    ORDER BY event.id DESC
    LIMIT 1;

    IF v_original_event_id IS NULL
       OR v_original_quantity < v_quantity
       OR v_original_quantity <= 0 THEN
      RAISE EXCEPTION 'refund_restore_valuation_origin_missing'
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
      'issue_restore',
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
        'restores_valuation_event_id',
        v_original_event_id
      )
    )
    RETURNING id INTO v_event_id;

    v_remaining_quantity := v_quantity;
    v_remaining_value := v_value;
    SELECT pg_catalog.count(*)
    INTO v_balance_count
    FROM public.inventory_value_allocations AS allocation
    WHERE allocation.tenant_id = NEW.tenant_id
      AND allocation.valuation_event_id = v_original_event_id
      AND allocation.source_origin_id IS NOT NULL
      AND allocation.allocated_quantity > 0;
    v_position := 0;

    FOR v_balance IN
      SELECT
        allocation.source_origin_id AS origin_id,
        allocation.allocated_quantity AS quantity,
        allocation.allocated_value AS book_value
      FROM public.inventory_value_allocations AS allocation
      WHERE allocation.tenant_id = NEW.tenant_id
        AND allocation.valuation_event_id = v_original_event_id
        AND allocation.source_origin_id IS NOT NULL
        AND allocation.allocated_quantity > 0
      ORDER BY allocation.source_origin_id, allocation.id
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
        allocated_quantity,
        allocated_value,
        allocation_fraction
      )
      VALUES (
        NEW.tenant_id,
        v_event_id,
        v_balance.origin_id,
        v_to_balance_id,
        v_alloc_quantity,
        v_alloc_value,
        v_fraction
      );

      v_remaining_quantity := v_remaining_quantity - v_alloc_quantity;
      v_remaining_value := v_remaining_value - v_alloc_value;
    END LOOP;

    IF v_remaining_quantity <> 0 OR v_remaining_value <> 0 THEN
      RAISE EXCEPTION 'refund_restore_valuation_allocation_drift'
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.inventory_valuation_accounts
    SET quantity = quantity + v_quantity,
        book_value = book_value + v_value,
        valuation_version = valuation_version + 1,
        updated_at = pg_catalog.now()
    WHERE id = v_account.id;

  ELSIF NEW.quantity_change > 0 THEN
    v_value := pg_catalog.round(v_quantity * coalesce(NEW.unit_cost, 0), 2);
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
    -- ADR 0026: sale_consumption may exceed the valuation pool (post-and-flag).
    -- Synthesize a pos_sale_shortfall receive so issue + reconciliation stay balanced.
    IF NEW.type = 'consumption'
       AND COALESCE(NEW.movement_subtype, '') = 'sale_consumption'
       AND (
         v_account.quantity < v_quantity
         OR v_account.quantity <= 0
       ) THEN
      v_covered_quantity := GREATEST(
        0::numeric,
        LEAST(COALESCE(v_account.quantity, 0), v_quantity)
      );
      v_shortfall_quantity := v_quantity - v_covered_quantity;

      IF v_shortfall_quantity > 0 THEN
        v_shortfall_value := pg_catalog.round(
          v_shortfall_quantity * COALESCE(NEW.unit_cost, 0),
          2
        );

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
            'pos_sale_shortfall',
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
              'source_kind', 'pos_sale_shortfall',
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

    IF v_account.quantity < v_quantity OR v_account.quantity <= 0 THEN
      RAISE EXCEPTION 'inventory_valuation_insufficient_quantity'
        USING ERRCODE = '23514';
    END IF;

    v_fraction := v_quantity / v_account.quantity;
    v_value := CASE
      WHEN v_quantity = v_account.quantity THEN v_account.book_value
      ELSE pg_catalog.round(v_account.book_value * v_fraction, 2)
    END;

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
      WHEN NEW.type = 'count_adjustment' THEN 'stocktake_loss'
      WHEN NEW.type IN ('adjustment', 'grn_amend') THEN 'waste'
      ELSE NULL
    END;
    v_holder_id := CASE
      WHEN NEW.type = 'transfer_out' THEN (
        SELECT item.id
        FROM public.stock_transfer_items AS item
        WHERE item.tenant_id = NEW.tenant_id
          AND item.transfer_id = NEW.transfer_id
          AND item.ingredient_id = NEW.ingredient_id
      )
      WHEN NEW.type = 'production_consumption'
        THEN NEW.production_run_id
      ELSE NULL
    END;

    IF NEW.type IN ('transfer_out', 'production_consumption')
       AND v_holder_id IS NULL THEN
      RAISE EXCEPTION 'inventory_valuation_holder_missing'
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.inventory_valuation_events (
      tenant_id,
      ingredient_id,
      event_type,
      terminal_bucket,
      stock_movement_id,
      from_account_id,
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
      v_terminal_bucket,
      NEW.id,
      v_account.id,
      -v_quantity,
      -v_value,
      NEW.created_at,
      v_year,
      v_month,
      v_idempotency_key,
      NEW.created_by
    )
    RETURNING id INTO v_event_id;

    v_remaining_quantity := v_quantity;
    v_remaining_value := v_value;
    SELECT pg_catalog.count(*)
    INTO v_balance_count
    FROM public.inventory_origin_balances AS balance
    WHERE balance.tenant_id = NEW.tenant_id
      AND balance.valuation_account_id = v_account.id
      AND balance.holder_kind = 'stock_pool'
      AND balance.quantity > 0;
    v_position := 0;
    FOR v_balance IN
      SELECT
        balance.*
      FROM public.inventory_origin_balances AS balance
      WHERE balance.tenant_id = NEW.tenant_id
        AND balance.valuation_account_id = v_account.id
        AND balance.holder_kind = 'stock_pool'
        AND balance.quantity > 0
      ORDER BY balance.origin_id
      FOR UPDATE
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

      UPDATE public.inventory_origin_balances
      SET quantity = quantity - v_alloc_quantity,
          book_value = book_value - v_alloc_value,
          updated_at = pg_catalog.now()
      WHERE id = v_balance.id;

      v_to_balance_id := NULL;
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
      END IF;

      INSERT INTO public.inventory_value_allocations (
        tenant_id,
        valuation_event_id,
        source_origin_id,
        from_balance_id,
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
        v_balance.id,
        v_to_balance_id,
        CASE
          WHEN NEW.type = 'transfer_out' THEN 'transfer_holder'
          WHEN NEW.type = 'production_consumption'
            THEN 'production_inventory'
          ELSE coalesce(v_terminal_bucket, 'inventory')
        END,
        v_alloc_quantity,
        v_alloc_value,
        v_fraction
      );

      v_remaining_quantity := v_remaining_quantity - v_alloc_quantity;
      v_remaining_value := v_remaining_value - v_alloc_value;
    END LOOP;

    IF v_remaining_quantity <> 0 OR v_remaining_value <> 0 THEN
      RAISE EXCEPTION 'inventory_valuation_allocation_drift'
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.inventory_valuation_accounts
    SET quantity = quantity - v_quantity,
        book_value = book_value - v_value,
        valuation_version = valuation_version + 1,
        updated_at = pg_catalog.now()
    WHERE id = v_account.id;
  END IF;

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
    WHERE account.id = v_account.id
      AND stock.tenant_id = account.tenant_id
      AND stock.branch_id = account.branch_id
      AND stock.location_id = account.location_id
      AND stock.ingredient_id = account.ingredient_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.post_stock_movement_valuation() IS
  'Posts one idempotent valuation event for each stock movement after cutover. ADR 0026: sale_consumption shortfall synthesizes a pos_sale_shortfall receive before issue so WAC pool and reconciliation stay balanced.';
