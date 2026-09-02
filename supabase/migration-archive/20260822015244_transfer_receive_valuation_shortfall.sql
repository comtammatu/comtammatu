-- ADR 0026 & ADR 0040: Resilient transfer receive valuation posting.
-- Prevents 23514 (transfer_valuation_quantity_missing) when receiving stock transfers
-- whose source transfer line lacks origin balances (legacy transfers, unbacked source stock,
-- or timing cutovers). Synthesizes a transfer_shortfall provisional origin instead of failing.

-- 1. Extend cost origin source kind constraint to include transfer_shortfall
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
        'transfer_shortfall'::text
      ]
    )
  );

COMMENT ON CONSTRAINT inventory_cost_origins_source_kind_check
  ON public.inventory_cost_origins IS
  'Cost origin sources; pos_sale_shortfall and transfer_shortfall book unbacked movements.';

-- 2. Patch private.post_stock_movement_valuation for transfer_in shortfall handling
DO $patch_transfer_in_shortfall$
DECLARE
  v_def text;
  v_updated text;
  v_new_transfer_in text := $transfer_in_body$
    v_covered_quantity := GREATEST(
      0::numeric,
      LEAST(COALESCE(v_holder_quantity, 0), v_quantity)
    );
    v_shortfall_quantity := v_quantity - v_covered_quantity;

    -- 1. Synthesize transfer_shortfall for unbacked / missing quantity
    IF v_shortfall_quantity > 0 THEN
      v_shortfall_value := pg_catalog.round(
        v_shortfall_quantity * COALESCE(
          NEW.unit_cost,
          (
            SELECT sl.avg_unit_cost
            FROM public.stock_levels AS sl
            WHERE sl.tenant_id = NEW.tenant_id
              AND sl.ingredient_id = NEW.ingredient_id
              AND sl.avg_unit_cost > 0
            ORDER BY sl.updated_at DESC
            LIMIT 1
          ),
          0
        ),
        2
      );

      IF NOT EXISTS (
        SELECT 1
        FROM public.inventory_valuation_events AS event
        WHERE event.tenant_id = NEW.tenant_id
          AND event.idempotency_key = pg_catalog.md5(
            'stock-movement-transfer-shortfall:' || NEW.id::text
          )::uuid
      ) THEN
        v_origin_id := private.create_inventory_cost_origin(
          NEW.tenant_id,
          NEW.ingredient_id,
          'transfer_shortfall',
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
            'stock-movement-transfer-shortfall:' || NEW.id::text
          )::uuid,
          NEW.created_by,
          pg_catalog.jsonb_build_object(
            'source_kind', 'transfer_shortfall',
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
      END IF;
    END IF;

    -- 2. Allocate covered portion from existing transfer_item balances
    IF v_covered_quantity > 0 THEN
      v_fraction := v_covered_quantity / v_holder_quantity;
      v_value := CASE
        WHEN v_covered_quantity = v_holder_quantity THEN v_holder_value
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
        v_covered_quantity,
        v_value,
        NEW.created_at,
        v_year,
        v_month,
        v_idempotency_key,
        NEW.created_by
      )
      RETURNING id INTO v_event_id;

      v_remaining_quantity := v_covered_quantity;
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
      SET quantity = quantity + v_covered_quantity,
          book_value = book_value + v_value,
          valuation_version = valuation_version + 1,
          updated_at = pg_catalog.now()
      WHERE id = v_account.id;
    END IF;$transfer_in_body$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'post_stock_movement_valuation';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'post_stock_movement_valuation missing';
  END IF;

  v_def := regexp_replace(
    v_def,
    '^CREATE (OR REPLACE )?FUNCTION',
    'CREATE OR REPLACE FUNCTION'
  );

  v_updated := regexp_replace(
    v_def,
    'IF v_holder_quantity < v_quantity OR v_holder_quantity <= 0 THEN\s+RAISE EXCEPTION ''transfer_valuation_quantity_missing''\s+USING ERRCODE = ''23514'';\s+END IF;[\s\S]*?(?=v_position := 0;[\s\S]*?FOR v_balance IN)[\s\S]*?UPDATE public\.inventory_valuation_accounts\s+SET quantity = quantity \+ v_quantity,\s+book_value = book_value \+ v_value,\s+valuation_version = valuation_version \+ 1,\s+updated_at = pg_catalog\.now\(\)\s+WHERE id = v_account\.id;',
    v_new_transfer_in
  );

  IF v_updated = v_def THEN
    RAISE EXCEPTION 'post_stock_movement_valuation transfer_in shortfall pattern missing';
  END IF;

  EXECUTE v_updated;

  IF pg_get_functiondef(
    'private.post_stock_movement_valuation()'::regprocedure
  ) !~ 'transfer_shortfall' THEN
    RAISE EXCEPTION 'post_stock_movement_valuation transfer_shortfall verification failed';
  END IF;
END
$patch_transfer_in_shortfall$;

-- 3. Idempotent backfill for in-flight / existing transfer items without origin balances
DO $backfill_inflight_transfers$
DECLARE
  v_item RECORD;
  v_qty_base NUMERIC(15,3);
  v_unit_cost NUMERIC(15,2);
  v_book_val NUMERIC(15,2);
  v_origin_id BIGINT;
BEGIN
  FOR v_item IN
    SELECT
      sti.id AS item_id,
      sti.tenant_id,
      sti.transfer_id,
      sti.ingredient_id,
      sti.quantity,
      sti.entry_unit_id,
      sti.unit_cost_at_ship,
      st.created_at
    FROM public.stock_transfer_items sti
    JOIN public.stock_transfers st ON st.id = sti.transfer_id
    WHERE st.status IN ('confirmed_ship', 'in_transit', 'confirmed_receive')
      AND NOT EXISTS (
        SELECT 1
        FROM public.inventory_origin_balances iob
        WHERE iob.tenant_id = sti.tenant_id
          AND iob.holder_kind = 'transfer_item'
          AND iob.holder_id = sti.id
          AND iob.quantity > 0
      )
  LOOP
    v_qty_base := public.inv_to_base(v_item.ingredient_id, v_item.entry_unit_id, v_item.quantity);
    IF v_qty_base > 0 THEN
      v_unit_cost := COALESCE(
        v_item.unit_cost_at_ship,
        (
          SELECT sl.avg_unit_cost
          FROM public.stock_levels sl
          WHERE sl.tenant_id = v_item.tenant_id
            AND sl.ingredient_id = v_item.ingredient_id
            AND sl.avg_unit_cost > 0
          ORDER BY sl.updated_at DESC
          LIMIT 1
        ),
        0
      );
      v_book_val := pg_catalog.round(v_qty_base * v_unit_cost, 2);

      v_origin_id := private.create_inventory_cost_origin(
        v_item.tenant_id,
        v_item.ingredient_id,
        'transfer_shortfall',
        v_item.item_id,
        NULL,
        v_qty_base,
        v_book_val,
        v_item.created_at,
        CASE WHEN v_book_val > 0 THEN 'provisional' ELSE 'pending' END
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
        v_item.tenant_id,
        v_origin_id,
        'transfer_item',
        v_item.item_id,
        v_qty_base,
        v_book_val
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
    END IF;
  END LOOP;
END
$backfill_inflight_transfers$;

COMMENT ON FUNCTION private.post_stock_movement_valuation() IS
  'Posts one idempotent valuation event per stock movement. Synthesizes shortfall origins for unbacked POS sales and transfer receipts.';
