-- ADR 0026 / INV-1 PR 2A: per-ingredient POS stock posting (post-and-flag).
-- Allow negative on-hand, create missing stock_levels rows, cost ladder with
-- recorded rung, and one branch-reachable follow-up notification.

ALTER TABLE public.stock_levels
  DROP CONSTRAINT IF EXISTS stock_levels_current_quantity_valid;

ALTER TABLE public.stock_levels
  ADD CONSTRAINT stock_levels_current_quantity_valid
  CHECK (
    current_quantity <> ALL (ARRAY['NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric])
  );

COMMENT ON CONSTRAINT stock_levels_current_quantity_valid ON public.stock_levels IS
  'ADR 0026: quantity may be negative after post-and-flag POS consumption; NaN/Inf still rejected.';


CREATE OR REPLACE FUNCTION public.post_pos_sale_consumption_if_ready(p_order_id bigint, p_actor_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_actor uuid := COALESCE(p_actor_id, auth.uid());
  v_order record;
  v_location_id bigint;
  v_location_is_default boolean;
  v_need record;
  v_available numeric(15,3);
  v_unit_cost numeric(24,8);
  v_cost_rung text;
  v_inserted int := 0;
  v_needed int := 0;
  v_row_count int := 0;
  v_short bigint[] := ARRAY[]::bigint[];
  v_synthesized bigint[] := ARRAY[]::bigint[];
  v_cost_fallback bigint[] := ARRAY[]::bigint[];
  v_zero_cost bigint[] := ARRAY[]::bigint[];
  v_followup_needed boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT o.id, o.tenant_id, o.branch_id, o.status, o.payment_status, o.created_by
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'consumed', false, 'skipped', true, 'reason', 'order_not_found');
  END IF;

  v_actor := COALESCE(v_actor, v_order.created_by);

  IF NOT COALESCE((
    SELECT bff.enabled
    FROM public.branch_feature_flags bff
    WHERE bff.branch_id = v_order.branch_id
      AND bff.flag_key = 'pos_stock_outcome_posting'
  ), false) THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'consumed', false, 'skipped', true, 'reason', 'feature_disabled');
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') <> 'paid'
     OR v_order.status <> 'completed' THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'consumed', false, 'pending', true, 'reason', 'order_not_paid_completed');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    WHERE sm.tenant_id = v_order.tenant_id
      AND sm.order_id = p_order_id
      AND sm.type = 'consumption'
      AND (sm.movement_subtype IS NULL OR sm.movement_subtype = 'sale_consumption')
  ) THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'consumed', true, 'skipped', true, 'reason', 'already_posted');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.kds_tickets kt
    JOIN public.order_items oi
      ON oi.id = kt.order_item_id
     AND oi.tenant_id = kt.tenant_id
    WHERE kt.order_id = p_order_id
      AND kt.tenant_id = v_order.tenant_id
      AND kt.status <> 'cancelled'
      AND oi.status <> 'cancelled'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.kds_tickets kt
      JOIN public.order_items oi
        ON oi.id = kt.order_item_id
       AND oi.tenant_id = kt.tenant_id
      WHERE kt.order_id = p_order_id
        AND kt.tenant_id = v_order.tenant_id
        AND kt.first_ready_at IS NOT NULL
        AND kt.status <> 'cancelled'
        AND oi.status <> 'cancelled'
    ) THEN
      RETURN jsonb_build_object('order_id', p_order_id, 'consumed', false, 'pending', true, 'reason', 'no_ready_kds_items');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.kds_tickets kt
      JOIN public.order_items oi
        ON oi.id = kt.order_item_id
       AND oi.tenant_id = kt.tenant_id
      WHERE kt.order_id = p_order_id
        AND kt.tenant_id = v_order.tenant_id
        AND kt.status <> 'cancelled'
        AND oi.status <> 'cancelled'
        AND kt.first_ready_at IS NULL
    ) THEN
      RETURN jsonb_build_object('order_id', p_order_id, 'consumed', false, 'pending', true, 'reason', 'kds_not_fully_ready');
    END IF;
  END IF;

  SELECT il.id, il.is_default_consumption
  INTO v_location_id, v_location_is_default
  FROM public.inventory_locations il
  WHERE il.branch_id = v_order.branch_id
    AND il.tenant_id = v_order.tenant_id
    AND il.location_kind = 'warehouse'
    AND il.is_active = TRUE
  ORDER BY il.is_default_consumption DESC, il.sort_order NULLS LAST, il.id
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'issue_location_missing:%', v_order.branch_id USING ERRCODE = 'P0002';
  END IF;

  IF v_location_is_default IS DISTINCT FROM TRUE THEN
    RAISE WARNING 'default_consumption_location_missing:branch %; using warehouse location %',
      v_order.branch_id,
      v_location_id;
  END IF;

  -- ADR 0026: per-ingredient post-and-flag. Never abort the whole order on one
  -- short line; create missing stock_levels rows; allow negative on-hand.
  FOR v_need IN
    WITH qualifying_order_items AS (
      SELECT
        oi.id AS order_item_id,
        oi.menu_item_id::bigint AS menu_item_id,
        oi.quantity::numeric AS line_quantity,
        oi.sides
      FROM public.order_items oi
      JOIN public.menu_items mi
        ON mi.id = oi.menu_item_id
       AND mi.tenant_id = oi.tenant_id
      WHERE oi.order_id = p_order_id
        AND oi.tenant_id = v_order.tenant_id
        AND oi.status <> 'cancelled'
        AND (
          EXISTS (
            SELECT 1
            FROM public.kds_tickets kt
            WHERE kt.order_item_id = oi.id
              AND kt.tenant_id = oi.tenant_id
              AND kt.order_id = oi.order_id
              AND kt.first_ready_at IS NOT NULL
              AND kt.status <> 'cancelled'
          )
          OR (
            oi.sent_to_kitchen_at IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM public.kds_tickets kt
              WHERE kt.order_item_id = oi.id
                AND kt.tenant_id = oi.tenant_id
                AND kt.order_id = oi.order_id
                AND kt.status <> 'cancelled'
            )
          )
        )
    ),
    consumption_lines AS (
      SELECT menu_item_id, line_quantity
      FROM qualifying_order_items

      UNION ALL

      SELECT (s.elem ->> 'side_item_id')::bigint AS menu_item_id,
             qoi.line_quantity *
               CASE
                 WHEN COALESCE(s.elem ->> 'quantity', '') ~ '^[0-9]+$'
                   THEN (s.elem ->> 'quantity')::numeric
                 ELSE 1
               END AS line_quantity
      FROM qualifying_order_items qoi
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(qoi.sides, '[]'::jsonb)) AS s(elem)
      WHERE s.elem ? 'side_item_id'
        AND (s.elem ->> 'side_item_id') ~ '^[0-9]+$'
    )
    SELECT
      r.ingredient_id,
      ROUND(SUM(public.inv_to_base_for_tenant(
        v_order.tenant_id,
        r.ingredient_id,
        r.entry_unit_id,
        cl.line_quantity * r.quantity / r.yield_factor
      )), 3)::numeric(15,3) AS need_qty,
      (
        SELECT iu.unit_id
        FROM public.ingredient_units iu
        JOIN public.units u
          ON u.id = iu.unit_id
         AND u.tenant_id = iu.tenant_id
         AND u.is_active = TRUE
        WHERE iu.tenant_id = v_order.tenant_id
          AND iu.ingredient_id = r.ingredient_id
          AND iu.is_base = TRUE
          AND iu.is_active = TRUE
        ORDER BY iu.sort_order ASC, iu.id ASC
        LIMIT 1
      ) AS entry_unit_id
    FROM consumption_lines cl
    JOIN public.recipes r
      ON r.menu_item_id = cl.menu_item_id
     AND r.tenant_id = v_order.tenant_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.recipes r2
      WHERE r2.menu_item_id = cl.menu_item_id
        AND r2.tenant_id = v_order.tenant_id
        AND r2.entry_unit_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.ingredient_units iu
          WHERE iu.tenant_id = v_order.tenant_id
            AND iu.ingredient_id = r2.ingredient_id
            AND iu.unit_id = r2.entry_unit_id
            AND iu.is_active = TRUE
        )
    )
    GROUP BY r.ingredient_id
    HAVING ROUND(SUM(public.inv_to_base_for_tenant(
      v_order.tenant_id,
      r.ingredient_id,
      r.entry_unit_id,
      cl.line_quantity * r.quantity / r.yield_factor
    )), 3) > 0
    ORDER BY r.ingredient_id
  LOOP
    v_needed := v_needed + 1;

    IF v_need.entry_unit_id IS NULL THEN
      RAISE EXCEPTION 'entry_unit_not_found:%', v_need.ingredient_id USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.stock_levels (
      tenant_id,
      branch_id,
      ingredient_id,
      location_id,
      current_quantity
    )
    VALUES (
      v_order.tenant_id,
      v_order.branch_id,
      v_need.ingredient_id,
      v_location_id,
      0
    )
    ON CONFLICT (ingredient_id, branch_id, location_id, tenant_id)
    DO NOTHING;

    -- FOUND is true when the INSERT created a row; false on conflict (DO NOTHING).
    IF FOUND THEN
      v_synthesized := array_append(v_synthesized, v_need.ingredient_id);
      v_followup_needed := true;
    END IF;

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_available, v_unit_cost
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_order.tenant_id
      AND sl.branch_id = v_order.branch_id
      AND sl.location_id = v_location_id
      AND sl.ingredient_id = v_need.ingredient_id
    FOR UPDATE;

    IF v_available IS NULL THEN
      -- Should not happen after ensure-insert; synthesize defensively.
      INSERT INTO public.stock_levels (
        tenant_id, branch_id, ingredient_id, location_id, current_quantity
      ) VALUES (
        v_order.tenant_id, v_order.branch_id, v_need.ingredient_id,
        v_location_id, 0
      )
      ON CONFLICT (ingredient_id, branch_id, location_id, tenant_id)
      DO UPDATE SET updated_at = public.stock_levels.updated_at
      RETURNING current_quantity, avg_unit_cost
      INTO v_available, v_unit_cost;
      v_synthesized := array_append(v_synthesized, v_need.ingredient_id);
      v_followup_needed := true;
    END IF;

    IF COALESCE(v_available, 0) < v_need.need_qty THEN
      v_short := array_append(v_short, v_need.ingredient_id);
      v_followup_needed := true;
    END IF;

    -- Cost ladder (ADR 0026 Decision 4)
    v_cost_rung := NULL;
    IF v_unit_cost IS NOT NULL AND v_unit_cost > 0 THEN
      v_cost_rung := 'location_wac';
    ELSE
      SELECT sl.avg_unit_cost
      INTO v_unit_cost
      FROM public.stock_levels sl
      WHERE sl.tenant_id = v_order.tenant_id
        AND sl.ingredient_id = v_need.ingredient_id
        AND sl.avg_unit_cost IS NOT NULL
        AND sl.avg_unit_cost > 0
      ORDER BY
        CASE WHEN sl.branch_id = v_order.branch_id THEN 0 ELSE 1 END,
        sl.updated_at DESC NULLS LAST
      LIMIT 1;
      IF v_unit_cost IS NOT NULL AND v_unit_cost > 0 THEN
        v_cost_rung := 'tenant_wac';
        v_cost_fallback := array_append(v_cost_fallback, v_need.ingredient_id);
        v_followup_needed := true;
      END IF;
    END IF;

    IF v_cost_rung IS NULL THEN
      SELECT gi.unit_cost / NULLIF(
        public.inv_to_base_for_tenant(
          v_order.tenant_id,
          gi.ingredient_id,
          gi.entry_unit_id,
          1
        ),
        0
      )
      INTO v_unit_cost
      FROM public.grn_items gi
      JOIN public.goods_received_notes grn
        ON grn.id = gi.grn_id
       AND grn.tenant_id = gi.tenant_id
      WHERE gi.tenant_id = v_order.tenant_id
        AND gi.ingredient_id = v_need.ingredient_id
        AND grn.status = 'confirmed'
        AND gi.unit_cost IS NOT NULL
        AND gi.unit_cost > 0
      ORDER BY grn.updated_at DESC NULLS LAST, gi.id DESC
      LIMIT 1;
      IF v_unit_cost IS NOT NULL AND v_unit_cost > 0 THEN
        v_cost_rung := 'latest_purchase';
        v_cost_fallback := array_append(v_cost_fallback, v_need.ingredient_id);
        v_followup_needed := true;
      END IF;
    END IF;

    IF v_cost_rung IS NULL THEN
      v_unit_cost := 0;
      v_cost_rung := 'zero';
      v_zero_cost := array_append(v_zero_cost, v_need.ingredient_id);
      v_followup_needed := true;
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id,
      branch_id,
      ingredient_id,
      type,
      movement_subtype,
      quantity_change,
      reason,
      created_by,
      order_id,
      unit_cost,
      location_id,
      entry_unit_id,
      entry_quantity
    )
    VALUES (
      v_order.tenant_id,
      v_order.branch_id,
      v_need.ingredient_id,
      'consumption',
      'sale_consumption',
      -v_need.need_qty,
      'Order ' || p_order_id::text
        || ' sale consumption; cost_rung=' || v_cost_rung,
      v_actor,
      p_order_id,
      v_unit_cost,
      v_location_id,
      v_need.entry_unit_id,
      v_need.need_qty
    )
    ON CONFLICT (
      tenant_id,
      order_id,
      movement_subtype,
      ingredient_id,
      location_id
    )
    WHERE order_id IS NOT NULL
      AND movement_subtype IN (
        'sale_consumption',
        'cancelled_after_kds_ready'
      )
    DO NOTHING;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted := v_inserted + v_row_count;
  END LOOP;

  IF v_needed = 0 THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'consumed', false, 'skipped', true, 'reason', 'no_recipe_movements');
  END IF;

  IF v_followup_needed THEN
    INSERT INTO public.notifications (
      tenant_id,
      target_branch_id,
      target_roles,
      kind,
      severity,
      title,
      body,
      entity_type,
      entity_id,
      action_url,
      dedup_key,
      meta
    )
    VALUES (
      v_order.tenant_id,
      v_order.branch_id,
      ARRAY['owner', 'branch_manager']::text[],
      'inventory.pos_stock_shortfall',
      'warning',
      'Trừ tồn bán hàng cần đối soát',
      'Đơn đã thanh toán đã trừ kho; có nguyên liệu thiếu tồn, thiếu dòng tồn hoặc thiếu giá vốn.',
      'order',
      p_order_id,
      format('/br/%s/stock', v_order.branch_id),
      'inventory.pos_stock_shortfall:' || p_order_id::text,
      jsonb_build_object(
        'order_id', p_order_id,
        'short_ingredient_ids', to_jsonb(v_short),
        'synthesized_ingredient_ids', to_jsonb(v_synthesized),
        'cost_fallback_ingredient_ids', to_jsonb(v_cost_fallback),
        'zero_cost_ingredient_ids', to_jsonb(v_zero_cost),
        'source', 'post_pos_sale_consumption_if_ready'
      )
    )
    ON CONFLICT (tenant_id, dedup_key)
      WHERE dedup_key IS NOT NULL
    DO UPDATE SET
      body = EXCLUDED.body,
      meta = EXCLUDED.meta,
      action_url = EXCLUDED.action_url,
      created_at = now(),
      expires_at = NULL;
  END IF;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'consumed', v_inserted = v_needed AND v_inserted > 0,
    'movements_created', v_inserted,
    'lines_needed', v_needed,
    'short_ingredient_ids', to_jsonb(v_short),
    'synthesized_ingredient_ids', to_jsonb(v_synthesized),
    'cost_fallback_ingredient_ids', to_jsonb(v_cost_fallback),
    'zero_cost_ingredient_ids', to_jsonb(v_zero_cost),
    'followup', v_followup_needed
  );
END;
$_$;


COMMENT ON FUNCTION public.post_pos_sale_consumption_if_ready(p_order_id bigint, p_actor_id uuid) IS
  'ADR 0026: posts per-ingredient sale consumption for paid completed orders; allows negative on-hand; records cost rung; emits inventory.pos_stock_shortfall when follow-up is needed.';

CREATE OR REPLACE FUNCTION private.canonicalize_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_branch_kind text;
BEGIN
  NEW.target_roles := ARRAY(
    SELECT DISTINCT target_role
    FROM unnest(NEW.target_roles) AS roles(target_role)
    WHERE target_role = ANY (ARRAY[
      'owner',
      'accountant',
      'central_supply_ops',
      'central_kitchen_lead',
      'branch_manager',
      'cashier',
      'chef',
      'branch_staff'
    ]::text[])
    ORDER BY target_role
  );

  IF cardinality(NEW.target_roles) = 0 THEN
    RAISE EXCEPTION 'notification_requires_canonical_target_role'
      USING ERRCODE = '23514';
  END IF;

  NEW.action_url := CASE NEW.kind
    WHEN 'procurement.purchase_request_submitted' THEN
      format(
        '/inventory/purchase-orders?tab=needs&demandId=%s&mode=view',
        NEW.entity_id
      )
    WHEN 'procurement.po_pending_approval' THEN
      format(
        '/inventory/purchase-orders?tab=orders&poId=%s&mode=view',
        NEW.entity_id
      )
    WHEN 'workflow.po_approved' THEN
      format(
        '/inventory/purchase-orders?tab=orders&poId=%s&mode=view',
        NEW.entity_id
      )
    WHEN 'workflow.po_sent' THEN
      format(
        '/inventory/purchase-orders?tab=orders&poId=%s&mode=view',
        NEW.entity_id
      )
    WHEN 'hr.payroll_period_ready' THEN
      format('/hr/payroll/%s', NEW.entity_id)
    WHEN 'hr.leave_requested' THEN
      CASE
        WHEN NEW.target_branch_id IS NULL THEN
          format('/hr/attendance?tab=approvals&leaveRequestId=%s', NEW.entity_id)
        ELSE NEW.action_url
      END
    WHEN 'hr.checkout_requested' THEN
      CASE
        WHEN NEW.target_branch_id IS NULL THEN
          format(
            '/hr/attendance/checkout-approvals?attendanceId=%s',
            NEW.entity_id
          )
        ELSE NEW.action_url
      END
    WHEN 'attendance.checkout_requested' THEN
      CASE
        WHEN NEW.target_branch_id IS NULL THEN
          format(
            '/hr/attendance/checkout-approvals?attendanceId=%s',
            NEW.entity_id
          )
        ELSE NEW.action_url
      END
    WHEN 'inventory.stock_request_rejected' THEN
      format('/inventory/transfers?requestId=%s', NEW.entity_id)
    WHEN 'inventory.waste_pending_approval' THEN
      format('/inventory/waste/approvals?issueId=%s', NEW.entity_id)
    WHEN 'inventory.valuation_variance' THEN
      '/finance/supplier-invoices?invoiceId=' || NEW.entity_id::text
    WHEN 'inventory.valuation_reconciliation_failed' THEN
      NEW.action_url
    WHEN 'pos.void_requested' THEN
      format('/br/%s/pos?voidRequest=%s', NEW.target_branch_id, NEW.entity_id)
    WHEN 'pos.void_resolved' THEN
      NEW.action_url
    WHEN 'pos.void_rejected' THEN
      NEW.action_url
    WHEN 'hr.checkout_approved' THEN
      NEW.action_url
    WHEN 'hr.checkout_rejected' THEN
      NEW.action_url
    WHEN 'inventory.pos_stock_shortfall' THEN
      CASE
        WHEN NEW.target_branch_id IS NULL THEN '/inventory/stock'
        ELSE format('/br/%s/stock', NEW.target_branch_id)
      END
    ELSE NEW.action_url
  END;

  IF NEW.target_branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT branch.branch_kind
  INTO v_branch_kind
  FROM public.branches AS branch
  WHERE branch.id = NEW.target_branch_id
    AND branch.tenant_id = NEW.tenant_id;

  NEW.action_url := CASE NEW.kind
    WHEN 'inventory.stock_low' THEN
      CASE
        WHEN v_branch_kind = 'branch' AND NEW.entity_id IS NULL
          THEN format('/br/%s/stock', NEW.target_branch_id)
        WHEN v_branch_kind = 'branch'
          THEN format(
            '/br/%s/stock/on-hand/%s',
            NEW.target_branch_id,
            NEW.entity_id
          )
        WHEN NEW.entity_id IS NULL
          THEN format('/inventory/stock?branchId=%s', NEW.target_branch_id)
        ELSE format(
          '/inventory/stock/%s?branchId=%s',
          NEW.entity_id,
          NEW.target_branch_id
        )
      END
    WHEN 'inventory.stock_request_submitted' THEN
      format('/inventory/transfers?requestId=%s', NEW.entity_id)
    WHEN 'workflow.grn_pending' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format('/br/%s/stock/transfer', NEW.target_branch_id)
        ELSE format('/inventory/grn/%s', NEW.entity_id)
      END
    WHEN 'inventory.count_slip_submitted' THEN
      format(
        '/br/%s/stock/count-slips?slipId=%s',
        NEW.target_branch_id,
        NEW.entity_id
      )

    WHEN 'inventory.stocktake_completed' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format(
            '/br/%s/stock/stocktake/%s',
            NEW.target_branch_id,
            NEW.entity_id
          )
        ELSE format(
          '/inventory/stocktake/%s?branchId=%s',
          NEW.entity_id,
          NEW.target_branch_id
        )
      END
    WHEN 'inventory.stocktake_conflict' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format(
            '/br/%s/stock/stocktake/%s',
            NEW.target_branch_id,
            NEW.entity_id
          )
        ELSE format(
          '/inventory/stocktake/%s?branchId=%s',
          NEW.entity_id,
          NEW.target_branch_id
        )
      END
    WHEN 'inventory.waste.weekly_report' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format('/br/%s/stock/waste-approvals', NEW.target_branch_id)
        ELSE format(
          '/inventory/waste/approvals?branchId=%s',
          NEW.target_branch_id
        )
      END
    WHEN 'workflow.transfer_in_transit' THEN
      format('/br/%s/stock/receive/%s', NEW.target_branch_id, NEW.entity_id)
    WHEN 'hr.leave_requested' THEN
      format(
        '/br/%s/team?tab=leaves&leaveRequestId=%s',
        NEW.target_branch_id,
        NEW.entity_id
      )
    WHEN 'attendance.checkout_requested' THEN
      format(
        '/br/%s/team?tab=checkouts&attendanceId=%s',
        NEW.target_branch_id,
        NEW.entity_id
      )
    WHEN 'hr.checkout_requested' THEN
      format(
        '/br/%s/team?tab=checkouts&attendanceId=%s',
        NEW.target_branch_id,
        NEW.entity_id
      )
    WHEN 'inventory.count_slip_approved' THEN
      format(
        '/br/%s/stock/count-slips?slipId=%s',
        NEW.target_branch_id,
        NEW.entity_id
      )
    WHEN 'inventory.count_slip_recount' THEN
      format(
        '/br/%s/stock/count?slipId=%s',
        NEW.target_branch_id,
        NEW.entity_id
      )
    WHEN 'hr.leave_approved' THEN
      format('/br/%s/shift/schedule/leave', NEW.target_branch_id)
    WHEN 'hr.leave_rejected' THEN
      format('/br/%s/shift/schedule/leave', NEW.target_branch_id)
    WHEN 'pos.shift_variance' THEN
      format(
        '/br/%s/pos-sessions?session=%s',
        NEW.target_branch_id,
        NEW.entity_id
      )

    WHEN 'inventory.stock_request_rejected' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format('/br/%s/stock?work=receive', NEW.target_branch_id)
        ELSE format('/inventory/transfers?requestId=%s', NEW.entity_id)
      END
    WHEN 'inventory.waste_pending_approval' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format('/br/%s/stock/waste-approvals', NEW.target_branch_id)
        ELSE format('/inventory/waste/approvals?issueId=%s', NEW.entity_id)
      END
    WHEN 'inventory.valuation_variance' THEN
      '/finance/supplier-invoices?invoiceId=' || NEW.entity_id::text
    WHEN 'inventory.valuation_reconciliation_failed' THEN
      NEW.action_url
    WHEN 'pos.void_requested' THEN
      format('/br/%s/pos?voidRequest=%s', NEW.target_branch_id, NEW.entity_id)
    WHEN 'pos.void_resolved' THEN
      NEW.action_url
    WHEN 'pos.void_rejected' THEN
      NEW.action_url
    WHEN 'hr.checkout_approved' THEN
      NEW.action_url
    WHEN 'hr.checkout_rejected' THEN
      NEW.action_url
    WHEN 'inventory.pos_stock_shortfall' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format('/br/%s/stock', NEW.target_branch_id)
        ELSE format('/inventory/stock?branchId=%s', NEW.target_branch_id)
      END
    ELSE NEW.action_url
  END;

  RETURN NEW;
END;
$$;

