-- Migration: Correct Phước Hải branch's 2 wrongly approved count slips from Kho CN to Bếp CN.
-- Created At: 2026-07-06T22:10:00Z

DO $$
DECLARE
  v_slip RECORD;
  v_line RECORD;
  v_kitchen_id BIGINT;
  
  v_warehouse_delta NUMERIC(15,3);
  v_counted_base NUMERIC(15,3);
  
  v_kitchen_qty_current NUMERIC(15,3);
  v_movements_after NUMERIC(15,3);
  v_kitchen_qty_before NUMERIC(15,3);
  v_kitchen_delta NUMERIC(15,3);
BEGIN
  -- Loop through approved count slips at Phước Hải pointing to a warehouse location
  FOR v_slip IN 
    SELECT s.id, s.branch_id, s.location_id AS warehouse_id, s.tenant_id, s.reviewed_at, s.reviewed_by
    FROM public.inventory_count_slips s
    JOIN public.branches b ON b.id = s.branch_id
    JOIN public.inventory_locations l ON l.id = s.location_id
    WHERE b.name = 'Chi nhánh Phước Hải'
      AND l.location_kind = 'warehouse'
      AND s.status = 'approved'
  LOOP
    -- Get the active kitchen location for Phước Hải
    SELECT il.id INTO v_kitchen_id
    FROM public.inventory_locations il
    WHERE il.branch_id = v_slip.branch_id
      AND il.tenant_id = v_slip.tenant_id
      AND il.location_kind = 'kitchen'
      AND il.is_active = TRUE
    LIMIT 1;

    IF v_kitchen_id IS NOT NULL THEN
      -- 1. Update the count slip location to Bếp CN
      UPDATE public.inventory_count_slips
      SET location_id = v_kitchen_id
      WHERE id = v_slip.id;

      -- 2. Process each line
      FOR v_line IN
        SELECT id, ingredient_id, counted_quantity, entry_unit_id 
        FROM public.inventory_count_slip_lines
        WHERE slip_id = v_slip.id
      LOOP
        -- Find the wrong movement posted to Kho CN
        SELECT quantity_change INTO v_warehouse_delta
        FROM public.stock_movements
        WHERE tenant_id = v_slip.tenant_id
          AND branch_id = v_slip.branch_id
          AND location_id = v_slip.warehouse_id
          AND ingredient_id = v_line.ingredient_id
          AND type = 'count_adjustment'
          AND reason = 'Count slip #' || v_slip.id::text
        LIMIT 1;

        v_warehouse_delta := COALESCE(v_warehouse_delta, 0);

        -- Revert the wrong adjustment from Kho CN's stock levels
        UPDATE public.stock_levels
        SET current_quantity = current_quantity - v_warehouse_delta
        WHERE tenant_id = v_slip.tenant_id
          AND branch_id = v_slip.branch_id
          AND location_id = v_slip.warehouse_id
          AND ingredient_id = v_line.ingredient_id;

        -- Convert counted quantity to base unit
        v_counted_base := public.inv_to_base(v_line.ingredient_id, v_line.entry_unit_id, v_line.counted_quantity);

        -- Get Bếp CN's current stock level
        SELECT COALESCE(current_quantity, 0) INTO v_kitchen_qty_current
        FROM public.stock_levels
        WHERE tenant_id = v_slip.tenant_id
          AND branch_id = v_slip.branch_id
          AND location_id = v_kitchen_id
          AND ingredient_id = v_line.ingredient_id;

        -- Get sum of all movements on Bếp CN after the slip was approved
        SELECT COALESCE(SUM(quantity_change), 0) INTO v_movements_after
        FROM public.stock_movements
        WHERE tenant_id = v_slip.tenant_id
          AND branch_id = v_slip.branch_id
          AND location_id = v_kitchen_id
          AND ingredient_id = v_line.ingredient_id
          AND created_at > v_slip.reviewed_at;

        -- Reconstruct Bếp CN's stock level before the slip was approved
        v_kitchen_qty_before := v_kitchen_qty_current - v_movements_after;

        -- Calculate correct adjustment for Bếp CN
        v_kitchen_delta := v_counted_base - v_kitchen_qty_before;

        -- Update Bếp CN's current stock level with the correct adjustment
        UPDATE public.stock_levels
        SET current_quantity = current_quantity + v_kitchen_delta
        WHERE tenant_id = v_slip.tenant_id
          AND branch_id = v_slip.branch_id
          AND location_id = v_kitchen_id
          AND ingredient_id = v_line.ingredient_id;

        -- Correct the stock movement record or insert one if v_kitchen_delta is not 0
        IF v_warehouse_delta <> 0 THEN
          UPDATE public.stock_movements
          SET location_id = v_kitchen_id,
              quantity_change = v_kitchen_delta
          WHERE tenant_id = v_slip.tenant_id
            AND branch_id = v_slip.branch_id
            AND location_id = v_slip.warehouse_id
            AND ingredient_id = v_line.ingredient_id
            AND type = 'count_adjustment'
            AND reason = 'Count slip #' || v_slip.id::text;
        ELSIF v_kitchen_delta <> 0 THEN
          -- If there was no warehouse movement but there is a kitchen movement needed, insert it
          INSERT INTO public.stock_movements (
            tenant_id, branch_id, ingredient_id, type, quantity_change,
            reason, created_by, location_id, entry_unit_id, entry_quantity
          ) VALUES (
            v_slip.tenant_id, v_slip.branch_id, v_line.ingredient_id, 'count_adjustment', v_kitchen_delta,
            'Count slip #' || v_slip.id::text, v_slip.reviewed_by, v_kitchen_id,
            v_line.entry_unit_id, v_line.counted_quantity
          );
        END IF;

        -- Update system_quantity on the count slip line to point to Bếp CN's reconstructed quantity
        UPDATE public.inventory_count_slip_lines
        SET system_quantity = v_kitchen_qty_before
        WHERE id = v_line.id;
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
