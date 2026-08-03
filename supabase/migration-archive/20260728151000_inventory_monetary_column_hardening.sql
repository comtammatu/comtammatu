-- D091: authenticated operational users may read workflow columns, never money.

UPDATE public.role_templates
SET permission_keys = array_remove(
      array_remove(permission_keys, 'procurement:price_list_read'),
      'inventory:valuation_read'
    ),
    updated_at = now()
WHERE position_code IN (
  'central_supply_ops',
  'central_kitchen_lead',
  'branch_manager'
);

ALTER POLICY supplier_items_read
ON public.supplier_items
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission_any('procurement:read')
);

DELETE FROM public.staff_permissions permission
USING public.profiles profile, public.positions position
WHERE permission.user_id = profile.id
  AND permission.tenant_id = profile.tenant_id
  AND position.id = profile.position_id
  AND position.tenant_id = profile.tenant_id
  AND position.code IN (
    'central_supply_ops',
    'central_kitchen_lead',
    'branch_manager'
  )
  AND permission.permission_key IN (
    'procurement:price_list_read',
    'inventory:valuation_read'
  );

DROP POLICY IF EXISTS po_items_select ON public.purchase_order_items;
CREATE POLICY po_items_select
ON public.purchase_order_items
FOR SELECT
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND EXISTS (
    SELECT 1
    FROM public.purchase_orders purchase_order
    WHERE purchase_order.id = purchase_order_items.po_id
      AND purchase_order.tenant_id = purchase_order_items.tenant_id
      AND public.has_permission(
        purchase_order.branch_id,
        'procurement:read'
      )
  )
);

DROP POLICY IF EXISTS price_list_read ON public.supplier_price_list;
CREATE POLICY price_list_read
ON public.supplier_price_list
FOR SELECT
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.can_read_inventory_monetary('procurement:price_list_read')
);

REVOKE SELECT ON TABLE
  public.purchase_order_items,
  public.grn_items,
  public.ingredients,
  public.stock_levels,
  public.stock_movements,
  public.stock_transfer_items,
  public.stock_issue_items,
  public.supplier_price_list,
  public.supplier_return_items,
  public.supplier_returns,
  public.supplier_invoices,
  public.supplier_credit_notes,
  public.grn_hardblock_overrides,
  public.ingredient_abc_class,
  public.inventory_qc_settings,
  public.branch_daily_waste_cap
FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id, tenant_id, po_id, ingredient_id, quantity, entry_unit_id
) ON public.purchase_order_items TO authenticated;

GRANT SELECT (
  id, tenant_id, grn_id, ingredient_id, po_quantity,
  received_quantity, quality_status, rejected_quantity, rejection_reason,
  expiry_date, batch_number, receiving_temperature, rejected_photo_url,
  requires_review, short_delivery_action, entry_unit_id
) ON public.grn_items TO authenticated;

GRANT SELECT (
  id, tenant_id, name, sku, category, min_stock_level, max_stock_level,
  reorder_point, storage_type, shelf_life_days, is_active, created_at,
  updated_at, item_kind, review_override, category_id
) ON public.ingredients TO authenticated;

GRANT SELECT (
  id, tenant_id, branch_id, ingredient_id, current_quantity,
  last_counted_at, updated_at, location_id
) ON public.stock_levels TO authenticated;

GRANT SELECT (
  id, tenant_id, branch_id, ingredient_id, type, quantity_change, reason,
  created_by, created_at, grn_id, transfer_id, order_id,
  production_order_id, issue_id, location_id, movement_subtype,
  entry_unit_id, entry_quantity, production_run_id
) ON public.stock_movements TO authenticated;

GRANT SELECT (
  id, tenant_id, transfer_id, ingredient_id, quantity, quantity_received,
  receive_note, entry_unit_id
) ON public.stock_transfer_items TO authenticated;

GRANT SELECT (
  id, tenant_id, issue_id, ingredient_id, quantity, reason, reason_code,
  photo_urls, photo_required, approval_required, entry_unit_id
) ON public.stock_issue_items TO authenticated;

GRANT SELECT (
  id, tenant_id, return_id, ingredient_id, quantity, grn_item_id,
  reason_detail, photo_url, stock_movement_id, entry_unit_id
) ON public.supplier_return_items TO authenticated;

GRANT SELECT (
  id, tenant_id, branch_id, supplier_id, grn_id, return_number, source,
  reason, resolution, status, notes, created_by, confirmed_by,
  confirmed_at, created_at, updated_at
) ON public.supplier_returns TO authenticated;

GRANT SELECT (
  id, tenant_id, supplier_id, grn_id, po_id, invoice_number, invoice_date,
  matching_status, matching_notes, created_by, created_at, updated_at,
  due_date, payment_status, paid_at
) ON public.supplier_invoices TO authenticated;

GRANT SELECT (
  id, tenant_id, supplier_id, return_id, invoice_id, credit_number, kind,
  status, notes, created_by, created_at, applied_at
) ON public.supplier_credit_notes TO authenticated;

GRANT SELECT (
  tenant_id, branch_id, ingredient_id, class, computed_at
) ON public.ingredient_abc_class TO authenticated;

GRANT SELECT (
  tenant_id, qty_short_tolerance_pct, reject_requires_photo, updated_at
) ON public.inventory_qc_settings TO authenticated;

CREATE OR REPLACE FUNCTION public.get_grn_price_baseline(
  p_supplier_id bigint,
  p_ingredient_id bigint,
  p_uom text DEFAULT NULL::text
)
RETURNS TABLE (
  avg_30d numeric,
  sample_n integer,
  last_seen_at date,
  baseline_source text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_read_inventory_monetary('procurement:price_list_read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT *
  FROM public._compute_grn_price_baseline(
    v_tenant,
    p_supplier_id,
    p_ingredient_id,
    p_uom
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_po_price(
  p_supplier_id bigint,
  p_ingredient_id bigint,
  p_uom text
)
RETURNS TABLE (
  unit_price numeric,
  source text,
  effective_from date,
  min_order_qty numeric,
  lead_time_days smallint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_read_inventory_monetary('procurement:price_list_read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    price.unit_price,
    price.source,
    price.effective_from,
    price.min_order_qty,
    price.lead_time_days
  FROM public.supplier_price_list price
  WHERE price.tenant_id = v_tenant
    AND price.supplier_id = p_supplier_id
    AND price.ingredient_id = p_ingredient_id
    AND price.uom = p_uom
    AND price.effective_from <= CURRENT_DATE
    AND (price.effective_to IS NULL OR price.effective_to >= CURRENT_DATE)
  ORDER BY price.priority, price.effective_from DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_po_prices_batch(bigint, jsonb)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.update_purchase_order_prices(bigint, jsonb)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.create_supplier_return_from_grn(
  bigint,
  text,
  text,
  text
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.create_supplier_return_from_stock(
  bigint,
  bigint,
  text,
  text,
  text,
  jsonb
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.stock_issue_items_set_writeoff_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_parent RECORD;
  v_unit_cost numeric(15,2);
BEGIN
  SELECT
    issue.tenant_id,
    issue.branch_id,
    issue.source_location_id,
    issue.issue_type
  INTO v_parent
  FROM public.stock_issues issue
  WHERE issue.id = NEW.issue_id;

  IF NOT FOUND OR v_parent.issue_type <> 'writeoff' THEN
    RETURN NEW;
  END IF;

  SELECT stock.avg_unit_cost
  INTO v_unit_cost
  FROM public.stock_levels stock
  WHERE stock.tenant_id = v_parent.tenant_id
    AND stock.branch_id = v_parent.branch_id
    AND stock.ingredient_id = NEW.ingredient_id
    AND (
      v_parent.source_location_id IS NULL
      OR stock.location_id = v_parent.source_location_id
    )
  ORDER BY stock.location_id
  LIMIT 1;

  IF v_unit_cost IS NULL THEN
    SELECT ingredient.unit_cost
    INTO v_unit_cost
    FROM public.ingredients ingredient
    WHERE ingredient.tenant_id = v_parent.tenant_id
      AND ingredient.id = NEW.ingredient_id;
  END IF;

  NEW.unit_cost := COALESCE(v_unit_cost, 0);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stock_issue_items_set_writeoff_cost()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stock_issue_items_set_writeoff_cost()
TO service_role;

DROP TRIGGER IF EXISTS trg_stock_issue_items_cost_authority
ON public.stock_issue_items;
CREATE TRIGGER trg_stock_issue_items_cost_authority
BEFORE INSERT OR UPDATE OF
  issue_id,
  ingredient_id,
  unit_cost
ON public.stock_issue_items
FOR EACH ROW
EXECUTE FUNCTION public.stock_issue_items_set_writeoff_cost();

CREATE OR REPLACE FUNCTION public.get_inventory_dashboard(p_branch_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_can_cost boolean;
  v_summary jsonb;
  v_locations jsonb;
  v_alerts jsonb;
  v_in_transit jsonb;
  v_refreshed_at timestamptz;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (
    public.has_permission(p_branch_id, 'inventory:read')
    OR public.has_permission(NULL, 'reports:view_branch')
    OR public.has_permission(NULL, 'reports:view_tenant')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_can_cost :=
    public.can_read_inventory_monetary('inventory:valuation_read');

  SELECT refreshed_at
  INTO v_refreshed_at
  FROM public.mv_refresh_log
  WHERE view_name = 'mv_inventory_stock_current';

  SELECT jsonb_build_object(
    'total_skus', COALESCE(COUNT(DISTINCT stock.ingredient_id), 0),
    'location_count', COALESCE(COUNT(DISTINCT stock.location_id), 0),
    'total_quantity', COALESCE(SUM(stock.current_quantity), 0),
    'total_value_vnd',
      CASE WHEN v_can_cost THEN COALESCE(SUM(stock.stock_value), 0) END,
    'alerts_count', (
      SELECT COUNT(*)
      FROM public.mv_inventory_stock_current alert
      WHERE alert.tenant_id = v_tenant
        AND alert.branch_id = p_branch_id
        AND alert.reorder_point IS NOT NULL
        AND alert.current_quantity < alert.reorder_point
    )
  )
  INTO v_summary
  FROM public.mv_inventory_stock_current stock
  WHERE stock.tenant_id = v_tenant
    AND stock.branch_id = p_branch_id;

  SELECT COALESCE(
    jsonb_agg(location ORDER BY location->>'location_kind', location->>'location_name'),
    '[]'::jsonb
  )
  INTO v_locations
  FROM (
    SELECT jsonb_build_object(
      'location_id', stock.location_id,
      'location_name', MAX(stock.location_name),
      'location_kind', MAX(stock.location_kind),
      'sku_count', COUNT(DISTINCT stock.ingredient_id),
      'total_quantity', SUM(stock.current_quantity),
      'total_value_vnd',
        CASE WHEN v_can_cost THEN SUM(stock.stock_value) END,
      'alerts_count',
        COUNT(*) FILTER (
          WHERE stock.reorder_point IS NOT NULL
            AND stock.current_quantity < stock.reorder_point
        )
    ) AS location
    FROM public.mv_inventory_stock_current stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = p_branch_id
    GROUP BY stock.location_id
  ) grouped_locations;

  SELECT COALESCE(
    jsonb_agg(alert ORDER BY alert->>'severity_rank', alert->>'shortage_ratio' DESC),
    '[]'::jsonb
  )
  INTO v_alerts
  FROM (
    SELECT jsonb_build_object(
      'alert_type',
        CASE
          WHEN stock.current_quantity < 0 THEN 'negative_stock'
          WHEN stock.current_quantity = 0 THEN 'out_of_stock'
          ELSE 'low_stock'
        END,
      'severity_rank',
        CASE
          WHEN stock.current_quantity < 0 THEN 0
          WHEN stock.current_quantity = 0 THEN 1
          ELSE 2
        END,
      'ingredient_id', stock.ingredient_id,
      'ingredient_name', stock.ingredient_name,
      'location_id', stock.location_id,
      'location_name', stock.location_name,
      'current_quantity', stock.current_quantity,
      'reorder_point', stock.reorder_point,
      'shortage_ratio',
        CASE
          WHEN stock.reorder_point > 0
            THEN (stock.reorder_point - stock.current_quantity) / stock.reorder_point
          ELSE 0
        END
    ) AS alert
    FROM public.mv_inventory_stock_current stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = p_branch_id
      AND stock.reorder_point IS NOT NULL
      AND stock.current_quantity < stock.reorder_point
  ) grouped_alerts;

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'id' DESC), '[]'::jsonb)
  INTO v_in_transit
  FROM (
    SELECT jsonb_build_object(
      'id', transfer.id,
      'transfer_number', transfer.transfer_number,
      'from_branch_name', source_branch.name,
      'to_branch_name', target_branch.name,
      'status', transfer.status
    ) AS item
    FROM public.stock_transfers transfer
    JOIN public.branches source_branch ON source_branch.id = transfer.from_branch_id
    JOIN public.branches target_branch ON target_branch.id = transfer.to_branch_id
    WHERE transfer.tenant_id = v_tenant
      AND (
        transfer.from_branch_id = p_branch_id
        OR transfer.to_branch_id = p_branch_id
      )
      AND transfer.status IN (
        'draft',
        'confirmed_ship',
        'in_transit',
        'confirmed_receive'
      )
  ) grouped_transfers;

  RETURN jsonb_build_object(
    'branch_id', p_branch_id,
    'computed_at', COALESCE(v_refreshed_at, now()),
    'can_view_cost', v_can_cost,
    'summary', v_summary,
    'locations', v_locations,
    'top_alerts', v_alerts,
    'in_transit', v_in_transit
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_inventory_value_period(
  p_start_date date,
  p_end_date date,
  p_branch_id bigint DEFAULT NULL::bigint
)
RETURNS TABLE (
  branch_id bigint,
  opening_value numeric,
  closing_value numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_read_inventory_monetary('inventory:valuation_read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_branch_id IS NULL AND NOT public.auth_is_owner(auth.uid()) THEN
    RAISE EXCEPTION 'system_valuation_owner_only' USING ERRCODE = '42501';
  END IF;
  IF p_branch_id IS NOT NULL
     AND NOT public.auth_is_owner(auth.uid())
     AND NOT public.has_permission(p_branch_id, 'inventory:read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = '22023';
  END IF;

  v_start := p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_end := (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';

  RETURN QUERY
  WITH allowed_branches AS (
    SELECT branch.id
    FROM public.branches branch
    WHERE branch.tenant_id = v_tenant
      AND branch.is_active
      AND (p_branch_id IS NULL OR branch.id = p_branch_id)
  ),
  stock_locations AS (
    SELECT location.id, location.branch_id
    FROM public.inventory_locations location
    JOIN public.branches branch ON branch.id = location.branch_id
    WHERE location.tenant_id = v_tenant
      AND location.branch_id IN (SELECT allowed.id FROM allowed_branches allowed)
      AND location.is_active
      AND (
        location.location_kind = 'warehouse'
        OR (
          branch.branch_kind = 'central_kitchen'
          AND location.location_kind = 'production_storage'
        )
      )
  ),
  current_value AS (
    SELECT
      stock.branch_id,
      COALESCE(SUM(
        stock.current_quantity
        * COALESCE(stock.avg_unit_cost, ingredient.unit_cost, 0)
      ), 0) AS amount
    FROM public.stock_levels stock
    JOIN stock_locations location ON location.id = stock.location_id
    LEFT JOIN public.ingredients ingredient
      ON ingredient.id = stock.ingredient_id
     AND ingredient.tenant_id = stock.tenant_id
    WHERE stock.tenant_id = v_tenant
    GROUP BY stock.branch_id
  ),
  after_period_value AS (
    SELECT
      movement.branch_id,
      COALESCE(SUM(
        movement.quantity_change
        * COALESCE(movement.unit_cost, ingredient.unit_cost, 0)
      ), 0) AS amount
    FROM public.stock_movements movement
    JOIN stock_locations location ON location.id = movement.location_id
    LEFT JOIN public.ingredients ingredient
      ON ingredient.id = movement.ingredient_id
     AND ingredient.tenant_id = movement.tenant_id
    WHERE movement.tenant_id = v_tenant
      AND movement.created_at >= v_end
    GROUP BY movement.branch_id
  ),
  period_value AS (
    SELECT
      movement.branch_id,
      COALESCE(SUM(
        movement.quantity_change
        * COALESCE(movement.unit_cost, ingredient.unit_cost, 0)
      ), 0) AS amount
    FROM public.stock_movements movement
    JOIN stock_locations location ON location.id = movement.location_id
    LEFT JOIN public.ingredients ingredient
      ON ingredient.id = movement.ingredient_id
     AND ingredient.tenant_id = movement.tenant_id
    WHERE movement.tenant_id = v_tenant
      AND movement.created_at >= v_start
      AND movement.created_at < v_end
    GROUP BY movement.branch_id
  )
  SELECT
    branch.id,
    COALESCE(current_value.amount, 0)
      - COALESCE(after_period_value.amount, 0)
      - COALESCE(period_value.amount, 0),
    COALESCE(current_value.amount, 0)
      - COALESCE(after_period_value.amount, 0)
  FROM allowed_branches branch
  LEFT JOIN current_value ON current_value.branch_id = branch.id
  LEFT JOIN after_period_value ON after_period_value.branch_id = branch.id
  LEFT JOIN period_value ON period_value.branch_id = branch.id
  ORDER BY branch.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_grn_requires_review_outbox()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_grn RECORD;
  v_ingredient RECORD;
BEGIN
  IF NEW.requires_review IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.requires_review IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT
    grn.id,
    grn.grn_number,
    grn.supplier_id,
    grn.branch_id,
    supplier.name AS supplier_name,
    branch.name AS branch_name
  INTO v_grn
  FROM public.goods_received_notes grn
  LEFT JOIN public.suppliers supplier ON supplier.id = grn.supplier_id
  LEFT JOIN public.branches branch ON branch.id = grn.branch_id
  WHERE grn.id = NEW.grn_id
    AND grn.tenant_id = NEW.tenant_id;

  SELECT ingredient.id, ingredient.name
  INTO v_ingredient
  FROM public.ingredients ingredient
  WHERE ingredient.id = NEW.ingredient_id
    AND ingredient.tenant_id = NEW.tenant_id;

  INSERT INTO public.notification_outbox (
    tenant_id,
    channel,
    topic,
    payload
  )
  VALUES (
    NEW.tenant_id,
    'inventory',
    'grn.requires_review',
    jsonb_build_object(
      'grn_id', v_grn.id,
      'grn_number', v_grn.grn_number,
      'branch_id', v_grn.branch_id,
      'branch_name', v_grn.branch_name,
      'supplier_id', v_grn.supplier_id,
      'supplier_name', v_grn.supplier_name,
      'ingredient_id', v_ingredient.id,
      'ingredient_name', v_ingredient.name,
      'requires_review', true
    )
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_grn_requires_review_outbox()
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_supplier_return_outbox()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_supplier_name text;
  v_branch_name text;
BEGIN
  SELECT name INTO v_supplier_name
  FROM public.suppliers
  WHERE id = NEW.supplier_id;

  SELECT name INTO v_branch_name
  FROM public.branches
  WHERE id = NEW.branch_id;

  INSERT INTO public.notification_outbox (
    tenant_id,
    channel,
    topic,
    payload
  )
  VALUES (
    NEW.tenant_id,
    'inventory',
    'supplier_return.created',
    jsonb_build_object(
      'return_id', NEW.id,
      'return_number', NEW.return_number,
      'supplier_name', v_supplier_name,
      'branch_name', v_branch_name,
      'reason', NEW.reason,
      'resolution', NEW.resolution,
      'source', NEW.source
    )
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_supplier_return_outbox()
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.weekly_grn_override_report()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row RECORD;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT
      item_override.tenant_id,
      item_override.branch_id,
      COUNT(*) AS override_count,
      COUNT(DISTINCT item_override.overridden_by) AS distinct_users
    FROM public.grn_hardblock_overrides item_override
    WHERE item_override.overridden_at > now() - INTERVAL '7 days'
    GROUP BY item_override.tenant_id, item_override.branch_id
  LOOP
    INSERT INTO public.notifications (
      tenant_id,
      target_branch_id,
      target_roles,
      kind,
      severity,
      title,
      body,
      meta,
      dedup_key
    )
    VALUES (
      v_row.tenant_id,
      v_row.branch_id,
      ARRAY['owner', 'accountant', 'branch_manager']::text[],
      'inventory.grn.weekly_override_report',
      CASE WHEN v_row.override_count >= 5 THEN 'warning' ELSE 'info' END,
      'GRN hardblock override — weekly report',
      format(
        'Branch has %s hardblock overrides by %s user(s) in past 7 days.',
        v_row.override_count,
        v_row.distinct_users
      ),
      jsonb_build_object(
        'override_count', v_row.override_count,
        'distinct_users', v_row.distinct_users
      ),
      format(
        'grn_override_report:%s:%s',
        v_row.branch_id,
        to_char(now(), 'IYYY-IW')
      )
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.weekly_grn_override_report()
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.weekly_waste_report()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row RECORD;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT
      issue.tenant_id,
      issue.branch_id,
      COUNT(*) AS waste_count,
      COUNT(*) FILTER (
        WHERE issue.approval_status = 'pending'
      ) AS pending_count,
      COUNT(*) FILTER (
        WHERE issue.approval_status = 'approved'
      ) AS approved_count,
      COUNT(*) FILTER (
        WHERE issue.approval_status = 'rejected'
      ) AS rejected_count
    FROM public.stock_issues issue
    WHERE issue.issue_type = 'writeoff'
      AND issue.issued_at > now() - INTERVAL '7 days'
    GROUP BY issue.tenant_id, issue.branch_id
  LOOP
    INSERT INTO public.notifications (
      tenant_id,
      target_branch_id,
      target_roles,
      kind,
      severity,
      title,
      body,
      meta,
      dedup_key
    )
    VALUES (
      v_row.tenant_id,
      v_row.branch_id,
      ARRAY['owner', 'accountant', 'branch_manager']::text[],
      'inventory.waste.weekly_report',
      CASE WHEN v_row.pending_count >= 5 THEN 'warning' ELSE 'info' END,
      'Báo cáo waste — tuần vừa qua',
      format(
        'Chi nhánh có %s phiếu waste tuần qua (pending: %s, approved: %s, rejected: %s).',
        v_row.waste_count,
        v_row.pending_count,
        v_row.approved_count,
        v_row.rejected_count
      ),
      jsonb_build_object(
        'waste_count', v_row.waste_count,
        'pending_count', v_row.pending_count,
        'approved_count', v_row.approved_count,
        'rejected_count', v_row.rejected_count
      ),
      format(
        'waste_report:%s:%s',
        v_row.branch_id,
        to_char(now(), 'IYYY-IW')
      )
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.weekly_waste_report()
FROM PUBLIC, anon, authenticated;

UPDATE public.notification_outbox
SET payload = payload - ARRAY[
  'po_unit_price',
  'unit_cost',
  'total_cost',
  'total_value',
  'price_variance_pct',
  'baseline_variance_pct',
  'override_note',
  'override_photo_url'
]::text[]
WHERE topic IN ('grn.requires_review', 'supplier_return.created');

UPDATE public.notifications
SET
  body = CASE kind
    WHEN 'inventory.grn.weekly_override_report'
      THEN 'Có GRN override cần xem lại trong báo cáo tuần.'
    ELSE 'Có phiếu waste cần xem lại trong báo cáo tuần.'
  END,
  meta = meta - ARRAY[
    'total_markup_vnd',
    'total_value',
    'unit_cost',
    'total_cost',
    'price_variance_pct',
    'baseline_variance_pct'
  ]::text[]
WHERE kind IN (
  'inventory.grn.weekly_override_report',
  'inventory.waste.weekly_report'
);
