-- Migration: branch_kitchen_inventory_split
-- ADR 0048: separate the branch warehouse from the branch kitchen while
-- preserving the existing inter-site transfer and inventory ledger history.

-- ---------------------------------------------------------------------------
-- Additive schema and historical backfill
-- ---------------------------------------------------------------------------

ALTER TABLE public.inventory_locations
  DROP CONSTRAINT inventory_locations_location_kind_check,
  DROP CONSTRAINT inventory_locations_defaults_require_active_warehouse;

ALTER TABLE public.inventory_locations
  ADD CONSTRAINT inventory_locations_location_kind_check
    CHECK (location_kind IN ('warehouse', 'receiving', 'production_storage', 'kitchen')),
  ADD CONSTRAINT inventory_locations_defaults_require_active_location
    CHECK (
      (NOT is_default_receive OR (is_active AND location_kind = 'warehouse'))
      AND (NOT is_default_issue OR (is_active AND location_kind = 'warehouse'))
      AND (
        NOT is_default_consumption
        OR (is_active AND location_kind IN ('warehouse', 'kitchen'))
      )
    );

CREATE UNIQUE INDEX inventory_locations_one_active_kitchen_per_branch_idx
  ON public.inventory_locations (tenant_id, branch_id)
  WHERE is_active AND location_kind = 'kitchen';

ALTER TABLE public.orders
  ADD COLUMN stock_consumption_location_id bigint;

ALTER TABLE public.branch_menu_item_daily_holds
  ADD COLUMN stock_consumption_location_id bigint;

ALTER TABLE public.stock_transfers
  ADD COLUMN transfer_scope text NOT NULL DEFAULT 'inter_site',
  ADD COLUMN idempotency_key uuid,
  ADD COLUMN reverses_transfer_id bigint;

ALTER TABLE public.stock_transfers
  ADD CONSTRAINT stock_transfers_transfer_scope_check
    CHECK (transfer_scope IN ('inter_site', 'intra_site')),
  ADD CONSTRAINT stock_transfers_intra_idempotency_required_check
    CHECK (transfer_scope <> 'intra_site' OR idempotency_key IS NOT NULL),
  ADD CONSTRAINT stock_transfers_scope_lifecycle_check
    CHECK (
      (
        transfer_scope = 'inter_site'
        AND from_branch_id <> to_branch_id
      )
      OR (
        transfer_scope = 'intra_site'
        AND from_branch_id = to_branch_id
        AND status = 'received'
        AND received_at IS NOT NULL
        AND shipped_at IS NULL
        AND receive_started_at IS NULL
        AND vehicle_info IS NULL
      )
    ),
  ADD CONSTRAINT stock_transfers_reverses_transfer_id_fkey
    FOREIGN KEY (reverses_transfer_id)
    REFERENCES public.stock_transfers(id)
    ON DELETE RESTRICT;

CREATE UNIQUE INDEX stock_transfers_intra_idempotency_idx
  ON public.stock_transfers (tenant_id, idempotency_key)
  WHERE transfer_scope = 'intra_site' AND idempotency_key IS NOT NULL;

CREATE INDEX stock_transfers_reverses_transfer_idx
  ON public.stock_transfers (tenant_id, reverses_transfer_id)
  WHERE reverses_transfer_id IS NOT NULL;

ALTER TABLE public.branch_ingredient_thresholds
  ADD COLUMN location_id bigint,
  ADD COLUMN target_stock_level numeric;

UPDATE public.branch_ingredient_thresholds AS threshold
SET location_id = (
      SELECT candidate.id
      FROM public.inventory_locations AS candidate
      WHERE candidate.tenant_id = threshold.tenant_id
        AND candidate.branch_id = threshold.branch_id
        AND candidate.location_kind = 'warehouse'
      ORDER BY candidate.is_active DESC, candidate.is_default_receive DESC,
               candidate.sort_order, candidate.id
      LIMIT 1
    ),
    target_stock_level = greatest(
      threshold.min_stock_level,
      threshold.min_stock_level + coalesce(threshold.reorder_quantity, threshold.min_stock_level)
    );

DO $threshold_backfill$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.branch_ingredient_thresholds
    WHERE location_id IS NULL
  ) THEN
    RAISE EXCEPTION 'branch_threshold_location_backfill_failed'
      USING ERRCODE = '23502';
  END IF;
END
$threshold_backfill$;

ALTER TABLE public.branch_ingredient_thresholds
  ALTER COLUMN location_id SET NOT NULL,
  ALTER COLUMN target_stock_level SET NOT NULL,
  ADD CONSTRAINT branch_ingredient_thresholds_location_id_fkey
    FOREIGN KEY (location_id)
    REFERENCES public.inventory_locations(id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT branch_ingredient_thresholds_levels_check
    CHECK (
      min_stock_level >= 0
      AND target_stock_level >= min_stock_level
      AND min_stock_level NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      AND target_stock_level NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    );

ALTER TABLE public.branch_ingredient_thresholds
  DROP CONSTRAINT branch_ingredient_thresholds_tenant_branch_ingredient_key;

ALTER TABLE public.branch_ingredient_thresholds
  ADD CONSTRAINT branch_ingredient_thresholds_tenant_branch_location_ingredient_key
    UNIQUE (tenant_id, branch_id, location_id, ingredient_id);

-- Historical transfers remain inter-site documents. Historical orders and
-- holds are pinned to the location that owned consumption before activation.
UPDATE public.stock_transfers
SET transfer_scope = 'inter_site'
WHERE transfer_scope IS DISTINCT FROM 'inter_site';

UPDATE public.orders AS order_row
SET stock_consumption_location_id = (
  SELECT candidate.id
  FROM public.inventory_locations AS candidate
  WHERE candidate.tenant_id = order_row.tenant_id
    AND candidate.branch_id = order_row.branch_id
    AND candidate.is_active
    AND candidate.location_kind = 'warehouse'
  ORDER BY candidate.is_default_consumption DESC, candidate.sort_order, candidate.id
  LIMIT 1
)
WHERE order_row.stock_consumption_location_id IS NULL;

UPDATE public.branch_menu_item_daily_holds AS hold
SET stock_consumption_location_id = (
  SELECT candidate.id
  FROM public.inventory_locations AS candidate
  WHERE candidate.tenant_id = hold.tenant_id
    AND candidate.branch_id = hold.branch_id
    AND candidate.is_active
    AND candidate.location_kind = 'warehouse'
  ORDER BY candidate.is_default_consumption DESC, candidate.sort_order, candidate.id
  LIMIT 1
)
WHERE hold.stock_consumption_location_id IS NULL;

DO $consumption_location_backfill$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE stock_consumption_location_id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.branch_menu_item_daily_holds
    WHERE stock_consumption_location_id IS NULL
  ) THEN
    RAISE EXCEPTION 'stock_consumption_location_backfill_failed'
      USING ERRCODE = '23502';
  END IF;
END
$consumption_location_backfill$;

ALTER TABLE public.orders
  ALTER COLUMN stock_consumption_location_id SET NOT NULL,
  ADD CONSTRAINT orders_stock_consumption_location_id_fkey
    FOREIGN KEY (stock_consumption_location_id)
    REFERENCES public.inventory_locations(id)
    ON DELETE RESTRICT;

ALTER TABLE public.branch_menu_item_daily_holds
  ALTER COLUMN stock_consumption_location_id SET NOT NULL,
  ADD CONSTRAINT branch_menu_holds_stock_consumption_location_id_fkey
    FOREIGN KEY (stock_consumption_location_id)
    REFERENCES public.inventory_locations(id)
    ON DELETE RESTRICT;

CREATE INDEX orders_stock_consumption_location_idx
  ON public.orders (tenant_id, branch_id, stock_consumption_location_id, created_at DESC);

CREATE INDEX branch_menu_holds_consumption_location_idx
  ON public.branch_menu_item_daily_holds (
    tenant_id, branch_id, stock_consumption_location_id, limit_date, menu_item_id
  )
  WHERE committed_at IS NULL AND released_at IS NULL;

COMMENT ON COLUMN public.orders.stock_consumption_location_id IS
  'Immutable inventory location snapshot used by POS/KDS consumption and restoration.';
COMMENT ON COLUMN public.branch_menu_item_daily_holds.stock_consumption_location_id IS
  'Inventory location snapshot reserved by the POS hold; committed orders must use the same location.';
COMMENT ON COLUMN public.stock_transfers.transfer_scope IS
  'inter_site uses the shipping lifecycle; intra_site is an atomic warehouse-kitchen movement completed immediately.';

-- ---------------------------------------------------------------------------
-- Location topology and immutable order/hold routing
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.assert_inventory_site_warehouse(
  p_tenant_id bigint,
  p_branch_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_branch_kind text;
  v_warehouse_count integer;
  v_kitchen_count integer;
  v_receive_count integer;
  v_issue_count integer;
  v_consumption_count integer;
  v_consumption_kind text;
  v_split_enabled boolean := false;
BEGIN
  SELECT branch.branch_kind
  INTO v_branch_kind
  FROM public.branches AS branch
  WHERE branch.id = p_branch_id
    AND branch.tenant_id = p_tenant_id
    AND branch.is_active;

  IF NOT FOUND OR v_branch_kind NOT IN ('branch', 'central_supply', 'central_kitchen') THEN
    RETURN;
  END IF;

  SELECT
    count(*) FILTER (WHERE location_kind = 'warehouse')::integer,
    count(*) FILTER (WHERE location_kind = 'kitchen')::integer,
    count(*) FILTER (WHERE is_default_receive)::integer,
    count(*) FILTER (WHERE is_default_issue)::integer,
    count(*) FILTER (WHERE is_default_consumption)::integer,
    max(location_kind) FILTER (WHERE is_default_consumption)
  INTO v_warehouse_count, v_kitchen_count, v_receive_count,
       v_issue_count, v_consumption_count, v_consumption_kind
  FROM public.inventory_locations
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND is_active;

  IF v_warehouse_count <> 1
     OR v_receive_count <> 1
     OR v_issue_count <> 1
     OR v_consumption_count <> 1 THEN
    RAISE EXCEPTION 'inventory_site_defaults_invalid:%', p_branch_id
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_locations
    WHERE tenant_id = p_tenant_id
      AND branch_id = p_branch_id
      AND is_active
      AND (is_default_receive OR is_default_issue)
      AND location_kind <> 'warehouse'
  ) THEN
    RAISE EXCEPTION 'inventory_site_warehouse_must_own_receive_issue:%', p_branch_id
      USING ERRCODE = '23514';
  END IF;

  IF v_branch_kind = 'branch' THEN
    SELECT coalesce(flag.enabled, false)
    INTO v_split_enabled
    FROM public.branch_feature_flags AS flag
    WHERE flag.branch_id = p_branch_id
      AND flag.flag_key = 'branch_kitchen_inventory_split';
    v_split_enabled := coalesce(v_split_enabled, false);

    IF v_kitchen_count > 1 OR EXISTS (
      SELECT 1
      FROM public.inventory_locations
      WHERE tenant_id = p_tenant_id
        AND branch_id = p_branch_id
        AND is_active
        AND location_kind NOT IN ('warehouse', 'kitchen')
    ) THEN
      RAISE EXCEPTION 'branch_inventory_topology_invalid:%', p_branch_id
        USING ERRCODE = '23514';
    END IF;
    IF (v_split_enabled AND (
          v_kitchen_count <> 1 OR v_consumption_kind <> 'kitchen'
        ))
       OR (NOT v_split_enabled AND v_consumption_kind <> 'warehouse') THEN
      RAISE EXCEPTION 'branch_inventory_consumption_default_invalid:%', p_branch_id
        USING ERRCODE = '23514';
    END IF;
  ELSIF v_kitchen_count > 0 THEN
    RAISE EXCEPTION 'branch_kitchen_location_requires_store_branch:%', p_branch_id
      USING ERRCODE = '23514';
  END IF;

  IF v_branch_kind <> 'branch' AND v_consumption_kind <> 'warehouse' THEN
    RAISE EXCEPTION 'inventory_site_consumption_default_invalid:%', p_branch_id
      USING ERRCODE = '23514';
  END IF;

  IF v_branch_kind <> 'central_kitchen' AND EXISTS (
    SELECT 1
    FROM public.inventory_locations
    WHERE tenant_id = p_tenant_id
      AND branch_id = p_branch_id
      AND is_active
      AND location_kind = 'production_storage'
  ) THEN
    RAISE EXCEPTION 'production_storage_requires_central_kitchen:%', p_branch_id
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_branch_inventory_location_defaults(
  p_tenant_id bigint,
  p_branch_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_branch_kind text;
  v_warehouse_id bigint;
  v_kitchen_id bigint;
  v_split_enabled boolean := false;
  v_warehouse_name text;
BEGIN
  SELECT branch.branch_kind
  INTO v_branch_kind
  FROM public.branches AS branch
  WHERE branch.id = p_branch_id
    AND branch.tenant_id = p_tenant_id
    AND branch.is_active
  FOR UPDATE;

  IF NOT FOUND OR v_branch_kind NOT IN ('branch', 'central_supply', 'central_kitchen') THEN
    RETURN;
  END IF;

  v_warehouse_name := CASE v_branch_kind
    WHEN 'central_supply' THEN 'Kho Tổng'
    WHEN 'central_kitchen' THEN 'Kho Bếp Trung Tâm'
    ELSE 'Kho chi nhánh'
  END;

  SELECT location.id
  INTO v_warehouse_id
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = p_tenant_id
    AND location.branch_id = p_branch_id
    AND location.location_kind = 'warehouse'
  ORDER BY location.is_active DESC, location.sort_order, location.id
  LIMIT 1
  FOR UPDATE;

  IF v_warehouse_id IS NULL THEN
    INSERT INTO public.inventory_locations (
      tenant_id, branch_id, code, name, location_kind, is_active,
      is_default_receive, is_default_issue, is_default_consumption, sort_order
    ) VALUES (
      p_tenant_id, p_branch_id, 'main_warehouse', v_warehouse_name, 'warehouse',
      TRUE, TRUE, TRUE, TRUE, 0
    ) RETURNING id INTO v_warehouse_id;
  END IF;

  IF v_branch_kind = 'branch' THEN
    SELECT coalesce(flag.enabled, false)
    INTO v_split_enabled
    FROM public.branch_feature_flags AS flag
    WHERE flag.branch_id = p_branch_id
      AND flag.flag_key = 'branch_kitchen_inventory_split';

    SELECT location.id
    INTO v_kitchen_id
    FROM public.inventory_locations AS location
    WHERE location.tenant_id = p_tenant_id
      AND location.branch_id = p_branch_id
      AND location.location_kind = 'kitchen'
      AND location.is_active
    ORDER BY location.sort_order, location.id
    LIMIT 1;

    v_split_enabled := coalesce(v_split_enabled, false) AND v_kitchen_id IS NOT NULL;
  END IF;

  UPDATE public.inventory_locations
  SET is_default_receive = id = v_warehouse_id,
      is_default_issue = id = v_warehouse_id,
      is_default_consumption = CASE
        WHEN v_split_enabled THEN id = v_kitchen_id
        ELSE id = v_warehouse_id
      END,
      is_active = CASE
        WHEN id = v_warehouse_id THEN TRUE
        ELSE is_active
      END,
      name = CASE WHEN id = v_warehouse_id THEN v_warehouse_name ELSE name END,
      sort_order = CASE WHEN id = v_warehouse_id THEN 0 ELSE sort_order END,
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id;

  IF v_branch_kind = 'branch' THEN
    INSERT INTO public.branch_feature_flags (
      branch_id, flag_key, enabled, enabled_at, disabled_at, updated_at
    ) VALUES (
      p_branch_id, 'pos_stock_outcome_posting', TRUE, now(), NULL, now()
    ) ON CONFLICT (branch_id, flag_key) DO NOTHING;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_branch_inventory_location_defaults(
  bigint, bigint
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_branch_inventory_location_defaults(
  bigint, bigint
) TO service_role;

CREATE OR REPLACE FUNCTION private.route_stock_consumption_location() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_location record;
  v_hold_token uuid;
  v_hold_location_count integer;
BEGIN
  IF TG_TABLE_NAME = 'orders'
     AND TG_OP = 'UPDATE'
     AND NEW.stock_consumption_location_id IS DISTINCT FROM OLD.stock_consumption_location_id THEN
    RAISE EXCEPTION 'order_stock_consumption_location_immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'branch_menu_item_daily_holds'
     AND TG_OP = 'UPDATE'
     AND NEW.stock_consumption_location_id IS DISTINCT FROM OLD.stock_consumption_location_id THEN
    RAISE EXCEPTION 'hold_stock_consumption_location_immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'orders'
     AND NEW.stock_consumption_location_id IS NULL
     AND NEW.split_from_order_id IS NOT NULL THEN
    SELECT source_order.stock_consumption_location_id
    INTO NEW.stock_consumption_location_id
    FROM public.orders AS source_order
    WHERE source_order.id = NEW.split_from_order_id
      AND source_order.tenant_id = NEW.tenant_id
      AND source_order.branch_id = NEW.branch_id;
  END IF;

  -- create_order_with_daily_limit_hold sets this transaction-local token
  -- before inserting the order. Snapshot the same location as its active hold.
  IF TG_TABLE_NAME = 'orders'
     AND NEW.stock_consumption_location_id IS NULL THEN
    BEGIN
      v_hold_token := nullif(
        current_setting('comtammatu.daily_limit_hold_token', true),
        ''
      )::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_hold_token := NULL;
    END;

    IF v_hold_token IS NOT NULL THEN
      SELECT
        min(hold.stock_consumption_location_id),
        count(DISTINCT hold.stock_consumption_location_id)
      INTO NEW.stock_consumption_location_id, v_hold_location_count
      FROM public.branch_menu_item_daily_holds AS hold
      WHERE hold.tenant_id = NEW.tenant_id
        AND hold.branch_id = NEW.branch_id
        AND hold.hold_token = v_hold_token
        AND hold.committed_at IS NULL
        AND hold.released_at IS NULL
        AND hold.expires_at > now();

      IF v_hold_location_count > 1 THEN
        RAISE EXCEPTION 'daily_limit_holds_span_consumption_locations'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF NEW.stock_consumption_location_id IS NULL THEN
    SELECT location.id, location.tenant_id, location.branch_id
    INTO v_location
    FROM public.inventory_locations AS location
    WHERE location.tenant_id = NEW.tenant_id
      AND location.branch_id = NEW.branch_id
      AND location.is_active
      AND location.is_default_consumption
      AND location.location_kind IN ('warehouse', 'kitchen')
    ORDER BY location.id
    LIMIT 1;
    NEW.stock_consumption_location_id := v_location.id;
  ELSE
    SELECT location.id, location.tenant_id, location.branch_id
    INTO v_location
    FROM public.inventory_locations AS location
    WHERE location.id = NEW.stock_consumption_location_id
      AND location.tenant_id = NEW.tenant_id
      AND location.branch_id = NEW.branch_id
      AND location.is_active
      AND location.location_kind IN ('warehouse', 'kitchen');
  END IF;

  IF v_location.id IS NULL THEN
    RAISE EXCEPTION 'stock_consumption_location_invalid'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_route_stock_consumption_location
  BEFORE INSERT OR UPDATE OF stock_consumption_location_id
  ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.route_stock_consumption_location();

CREATE TRIGGER branch_menu_holds_route_stock_consumption_location
  BEFORE INSERT OR UPDATE OF stock_consumption_location_id
  ON public.branch_menu_item_daily_holds
  FOR EACH ROW EXECUTE FUNCTION private.route_stock_consumption_location();

CREATE OR REPLACE FUNCTION private.enforce_order_hold_consumption_location() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.order_id IS NOT NULL AND NEW.committed_at IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.orders AS order_row
    WHERE order_row.id = NEW.order_id
      AND order_row.tenant_id = NEW.tenant_id
      AND order_row.branch_id = NEW.branch_id
      AND order_row.stock_consumption_location_id = NEW.stock_consumption_location_id
  ) THEN
    RAISE EXCEPTION 'hold_order_consumption_location_mismatch'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER branch_menu_holds_order_location_check
  AFTER INSERT OR UPDATE OF order_id, committed_at, stock_consumption_location_id
  ON public.branch_menu_item_daily_holds
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private.enforce_order_hold_consumption_location();

CREATE OR REPLACE FUNCTION private.enforce_order_lineage_consumption_location() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.split_from_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.orders AS source_order
    WHERE source_order.id = NEW.split_from_order_id
      AND source_order.tenant_id = NEW.tenant_id
      AND source_order.branch_id = NEW.branch_id
      AND source_order.stock_consumption_location_id = NEW.stock_consumption_location_id
  ) THEN
    RAISE EXCEPTION 'split_order_consumption_location_mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.merged_into_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.orders AS target_order
    WHERE target_order.id = NEW.merged_into_order_id
      AND target_order.tenant_id = NEW.tenant_id
      AND target_order.branch_id = NEW.branch_id
      AND target_order.stock_consumption_location_id = NEW.stock_consumption_location_id
  ) THEN
    RAISE EXCEPTION 'merge_order_consumption_location_mismatch'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER orders_consumption_location_lineage_check
  AFTER INSERT OR UPDATE OF split_from_order_id, merged_into_order_id
  ON public.orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private.enforce_order_lineage_consumption_location();

-- ---------------------------------------------------------------------------
-- Inter-site and intra-site transfer invariants
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_stock_transfer_direction() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_source_kind text;
  v_target_kind text;
  v_original public.stock_transfers%ROWTYPE;
BEGIN
  SELECT source.location_kind
  INTO v_source_kind
  FROM public.inventory_locations AS source
  WHERE source.id = NEW.from_location_id
    AND source.tenant_id = NEW.tenant_id
    AND source.branch_id = NEW.from_branch_id
    AND source.is_active;

  SELECT target.location_kind
  INTO v_target_kind
  FROM public.inventory_locations AS target
  WHERE target.id = NEW.to_location_id
    AND target.tenant_id = NEW.tenant_id
    AND target.branch_id = NEW.to_branch_id
    AND target.is_active;

  IF v_source_kind IS NULL OR v_target_kind IS NULL THEN
    RAISE EXCEPTION 'stock_transfers: endpoint invalid'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.transfer_scope = 'inter_site' THEN
    IF NEW.from_branch_id = NEW.to_branch_id
       OR v_source_kind <> 'warehouse'
       OR v_target_kind <> 'warehouse'
       OR NEW.reverses_transfer_id IS NOT NULL THEN
      RAISE EXCEPTION 'inter_site_transfer_requires_distinct_warehouse_sites'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.transfer_scope = 'intra_site' THEN
    IF NEW.from_branch_id <> NEW.to_branch_id
       OR NEW.from_location_id = NEW.to_location_id
       OR (
         ARRAY[v_source_kind, v_target_kind]::text[]
           @> ARRAY['warehouse', 'kitchen']::text[]
       ) IS NOT TRUE
       OR NEW.status <> 'received' THEN
      RAISE EXCEPTION 'intra_site_transfer_requires_warehouse_kitchen_pair'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.reverses_transfer_id IS NOT NULL THEN
      SELECT transfer.*
      INTO v_original
      FROM public.stock_transfers AS transfer
      WHERE transfer.id = NEW.reverses_transfer_id
        AND transfer.tenant_id = NEW.tenant_id
        AND transfer.transfer_scope = 'intra_site'
        AND transfer.status = 'received';
      IF NOT FOUND
         OR v_original.from_location_id <> NEW.to_location_id
         OR v_original.to_location_id <> NEW.from_location_id THEN
        RAISE EXCEPTION 'intra_site_reversal_reference_invalid'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'stock_transfer_scope_invalid' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_stock_transfer_direction() IS
  'Validates inter-site warehouse endpoints or a same-branch warehouse-kitchen pair.';

REVOKE EXECUTE ON FUNCTION public.enforce_stock_transfer_direction()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_stock_transfer_direction()
  TO service_role;

CREATE OR REPLACE FUNCTION private.protect_intra_site_transfer_document() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_transfer_id bigint := OLD.id;
  v_scope text := OLD.transfer_scope;
BEGIN
  IF v_scope = 'intra_site' AND TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'intra_site_transfer_document_immutable:%', v_transfer_id
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stock_transfers_protect_intra_site_document
  BEFORE UPDATE OR DELETE ON public.stock_transfers
  FOR EACH ROW EXECUTE FUNCTION private.protect_intra_site_transfer_document();

CREATE OR REPLACE FUNCTION private.protect_intra_site_transfer_item() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_transfer_id bigint;
  v_tenant_id bigint;
  v_scope text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_transfer_id := NEW.transfer_id;
    v_tenant_id := NEW.tenant_id;
  ELSE
    v_transfer_id := OLD.transfer_id;
    v_tenant_id := OLD.tenant_id;
  END IF;

  SELECT transfer.transfer_scope
  INTO v_scope
  FROM public.stock_transfers AS transfer
  WHERE transfer.id = v_transfer_id
    AND transfer.tenant_id = v_tenant_id;

  IF v_scope IS DISTINCT FROM 'intra_site' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'intra_site_transfer_items_immutable:%', v_transfer_id
      USING ERRCODE = '23514';
  END IF;
  IF NEW.quantity <= 0
     OR NEW.quantity_received IS DISTINCT FROM NEW.quantity
     OR EXISTS (
       SELECT 1
       FROM public.stock_movements AS movement
       WHERE movement.tenant_id = NEW.tenant_id
         AND movement.transfer_id = NEW.transfer_id
     ) THEN
    RAISE EXCEPTION 'intra_site_transfer_item_insert_invalid:%', v_transfer_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stock_transfer_items_protect_intra_site_document
  BEFORE INSERT OR UPDATE OR DELETE ON public.stock_transfer_items
  FOR EACH ROW EXECUTE FUNCTION private.protect_intra_site_transfer_item();

CREATE OR REPLACE FUNCTION private.assert_intra_site_transfer_complete() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_transfer_id bigint;
  v_transfer public.stock_transfers%ROWTYPE;
  v_item_count integer;
  v_movement_count integer;
BEGIN
  IF TG_TABLE_NAME = 'stock_transfers' THEN
    v_transfer_id := NEW.id;
  ELSE
    v_transfer_id := NEW.transfer_id;
  END IF;

  SELECT transfer.*
  INTO v_transfer
  FROM public.stock_transfers AS transfer
  WHERE transfer.id = v_transfer_id;
  IF NOT FOUND OR v_transfer.transfer_scope <> 'intra_site' THEN
    RETURN NULL;
  END IF;

  SELECT count(*)
  INTO v_item_count
  FROM public.stock_transfer_items AS item
  WHERE item.tenant_id = v_transfer.tenant_id
    AND item.transfer_id = v_transfer.id
    AND item.quantity > 0
    AND item.quantity_received = item.quantity;

  SELECT count(*)
  INTO v_movement_count
  FROM public.stock_movements AS movement
  JOIN public.stock_transfer_items AS item
    ON item.tenant_id = movement.tenant_id
   AND item.transfer_id = movement.transfer_id
   AND item.ingredient_id = movement.ingredient_id
  WHERE movement.tenant_id = v_transfer.tenant_id
    AND movement.transfer_id = v_transfer.id
    AND (
      (
        movement.type = 'transfer_out'
        AND movement.location_id = v_transfer.from_location_id
        AND movement.quantity_change = -public.inv_to_base_for_tenant(
          v_transfer.tenant_id,
          item.ingredient_id,
          item.entry_unit_id,
          item.quantity
        )
      )
      OR (
        movement.type = 'transfer_in'
        AND movement.location_id = v_transfer.to_location_id
        AND movement.quantity_change = public.inv_to_base_for_tenant(
          v_transfer.tenant_id,
          item.ingredient_id,
          item.entry_unit_id,
          item.quantity
        )
      )
    );

  IF v_item_count = 0
     OR v_movement_count <> v_item_count * 2
     OR EXISTS (
       SELECT 1
       FROM public.stock_movements AS movement
       WHERE movement.tenant_id = v_transfer.tenant_id
         AND movement.transfer_id = v_transfer.id
         AND movement.type NOT IN ('transfer_out', 'transfer_in')
     ) THEN
    RAISE EXCEPTION 'intra_site_transfer_ledger_incomplete:%', v_transfer.id
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER stock_transfers_intra_site_complete_check
  AFTER INSERT ON public.stock_transfers
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private.assert_intra_site_transfer_complete();

CREATE CONSTRAINT TRIGGER stock_transfer_items_intra_site_complete_check
  AFTER INSERT ON public.stock_transfer_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private.assert_intra_site_transfer_complete();

REVOKE EXECUTE ON FUNCTION private.protect_intra_site_transfer_document()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.protect_intra_site_transfer_item()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.assert_intra_site_transfer_complete()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.protect_intra_site_transfer_document()
  TO service_role;
GRANT EXECUTE ON FUNCTION private.protect_intra_site_transfer_item()
  TO service_role;
GRANT EXECUTE ON FUNCTION private.assert_intra_site_transfer_complete()
  TO service_role;

CREATE OR REPLACE FUNCTION private.assert_stock_transfer_warehouse_endpoints(
  p_transfer_id bigint,
  p_tenant_id bigint
) RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_transfer public.stock_transfers%ROWTYPE;
BEGIN
  SELECT transfer.*
  INTO v_transfer
  FROM public.stock_transfers AS transfer
  WHERE transfer.id = p_transfer_id
    AND transfer.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_transfer.transfer_scope <> 'inter_site' THEN
    RAISE EXCEPTION 'intra_site_transfer_is_immediate' USING ERRCODE = '23514';
  END IF;

  PERFORM location.id
  FROM public.inventory_locations AS location
  WHERE location.id = ANY(ARRAY[
    v_transfer.from_location_id,
    v_transfer.to_location_id
  ]::bigint[])
  ORDER BY location.id
  FOR UPDATE;

  IF v_transfer.from_branch_id = v_transfer.to_branch_id
     OR NOT EXISTS (
       SELECT 1
       FROM public.inventory_locations AS source_location
       WHERE source_location.id = v_transfer.from_location_id
         AND source_location.tenant_id = p_tenant_id
         AND source_location.branch_id = v_transfer.from_branch_id
         AND source_location.location_kind = 'warehouse'
         AND source_location.is_active
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.inventory_locations AS target_location
       WHERE target_location.id = v_transfer.to_location_id
         AND target_location.tenant_id = p_tenant_id
         AND target_location.branch_id = v_transfer.to_branch_id
         AND target_location.location_kind = 'warehouse'
         AND target_location.is_active
     ) THEN
    RAISE EXCEPTION 'transfer_warehouse_location_invalid'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.execute_intra_site_transfer(
  p_branch_id bigint,
  p_from_location_id bigint,
  p_to_location_id bigint,
  p_lines jsonb,
  p_notes text,
  p_idempotency_key uuid,
  p_reverses_transfer_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_existing public.stock_transfers%ROWTYPE;
  v_from_kind text;
  v_to_kind text;
  v_transfer_id bigint;
  v_transfer_number text;
  v_line record;
  v_entry_unit_id bigint;
  v_base_quantity numeric(15,3);
  v_available numeric(15,3);
  v_unit_cost numeric(24,8);
  v_line_count integer;
  v_distinct_count integer;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_idempotency_key IS NULL
     OR p_lines IS NULL
     OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'intra_site_transfer_invalid' USING ERRCODE = '22023';
  END IF;
  IF public.auth_role() NOT IN ('owner', 'branch_manager') THEN
    RAISE EXCEPTION 'forbidden_intra_site_transfer' USING ERRCODE = '42501';
  END IF;
  IF public.auth_role() = 'branch_manager'
     AND public.auth_branch_id() IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'forbidden_intra_site_transfer_scope' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_tenant::text || ':' || p_idempotency_key::text, 0)
  );

  SELECT transfer.*
  INTO v_existing
  FROM public.stock_transfers AS transfer
  WHERE transfer.tenant_id = v_tenant
    AND transfer.idempotency_key = p_idempotency_key
    AND transfer.transfer_scope = 'intra_site'
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.from_branch_id IS DISTINCT FROM p_branch_id
       OR v_existing.to_branch_id IS DISTINCT FROM p_branch_id
       OR v_existing.from_location_id IS DISTINCT FROM p_from_location_id
       OR v_existing.to_location_id IS DISTINCT FROM p_to_location_id
       OR v_existing.reverses_transfer_id IS DISTINCT FROM p_reverses_transfer_id
       OR v_existing.notes IS DISTINCT FROM nullif(btrim(p_notes), '')
       OR jsonb_array_length(p_lines) IS DISTINCT FROM (
         SELECT count(*)
         FROM public.stock_transfer_items AS item
         WHERE item.tenant_id = v_tenant
           AND item.transfer_id = v_existing.id
       )
       OR EXISTS (
         WITH requested AS (
           SELECT
             coalesce(parsed.ingredient_id, parsed."ingredientId") AS ingredient_id,
             parsed.quantity,
             coalesce(parsed.entry_unit_id, parsed."entryUnitId") AS entry_unit_id
           FROM jsonb_to_recordset(p_lines) AS parsed(
             ingredient_id bigint,
             "ingredientId" bigint,
             quantity numeric,
             entry_unit_id bigint,
             "entryUnitId" bigint
           )
         )
         SELECT 1
         FROM requested
         FULL JOIN public.stock_transfer_items AS item
           ON item.tenant_id = v_tenant
          AND item.transfer_id = v_existing.id
          AND item.ingredient_id = requested.ingredient_id
         WHERE requested.ingredient_id IS NULL
            OR item.ingredient_id IS NULL
            OR requested.quantity IS DISTINCT FROM item.quantity
            OR (
              requested.entry_unit_id IS NOT NULL
              AND requested.entry_unit_id IS DISTINCT FROM item.entry_unit_id
            )
       ) THEN
      RAISE EXCEPTION 'intra_site_transfer_idempotency_conflict'
        USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'transfer_number', v_existing.transfer_number,
      'idempotent', TRUE
    );
  END IF;

  PERFORM branch.id
  FROM public.branches AS branch
  WHERE branch.id = p_branch_id
    AND branch.tenant_id = v_tenant
    AND branch.branch_kind = 'branch'
    AND branch.is_active
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'intra_site_transfer_branch_invalid' USING ERRCODE = '23514';
  END IF;

  SELECT location.location_kind
  INTO v_from_kind
  FROM public.inventory_locations AS location
  WHERE location.id = p_from_location_id
    AND location.tenant_id = v_tenant
    AND location.branch_id = p_branch_id
    AND location.is_active
  FOR UPDATE;

  SELECT location.location_kind
  INTO v_to_kind
  FROM public.inventory_locations AS location
  WHERE location.id = p_to_location_id
    AND location.tenant_id = v_tenant
    AND location.branch_id = p_branch_id
    AND location.is_active
  FOR UPDATE;

  IF p_from_location_id = p_to_location_id
     OR (
       ARRAY[v_from_kind, v_to_kind]::text[]
         @> ARRAY['warehouse', 'kitchen']::text[]
     ) IS NOT TRUE THEN
    RAISE EXCEPTION 'intra_site_transfer_requires_warehouse_kitchen_pair'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*),
    count(DISTINCT coalesce(parsed.ingredient_id, parsed."ingredientId"))
  INTO v_line_count, v_distinct_count
  FROM jsonb_to_recordset(p_lines) AS parsed(
    ingredient_id bigint,
    "ingredientId" bigint,
    quantity numeric,
    entry_unit_id bigint,
    "entryUnitId" bigint
  );
  IF v_line_count <> v_distinct_count THEN
    RAISE EXCEPTION 'intra_site_transfer_duplicate_ingredient'
      USING ERRCODE = '23505';
  END IF;

  -- Lock every source stock row in ingredient order before validating any
  -- quantity. Any shortage raises and rolls the entire transaction back.
  FOR v_line IN
    SELECT
      coalesce(parsed.ingredient_id, parsed."ingredientId") AS ingredient_id,
      parsed.quantity,
      coalesce(parsed.entry_unit_id, parsed."entryUnitId") AS entry_unit_id
    FROM jsonb_to_recordset(p_lines) AS parsed(
      ingredient_id bigint,
      "ingredientId" bigint,
      quantity numeric,
      entry_unit_id bigint,
      "entryUnitId" bigint
    )
    ORDER BY coalesce(parsed.ingredient_id, parsed."ingredientId")
  LOOP
    IF v_line.ingredient_id IS NULL
       OR v_line.quantity IS NULL
       OR v_line.quantity <= 0
       OR v_line.quantity IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) THEN
      RAISE EXCEPTION 'intra_site_transfer_line_invalid' USING ERRCODE = '22023';
    END IF;

    v_entry_unit_id := v_line.entry_unit_id;
    IF v_entry_unit_id IS NULL THEN
      SELECT ingredient_unit.unit_id
      INTO v_entry_unit_id
      FROM public.ingredient_units AS ingredient_unit
      JOIN public.units AS unit
        ON unit.id = ingredient_unit.unit_id
       AND unit.tenant_id = ingredient_unit.tenant_id
       AND unit.is_active
      WHERE ingredient_unit.tenant_id = v_tenant
        AND ingredient_unit.ingredient_id = v_line.ingredient_id
        AND ingredient_unit.is_base
        AND ingredient_unit.is_active
      ORDER BY ingredient_unit.sort_order, ingredient_unit.id
      LIMIT 1;
    END IF;

    IF v_entry_unit_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.ingredient_units AS ingredient_unit
      JOIN public.units AS unit
        ON unit.id = ingredient_unit.unit_id
       AND unit.tenant_id = ingredient_unit.tenant_id
       AND unit.is_active
      WHERE ingredient_unit.tenant_id = v_tenant
        AND ingredient_unit.ingredient_id = v_line.ingredient_id
        AND ingredient_unit.unit_id = v_entry_unit_id
        AND ingredient_unit.is_active
    ) THEN
      RAISE EXCEPTION 'entry_unit_not_found:%', v_line.ingredient_id
        USING ERRCODE = '23503';
    END IF;

    v_base_quantity := public.inv_to_base_for_tenant(
      v_tenant,
      v_line.ingredient_id,
      v_entry_unit_id,
      v_line.quantity
    );

    INSERT INTO public.stock_levels (
      tenant_id, branch_id, location_id, ingredient_id, current_quantity
    ) VALUES (
      v_tenant, p_branch_id, p_from_location_id, v_line.ingredient_id, 0
    ) ON CONFLICT ON CONSTRAINT stock_levels_ingredient_branch_location_tenant_key
      DO NOTHING;

    SELECT stock.current_quantity, stock.avg_unit_cost
    INTO v_available, v_unit_cost
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = p_branch_id
      AND stock.location_id = p_from_location_id
      AND stock.ingredient_id = v_line.ingredient_id
    FOR UPDATE;

    IF coalesce(v_available, 0) < v_base_quantity THEN
      RAISE EXCEPTION 'intra_site_transfer_insufficient_stock:%', v_line.ingredient_id
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  v_transfer_number := public.next_inventory_doc_number(v_tenant, 'transfer');
  INSERT INTO public.stock_transfers (
    tenant_id, from_branch_id, to_branch_id, from_location_id, to_location_id,
    transfer_number, status, transfer_scope, idempotency_key,
    reverses_transfer_id, notes, created_by, received_at
  ) VALUES (
    v_tenant, p_branch_id, p_branch_id, p_from_location_id, p_to_location_id,
    v_transfer_number, 'received', 'intra_site', p_idempotency_key,
    p_reverses_transfer_id, nullif(btrim(p_notes), ''), v_actor, now()
  ) RETURNING id INTO v_transfer_id;

  FOR v_line IN
    SELECT
      coalesce(parsed.ingredient_id, parsed."ingredientId") AS ingredient_id,
      parsed.quantity,
      coalesce(parsed.entry_unit_id, parsed."entryUnitId") AS entry_unit_id
    FROM jsonb_to_recordset(p_lines) AS parsed(
      ingredient_id bigint,
      "ingredientId" bigint,
      quantity numeric,
      entry_unit_id bigint,
      "entryUnitId" bigint
    )
    ORDER BY coalesce(parsed.ingredient_id, parsed."ingredientId")
  LOOP
    v_entry_unit_id := v_line.entry_unit_id;
    IF v_entry_unit_id IS NULL THEN
      SELECT ingredient_unit.unit_id
      INTO v_entry_unit_id
      FROM public.ingredient_units AS ingredient_unit
      WHERE ingredient_unit.tenant_id = v_tenant
        AND ingredient_unit.ingredient_id = v_line.ingredient_id
        AND ingredient_unit.is_base
        AND ingredient_unit.is_active
      ORDER BY ingredient_unit.sort_order, ingredient_unit.id
      LIMIT 1;
    END IF;
    v_base_quantity := public.inv_to_base_for_tenant(
      v_tenant, v_line.ingredient_id, v_entry_unit_id, v_line.quantity
    );
    SELECT stock.avg_unit_cost
    INTO v_unit_cost
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = p_branch_id
      AND stock.location_id = p_from_location_id
      AND stock.ingredient_id = v_line.ingredient_id;

    INSERT INTO public.stock_transfer_items (
      tenant_id, transfer_id, ingredient_id, quantity, quantity_received,
      entry_unit_id, unit_cost_at_ship
    ) VALUES (
      v_tenant, v_transfer_id, v_line.ingredient_id, v_line.quantity,
      v_line.quantity, v_entry_unit_id, round(coalesce(v_unit_cost, 0), 2)
    );

    INSERT INTO public.stock_levels (
      tenant_id, branch_id, location_id, ingredient_id, current_quantity
    ) VALUES (
      v_tenant, p_branch_id, p_to_location_id, v_line.ingredient_id, 0
    ) ON CONFLICT ON CONSTRAINT stock_levels_ingredient_branch_location_tenant_key
      DO NOTHING;
  END LOOP;

  -- Transfer-out movements are intentionally posted before every transfer-in.
  INSERT INTO public.stock_movements (
    tenant_id, branch_id, ingredient_id, type, quantity_change, reason,
    created_by, transfer_id, unit_cost, location_id, entry_unit_id, entry_quantity
  )
  SELECT
    v_tenant, p_branch_id, item.ingredient_id, 'transfer_out',
    -public.inv_to_base_for_tenant(v_tenant, item.ingredient_id, item.entry_unit_id, item.quantity),
    coalesce(nullif(btrim(p_notes), ''), 'Điều chuyển nội bộ Kho ↔ Bếp'),
    v_actor, v_transfer_id, item.unit_cost_at_ship, p_from_location_id,
    item.entry_unit_id, item.quantity
  FROM public.stock_transfer_items AS item
  WHERE item.tenant_id = v_tenant
    AND item.transfer_id = v_transfer_id
  ORDER BY item.ingredient_id;

  INSERT INTO public.stock_movements (
    tenant_id, branch_id, ingredient_id, type, quantity_change, reason,
    created_by, transfer_id, unit_cost, location_id, entry_unit_id, entry_quantity
  )
  SELECT
    v_tenant, p_branch_id, item.ingredient_id, 'transfer_in',
    public.inv_to_base_for_tenant(v_tenant, item.ingredient_id, item.entry_unit_id, item.quantity),
    coalesce(nullif(btrim(p_notes), ''), 'Điều chuyển nội bộ Kho ↔ Bếp'),
    v_actor, v_transfer_id, item.unit_cost_at_ship, p_to_location_id,
    item.entry_unit_id, item.quantity
  FROM public.stock_transfer_items AS item
  WHERE item.tenant_id = v_tenant
    AND item.transfer_id = v_transfer_id
  ORDER BY item.ingredient_id;

  PERFORM public.log_audit(
    CASE WHEN p_reverses_transfer_id IS NULL
      THEN 'inventory.transfer.intra_site_committed'
      ELSE 'inventory.transfer.intra_site_reversed'
    END,
    'stock_transfer',
    v_transfer_id,
    NULL,
    jsonb_build_object(
      'transfer_scope', 'intra_site',
      'from_location_id', p_from_location_id,
      'to_location_id', p_to_location_id,
      'reverses_transfer_id', p_reverses_transfer_id
    )
  );

  RETURN jsonb_build_object(
    'id', v_transfer_id,
    'transfer_number', v_transfer_number,
    'idempotent', FALSE
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_intra_site_transfer(
  p_branch_id bigint,
  p_from_location_id bigint,
  p_to_location_id bigint,
  p_lines jsonb,
  p_notes text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  RETURN private.execute_intra_site_transfer(
    p_branch_id,
    p_from_location_id,
    p_to_location_id,
    p_lines,
    p_notes,
    p_idempotency_key,
    NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_intra_site_transfer(
  p_transfer_id bigint,
  p_lines jsonb,
  p_notes text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_original public.stock_transfers%ROWTYPE;
  v_existing_reverse public.stock_transfers%ROWTYPE;
  v_lines jsonb;
  v_line record;
  v_original_quantity numeric;
  v_original_unit_id bigint;
  v_reversed_quantity numeric;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT transfer.*
  INTO v_original
  FROM public.stock_transfers AS transfer
  WHERE transfer.id = p_transfer_id
    AND transfer.tenant_id = v_tenant
    AND transfer.transfer_scope = 'intra_site'
    AND transfer.status = 'received'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'intra_site_transfer_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF public.auth_role() NOT IN ('owner', 'branch_manager')
     OR (
       public.auth_role() = 'branch_manager'
       AND public.auth_branch_id() IS DISTINCT FROM v_original.from_branch_id
     ) THEN
    RAISE EXCEPTION 'forbidden_intra_site_transfer' USING ERRCODE = '42501';
  END IF;

  SELECT transfer.*
  INTO v_existing_reverse
  FROM public.stock_transfers AS transfer
  WHERE transfer.tenant_id = v_tenant
    AND transfer.idempotency_key = p_idempotency_key
    AND transfer.transfer_scope = 'intra_site'
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_reverse.reverses_transfer_id IS DISTINCT FROM v_original.id
       OR v_existing_reverse.notes IS DISTINCT FROM concat_ws(
         ': ',
         'Đảo phiếu ' || v_original.transfer_number,
         nullif(btrim(p_notes), '')
       ) THEN
      RAISE EXCEPTION 'intra_site_transfer_idempotency_conflict'
        USING ERRCODE = '23505';
    END IF;
    IF p_lines IS NULL OR p_lines = '[]'::jsonb THEN
      RETURN jsonb_build_object(
        'id', v_existing_reverse.id,
        'transfer_number', v_existing_reverse.transfer_number,
        'idempotent', TRUE
      );
    END IF;
    RETURN private.execute_intra_site_transfer(
      v_original.from_branch_id,
      v_original.to_location_id,
      v_original.from_location_id,
      p_lines,
      concat_ws(': ', 'Đảo phiếu ' || v_original.transfer_number, nullif(btrim(p_notes), '')),
      p_idempotency_key,
      v_original.id
    );
  END IF;

  IF p_lines IS NULL OR p_lines = '[]'::jsonb THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'ingredientId', item.ingredient_id,
      'quantity', item.quantity - coalesce(reversed.quantity, 0),
      'entryUnitId', item.entry_unit_id
    ) ORDER BY item.ingredient_id), '[]'::jsonb)
    INTO v_lines
    FROM public.stock_transfer_items AS item
    LEFT JOIN LATERAL (
      SELECT sum(reverse_item.quantity) AS quantity
      FROM public.stock_transfers AS reverse_transfer
      JOIN public.stock_transfer_items AS reverse_item
        ON reverse_item.transfer_id = reverse_transfer.id
       AND reverse_item.tenant_id = reverse_transfer.tenant_id
      WHERE reverse_transfer.tenant_id = v_tenant
        AND reverse_transfer.reverses_transfer_id = v_original.id
        AND reverse_item.ingredient_id = item.ingredient_id
    ) AS reversed ON TRUE
    WHERE item.tenant_id = v_tenant
      AND item.transfer_id = v_original.id
      AND item.quantity - coalesce(reversed.quantity, 0) > 0;
  ELSE
    v_lines := p_lines;
  END IF;

  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'intra_site_transfer_fully_reversed' USING ERRCODE = '23514';
  END IF;

  FOR v_line IN
    SELECT
      coalesce(parsed.ingredient_id, parsed."ingredientId") AS ingredient_id,
      parsed.quantity,
      coalesce(parsed.entry_unit_id, parsed."entryUnitId") AS entry_unit_id
    FROM jsonb_to_recordset(v_lines) AS parsed(
      ingredient_id bigint,
      "ingredientId" bigint,
      quantity numeric,
      entry_unit_id bigint,
      "entryUnitId" bigint
    )
  LOOP
    SELECT item.quantity, item.entry_unit_id
    INTO v_original_quantity, v_original_unit_id
    FROM public.stock_transfer_items AS item
    WHERE item.tenant_id = v_tenant
      AND item.transfer_id = v_original.id
      AND item.ingredient_id = v_line.ingredient_id
    FOR UPDATE;

    SELECT coalesce(sum(reverse_item.quantity), 0)
    INTO v_reversed_quantity
    FROM public.stock_transfers AS reverse_transfer
    JOIN public.stock_transfer_items AS reverse_item
      ON reverse_item.transfer_id = reverse_transfer.id
     AND reverse_item.tenant_id = reverse_transfer.tenant_id
    WHERE reverse_transfer.tenant_id = v_tenant
      AND reverse_transfer.reverses_transfer_id = v_original.id
      AND reverse_item.ingredient_id = v_line.ingredient_id;

    IF v_original_quantity IS NULL
       OR v_line.quantity IS NULL
       OR v_line.quantity <= 0
       OR v_line.entry_unit_id IS DISTINCT FROM v_original_unit_id
       OR v_reversed_quantity + v_line.quantity > v_original_quantity THEN
      RAISE EXCEPTION 'intra_site_transfer_reverse_exceeds_remaining:%',
        v_line.ingredient_id
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN private.execute_intra_site_transfer(
    v_original.from_branch_id,
    v_original.to_location_id,
    v_original.from_location_id,
    v_lines,
    concat_ws(': ', 'Đảo phiếu ' || v_original.transfer_number, nullif(btrim(p_notes), '')),
    p_idempotency_key,
    v_original.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_intra_site_transfer_remaining(
  p_transfer_id bigint
) RETURNS TABLE (
  ingredient_id bigint,
  entry_unit_id bigint,
  original_quantity numeric,
  reversed_quantity numeric,
  remaining_quantity numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_branch_id bigint;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT transfer.from_branch_id
  INTO v_branch_id
  FROM public.stock_transfers AS transfer
  WHERE transfer.id = p_transfer_id
    AND transfer.tenant_id = v_tenant
    AND transfer.transfer_scope = 'intra_site'
    AND transfer.status = 'received';
  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'intra_site_transfer_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_branch_id, 'inventory:read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    item.ingredient_id,
    item.entry_unit_id,
    item.quantity,
    coalesce(sum(reverse_item.quantity), 0),
    greatest(item.quantity - coalesce(sum(reverse_item.quantity), 0), 0)
  FROM public.stock_transfer_items AS item
  LEFT JOIN public.stock_transfers AS reverse_transfer
    ON reverse_transfer.tenant_id = item.tenant_id
   AND reverse_transfer.reverses_transfer_id = item.transfer_id
   AND reverse_transfer.transfer_scope = 'intra_site'
   AND reverse_transfer.status = 'received'
  LEFT JOIN public.stock_transfer_items AS reverse_item
    ON reverse_item.tenant_id = reverse_transfer.tenant_id
   AND reverse_item.transfer_id = reverse_transfer.id
   AND reverse_item.ingredient_id = item.ingredient_id
  WHERE item.tenant_id = v_tenant
    AND item.transfer_id = p_transfer_id
  GROUP BY item.ingredient_id, item.entry_unit_id, item.quantity
  ORDER BY item.ingredient_id;
END;
$$;

ALTER FUNCTION public.create_inventory_document_correction(
  text, bigint, bigint, bigint, numeric, text, uuid
) RENAME TO create_inventory_document_correction_legacy;

CREATE OR REPLACE FUNCTION public.create_inventory_document_correction(
  p_document_type text,
  p_document_id bigint,
  p_branch_id bigint,
  p_ingredient_id bigint,
  p_quantity_change numeric,
  p_reason text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF p_document_type = 'transfer' AND EXISTS (
    SELECT 1
    FROM public.stock_transfers AS transfer
    WHERE transfer.id = p_document_id
      AND transfer.tenant_id = public.auth_tenant_id()
      AND transfer.transfer_scope = 'intra_site'
  ) THEN
    RAISE EXCEPTION 'intra_site_transfer_requires_reversal'
      USING ERRCODE = '23514';
  END IF;

  RETURN public.create_inventory_document_correction_legacy(
    p_document_type,
    p_document_id,
    p_branch_id,
    p_ingredient_id,
    p_quantity_change,
    p_reason,
    p_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION private.execute_intra_site_transfer(
  bigint, bigint, bigint, jsonb, text, uuid, bigint
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.execute_intra_site_transfer(
  bigint, bigint, bigint, jsonb, text, uuid, bigint
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.commit_intra_site_transfer(
  bigint, bigint, bigint, jsonb, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_intra_site_transfer(
  bigint, bigint, bigint, jsonb, text, uuid
) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reverse_intra_site_transfer(
  bigint, jsonb, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_intra_site_transfer(
  bigint, jsonb, text, uuid
) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_intra_site_transfer_remaining(bigint)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_intra_site_transfer_remaining(bigint)
TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_inventory_document_correction_legacy(
  text, bigint, bigint, bigint, numeric, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_inventory_document_correction_legacy(
  text, bigint, bigint, bigint, numeric, text, uuid
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_inventory_document_correction(
  text, bigint, bigint, bigint, numeric, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_inventory_document_correction(
  text, bigint, bigint, bigint, numeric, text, uuid
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Owner-gated branch preparation and activation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prepare_branch_kitchen_split(
  p_branch_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_warehouse_id bigint;
  v_kitchen_id bigint;
  v_enabled boolean := false;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL OR NOT public.auth_is_owner(v_actor) THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  PERFORM branch.id
  FROM public.branches AS branch
  WHERE branch.id = p_branch_id
    AND branch.tenant_id = v_tenant
    AND branch.branch_kind = 'branch'
    AND branch.is_active
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_kitchen_split_branch_invalid' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.ensure_branch_inventory_location_defaults(v_tenant, p_branch_id);

  SELECT coalesce(flag.enabled, false)
  INTO v_enabled
  FROM public.branch_feature_flags AS flag
  WHERE flag.branch_id = p_branch_id
    AND flag.flag_key = 'branch_kitchen_inventory_split';
  v_enabled := coalesce(v_enabled, false);

  SELECT location.id
  INTO v_warehouse_id
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = p_branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active
  ORDER BY location.id
  LIMIT 1;

  SELECT location.id
  INTO v_kitchen_id
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = p_branch_id
    AND location.location_kind = 'kitchen'
  ORDER BY location.is_active DESC, location.id
  LIMIT 1
  FOR UPDATE;

  IF v_kitchen_id IS NULL THEN
    INSERT INTO public.inventory_locations (
      tenant_id, branch_id, code, name, location_kind, is_active,
      is_default_receive, is_default_issue, is_default_consumption, sort_order
    ) VALUES (
      v_tenant, p_branch_id, 'kitchen', 'Bếp', 'kitchen', TRUE,
      FALSE, FALSE, v_enabled, 10
    ) RETURNING id INTO v_kitchen_id;
  ELSE
    UPDATE public.inventory_locations
    SET name = 'Bếp',
        location_kind = 'kitchen',
        is_active = TRUE,
        is_default_receive = FALSE,
        is_default_issue = FALSE,
        is_default_consumption = v_enabled,
        sort_order = 10,
        updated_at = now()
    WHERE id = v_kitchen_id;
  END IF;

  INSERT INTO public.branch_feature_flags (
    branch_id, flag_key, enabled, enabled_by, disabled_at, notes, updated_at
  ) VALUES (
    p_branch_id, 'branch_kitchen_inventory_split', FALSE, v_actor, now(),
    'Prepared; routing remains on warehouse until activation.', now()
  ) ON CONFLICT (branch_id, flag_key) DO NOTHING;

  PERFORM public.log_audit(
    'inventory.branch_kitchen_split.prepared',
    'branch',
    p_branch_id,
    NULL,
    jsonb_build_object(
      'warehouse_location_id', v_warehouse_id,
      'kitchen_location_id', v_kitchen_id
    )
  );

  RETURN jsonb_build_object(
    'branch_id', p_branch_id,
    'warehouse_location_id', v_warehouse_id,
    'kitchen_location_id', v_kitchen_id,
    'enabled', v_enabled
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_branch_kitchen_split(
  p_branch_id bigint,
  p_enabled boolean,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_warehouse_id bigint;
  v_kitchen_id bigint;
  v_current boolean;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL OR NOT public.auth_is_owner(v_actor) THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;
  IF p_enabled IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'branch_kitchen_split_activation_invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM branch.id
  FROM public.branches AS branch
  WHERE branch.id = p_branch_id
    AND branch.tenant_id = v_tenant
    AND branch.branch_kind = 'branch'
    AND branch.is_active
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_kitchen_split_branch_invalid' USING ERRCODE = 'P0002';
  END IF;

  SELECT location.id
  INTO v_warehouse_id
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = p_branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active
  ORDER BY location.id
  LIMIT 1
  FOR UPDATE;

  SELECT location.id
  INTO v_kitchen_id
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = p_branch_id
    AND location.location_kind = 'kitchen'
    AND location.is_active
  ORDER BY location.id
  LIMIT 1
  FOR UPDATE;

  IF v_warehouse_id IS NULL OR v_kitchen_id IS NULL THEN
    RAISE EXCEPTION 'branch_kitchen_split_not_prepared' USING ERRCODE = '23514';
  END IF;

  SELECT flag.enabled
  INTO v_current
  FROM public.branch_feature_flags AS flag
  WHERE flag.branch_id = p_branch_id
    AND flag.flag_key = 'branch_kitchen_inventory_split'
  FOR UPDATE;

  IF coalesce(v_current, false) = p_enabled THEN
    RETURN jsonb_build_object(
      'branch_id', p_branch_id,
      'warehouse_location_id', v_warehouse_id,
      'kitchen_location_id', v_kitchen_id,
      'enabled', p_enabled,
      'idempotent', TRUE
    );
  END IF;

  IF p_enabled THEN
    IF EXISTS (
      SELECT 1
      FROM public.orders AS order_row
      WHERE order_row.tenant_id = v_tenant
        AND order_row.branch_id = p_branch_id
        AND order_row.status NOT IN ('completed', 'cancelled')
    ) OR EXISTS (
      SELECT 1
      FROM public.branch_menu_item_daily_holds AS hold
      WHERE hold.tenant_id = v_tenant
        AND hold.branch_id = p_branch_id
        AND hold.committed_at IS NULL
        AND hold.released_at IS NULL
        AND hold.expires_at > now()
    ) OR EXISTS (
      SELECT 1
      FROM public.kds_tickets AS ticket
      WHERE ticket.tenant_id = v_tenant
        AND ticket.branch_id = p_branch_id
        AND ticket.status IN ('pending', 'preparing', 'ready')
    ) THEN
      RAISE EXCEPTION 'branch_kitchen_split_open_pos_work'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.stock_transfers AS transfer
      WHERE transfer.tenant_id = v_tenant
        AND transfer.transfer_scope = 'inter_site'
        AND p_branch_id IN (transfer.from_branch_id, transfer.to_branch_id)
        AND transfer.status NOT IN ('received', 'cancelled')
    ) THEN
      RAISE EXCEPTION 'branch_kitchen_split_open_inter_site_transfer'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.stocktake_sessions AS session
      WHERE session.tenant_id = v_tenant
        AND session.branch_id = p_branch_id
        AND session.status = 'in_progress'
    ) OR EXISTS (
      SELECT 1
      FROM public.inventory_count_slips AS slip
      WHERE slip.tenant_id = v_tenant
        AND slip.branch_id = p_branch_id
        AND slip.status IN ('submitted', 'needs_changes')
    ) THEN
      RAISE EXCEPTION 'branch_kitchen_split_open_count'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.stock_levels AS stock
      WHERE stock.tenant_id = v_tenant
        AND stock.branch_id = p_branch_id
        AND stock.location_id = v_warehouse_id
        AND stock.current_quantity <> 0
    ) THEN
      RAISE EXCEPTION 'branch_kitchen_split_warehouse_not_empty'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  INSERT INTO public.branch_feature_flags (
    branch_id, flag_key, enabled, enabled_by, enabled_at, disabled_at,
    notes, updated_at
  ) VALUES (
    p_branch_id, 'branch_kitchen_inventory_split', p_enabled, v_actor,
    CASE WHEN p_enabled THEN now() ELSE NULL END,
    CASE WHEN p_enabled THEN NULL ELSE now() END,
    'ADR 0048 owner activation ' || p_idempotency_key::text,
    now()
  ) ON CONFLICT (branch_id, flag_key) DO UPDATE SET
    enabled = excluded.enabled,
    enabled_by = excluded.enabled_by,
    enabled_at = excluded.enabled_at,
    disabled_at = excluded.disabled_at,
    notes = excluded.notes,
    updated_at = excluded.updated_at;

  UPDATE public.inventory_locations
  SET is_default_receive = id = v_warehouse_id,
      is_default_issue = id = v_warehouse_id,
      is_default_consumption = CASE
        WHEN p_enabled THEN id = v_kitchen_id
        ELSE id = v_warehouse_id
      END,
      updated_at = now()
  WHERE tenant_id = v_tenant
    AND branch_id = p_branch_id
    AND id IN (v_warehouse_id, v_kitchen_id);

  IF p_enabled THEN
    UPDATE public.inventory_count_assignments
    SET location_id = v_kitchen_id,
        updated_at = now()
    WHERE tenant_id = v_tenant
      AND branch_id = p_branch_id
      AND is_active
      AND location_id IS DISTINCT FROM v_kitchen_id;
  END IF;

  PERFORM public.log_audit(
    CASE WHEN p_enabled
      THEN 'inventory.branch_kitchen_split.activated'
      ELSE 'inventory.branch_kitchen_split.deactivated'
    END,
    'branch',
    p_branch_id,
    jsonb_build_object('enabled', coalesce(v_current, false)),
    jsonb_build_object(
      'enabled', p_enabled,
      'warehouse_location_id', v_warehouse_id,
      'kitchen_location_id', v_kitchen_id,
      'idempotency_key', p_idempotency_key
    )
  );

  RETURN jsonb_build_object(
    'branch_id', p_branch_id,
    'warehouse_location_id', v_warehouse_id,
    'kitchen_location_id', v_kitchen_id,
    'enabled', p_enabled,
    'idempotent', FALSE
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prepare_branch_kitchen_split(bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_branch_kitchen_split(bigint)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_branch_kitchen_split(bigint, boolean, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_branch_kitchen_split(bigint, boolean, uuid)
  TO authenticated, service_role;

DROP POLICY IF EXISTS feature_flags_write_settings ON public.branch_feature_flags;
CREATE POLICY feature_flags_write_settings
  ON public.branch_feature_flags
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.branches AS branch
      WHERE branch.id = branch_feature_flags.branch_id
        AND branch.tenant_id = public.auth_tenant_id()
    )
    AND (
      public.has_permission(branch_id, 'settings:branch')
      OR public.has_permission(NULL, 'settings:tenant')
    )
    AND (
      flag_key NOT IN ('pos_stock_outcome_posting', 'branch_kitchen_inventory_split')
      OR public.auth_role() = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.branches AS branch
      WHERE branch.id = branch_feature_flags.branch_id
        AND branch.tenant_id = public.auth_tenant_id()
    )
    AND (
      public.has_permission(branch_id, 'settings:branch')
      OR public.has_permission(NULL, 'settings:tenant')
    )
    AND (
      flag_key NOT IN ('pos_stock_outcome_posting', 'branch_kitchen_inventory_split')
      OR public.auth_role() = 'owner'
    )
  );

CREATE OR REPLACE FUNCTION private.enforce_branch_kitchen_split_flag_topology()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_branch_id bigint;
  v_flag_key text;
  v_tenant_id bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_branch_id := OLD.branch_id;
    v_flag_key := OLD.flag_key;
  ELSE
    v_branch_id := NEW.branch_id;
    v_flag_key := NEW.flag_key;
  END IF;
  IF v_flag_key <> 'branch_kitchen_inventory_split' THEN
    RETURN NULL;
  END IF;
  SELECT branch.tenant_id
  INTO v_tenant_id
  FROM public.branches AS branch
  WHERE branch.id = v_branch_id;
  IF v_tenant_id IS NOT NULL THEN
    PERFORM private.assert_inventory_site_warehouse(v_tenant_id, v_branch_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER branch_kitchen_split_flag_topology_check
  AFTER INSERT OR UPDATE OR DELETE ON public.branch_feature_flags
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private.enforce_branch_kitchen_split_flag_topology();

REVOKE EXECUTE ON FUNCTION private.enforce_branch_kitchen_split_flag_topology()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_branch_kitchen_split_flag_topology()
  TO service_role;

-- Active employee assignments always follow the split branch kitchen. Existing
-- completed slips retain their immutable historical location.
CREATE OR REPLACE FUNCTION private.route_employee_count_assignment_location() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_kitchen_id bigint;
BEGIN
  IF NEW.is_active AND coalesce((
    SELECT flag.enabled
    FROM public.branch_feature_flags AS flag
    WHERE flag.branch_id = NEW.branch_id
      AND flag.flag_key = 'branch_kitchen_inventory_split'
  ), false) THEN
    SELECT location.id
    INTO v_kitchen_id
    FROM public.inventory_locations AS location
    WHERE location.tenant_id = NEW.tenant_id
      AND location.branch_id = NEW.branch_id
      AND location.location_kind = 'kitchen'
      AND location.is_active
      AND location.is_default_consumption
    ORDER BY location.id
    LIMIT 1;
    IF v_kitchen_id IS NULL THEN
      RAISE EXCEPTION 'employee_count_kitchen_location_missing'
        USING ERRCODE = '23514';
    END IF;
    NEW.location_id := v_kitchen_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_count_assignments_route_kitchen
  BEFORE INSERT OR UPDATE OF branch_id, location_id, is_active
  ON public.inventory_count_assignments
  FOR EACH ROW EXECUTE FUNCTION private.route_employee_count_assignment_location();

-- ---------------------------------------------------------------------------
-- Location-specific thresholds and replenishment
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS branch_ingredient_thresholds_tenant_isolation
  ON public.branch_ingredient_thresholds;

CREATE POLICY branch_ingredient_thresholds_select
  ON public.branch_ingredient_thresholds
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'inventory:read')
  );

REVOKE INSERT, UPDATE, DELETE ON TABLE public.branch_ingredient_thresholds
  FROM authenticated;
GRANT SELECT ON TABLE public.branch_ingredient_thresholds
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_branch_stock_thresholds(
  p_branch_id bigint,
  p_location_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    WHERE location.id = p_location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = p_branch_id
      AND location.is_active
      AND location.location_kind IN ('warehouse', 'kitchen')
  ) THEN
    RAISE EXCEPTION 'threshold_location_invalid' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'ingredient_id', ingredient.id,
    'ingredient_name', ingredient.name,
    'sku', ingredient.sku,
    'category_name', category.name,
    'base_unit_id', base_unit.unit_id,
    'base_unit_code', unit.code,
    'base_unit_name', unit.name,
    'global_min_stock', ingredient.min_stock_level,
    'branch_min_stock', threshold.min_stock_level,
    'effective_min_stock', coalesce(threshold.min_stock_level, ingredient.min_stock_level, 0),
    'target_stock_level', coalesce(
      threshold.target_stock_level,
      greatest(
        coalesce(ingredient.min_stock_level, 0),
        coalesce(ingredient.min_stock_level, 0) * 2
      )
    ),
    'reorder_quantity', threshold.reorder_quantity,
    'is_customized', threshold.id IS NOT NULL,
    'location_id', p_location_id,
    'fulfill_from_central_kitchen', ingredient.fulfill_from_central_kitchen,
    'fulfill_from_central_supply', ingredient.fulfill_from_central_supply,
    'default_fulfill_site_kind', ingredient.default_fulfill_site_kind
  ) ORDER BY category.name NULLS LAST, ingredient.name), '[]'::jsonb)
  INTO v_result
  FROM public.ingredients AS ingredient
  LEFT JOIN public.ingredient_categories AS category
    ON category.id = ingredient.category_id
   AND category.tenant_id = v_tenant
  LEFT JOIN LATERAL (
    SELECT ingredient_unit.unit_id
    FROM public.ingredient_units AS ingredient_unit
    WHERE ingredient_unit.tenant_id = v_tenant
      AND ingredient_unit.ingredient_id = ingredient.id
      AND ingredient_unit.is_base
      AND ingredient_unit.is_active
    ORDER BY ingredient_unit.sort_order, ingredient_unit.id
    LIMIT 1
  ) AS base_unit ON TRUE
  LEFT JOIN public.units AS unit
    ON unit.id = base_unit.unit_id
   AND unit.tenant_id = v_tenant
  LEFT JOIN public.branch_ingredient_thresholds AS threshold
    ON threshold.tenant_id = v_tenant
   AND threshold.branch_id = p_branch_id
   AND threshold.location_id = p_location_id
   AND threshold.ingredient_id = ingredient.id
   AND threshold.is_active
  WHERE ingredient.tenant_id = v_tenant
    AND ingredient.is_active;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_branch_stock_thresholds(
  p_branch_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_location_id bigint;
BEGIN
  SELECT location.id
  INTO v_location_id
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = p_branch_id
    AND location.is_active
    AND location.is_default_consumption
  ORDER BY location.id
  LIMIT 1;
  RETURN public.get_branch_stock_thresholds(p_branch_id, v_location_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_branch_stock_thresholds(
  p_branch_id bigint,
  p_location_id bigint,
  p_thresholds jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_item jsonb;
  v_ingredient_id bigint;
  v_min_stock numeric;
  v_target_stock numeric;
  v_reorder_quantity numeric;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF public.auth_role() NOT IN ('owner', 'branch_manager')
     OR (
       public.auth_role() = 'branch_manager'
       AND public.auth_branch_id() IS DISTINCT FROM p_branch_id
     ) THEN
    RAISE EXCEPTION 'forbidden_threshold_write' USING ERRCODE = '42501';
  END IF;
  IF p_thresholds IS NULL OR jsonb_typeof(p_thresholds) <> 'array' THEN
    RAISE EXCEPTION 'threshold_payload_invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    WHERE location.id = p_location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = p_branch_id
      AND location.is_active
      AND location.location_kind IN ('warehouse', 'kitchen')
  ) THEN
    RAISE EXCEPTION 'threshold_location_invalid' USING ERRCODE = '23514';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_thresholds)
  LOOP
    v_ingredient_id := nullif(v_item ->> 'ingredient_id', '')::bigint;
    v_min_stock := coalesce(nullif(v_item ->> 'min_stock_level', '')::numeric, 0);
    v_target_stock := coalesce(
      nullif(v_item ->> 'target_stock_level', '')::numeric,
      v_min_stock * 2
    );
    v_reorder_quantity := nullif(v_item ->> 'reorder_quantity', '')::numeric;

    IF v_ingredient_id IS NULL
       OR v_min_stock < 0
       OR v_target_stock < v_min_stock
       OR v_min_stock IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
       OR v_target_stock IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
       OR NOT EXISTS (
         SELECT 1 FROM public.ingredients AS ingredient
         WHERE ingredient.id = v_ingredient_id
           AND ingredient.tenant_id = v_tenant
           AND ingredient.is_active
       ) THEN
      RAISE EXCEPTION 'threshold_item_invalid' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.branch_ingredient_thresholds (
      tenant_id, branch_id, location_id, ingredient_id, min_stock_level,
      target_stock_level, reorder_quantity, is_active, updated_at
    ) VALUES (
      v_tenant, p_branch_id, p_location_id, v_ingredient_id, v_min_stock,
      v_target_stock,
      CASE WHEN v_reorder_quantity > 0 THEN v_reorder_quantity ELSE NULL END,
      TRUE, now()
    ) ON CONFLICT (
      tenant_id, branch_id, location_id, ingredient_id
    ) DO UPDATE SET
      min_stock_level = excluded.min_stock_level,
      target_stock_level = excluded.target_stock_level,
      reorder_quantity = excluded.reorder_quantity,
      is_active = TRUE,
      updated_at = now();
    v_count := v_count + 1;
  END LOOP;

  PERFORM public.log_audit(
    'inventory.thresholds.location_updated',
    'inventory_location',
    p_location_id,
    NULL,
    jsonb_build_object('branch_id', p_branch_id, 'updated_count', v_count)
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'branch_id', p_branch_id,
    'location_id', p_location_id,
    'updated_count', v_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_branch_stock_thresholds(
  p_branch_id bigint,
  p_thresholds jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_location_id bigint;
BEGIN
  SELECT location.id
  INTO v_location_id
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = p_branch_id
    AND location.is_active
    AND location.is_default_consumption
  ORDER BY location.id
  LIMIT 1;
  RETURN public.upsert_branch_stock_thresholds(
    p_branch_id, v_location_id, p_thresholds
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_branch_smart_reorder_suggestions(
  p_branch_id bigint,
  p_location_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_location_kind text;
  v_warehouse_id bigint;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT location.location_kind
  INTO v_location_kind
  FROM public.inventory_locations AS location
  WHERE location.id = p_location_id
    AND location.tenant_id = v_tenant
    AND location.branch_id = p_branch_id
    AND location.is_active
    AND location.location_kind IN ('warehouse', 'kitchen');
  IF v_location_kind IS NULL THEN
    RAISE EXCEPTION 'threshold_location_invalid' USING ERRCODE = '23514';
  END IF;

  SELECT location.id
  INTO v_warehouse_id
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = p_branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active
  ORDER BY location.id
  LIMIT 1;

  WITH current_stock AS (
    SELECT stock.ingredient_id, sum(stock.current_quantity) AS current_quantity
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND (p_branch_id IS NULL OR stock.branch_id = p_branch_id)
      AND (p_location_id IS NULL OR stock.location_id = p_location_id)
    GROUP BY stock.ingredient_id
  ),
  warehouse_stock AS (
    SELECT stock.ingredient_id, stock.current_quantity
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = p_branch_id
      AND stock.location_id = v_warehouse_id
  ),
  rows AS (
    SELECT
      ingredient.id AS ingredient_id,
      ingredient.name AS ingredient_name,
      ingredient.sku,
      category.name AS category_name,
      coalesce(current_stock.current_quantity, 0) AS current_on_hand,
      coalesce(threshold.min_stock_level, ingredient.min_stock_level, 0) AS min_stock_level,
      coalesce(
        threshold.target_stock_level,
        greatest(
          coalesce(threshold.min_stock_level, ingredient.min_stock_level, 0),
          coalesce(threshold.min_stock_level, ingredient.min_stock_level, 0) * 2
        )
      ) AS target_stock_level,
      coalesce(warehouse_stock.current_quantity, 0) AS warehouse_available,
      CASE
        WHEN v_location_kind = 'kitchen' THEN 'intra_site_transfer'
        WHEN ingredient.fulfill_from_central_kitchen THEN 'internal_transfer_kitchen'
        WHEN ingredient.fulfill_from_central_supply THEN 'internal_transfer_supply'
        ELSE 'supplier_po'
      END AS supply_channel
    FROM public.ingredients AS ingredient
    LEFT JOIN public.ingredient_categories AS category
      ON category.id = ingredient.category_id
     AND category.tenant_id = v_tenant
    LEFT JOIN public.branch_ingredient_thresholds AS threshold
      ON threshold.tenant_id = v_tenant
     AND threshold.branch_id = p_branch_id
     AND threshold.location_id = p_location_id
     AND threshold.ingredient_id = ingredient.id
     AND threshold.is_active
    LEFT JOIN current_stock ON current_stock.ingredient_id = ingredient.id
    LEFT JOIN warehouse_stock ON warehouse_stock.ingredient_id = ingredient.id
    WHERE ingredient.tenant_id = v_tenant
      AND ingredient.is_active
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'ingredient_id', rows.ingredient_id,
    'ingredient_name', rows.ingredient_name,
    'sku', rows.sku,
    'category_name', rows.category_name,
    'location_id', p_location_id,
    'current_on_hand', rows.current_on_hand,
    'min_stock_level', rows.min_stock_level,
    'target_stock_level', rows.target_stock_level,
    'warehouse_available', rows.warehouse_available,
    'suggested_reorder_qty', CASE
      WHEN rows.current_on_hand > rows.min_stock_level THEN 0
      WHEN v_location_kind = 'kitchen' THEN least(
        greatest(rows.target_stock_level - rows.current_on_hand, 0),
        rows.warehouse_available
      )
      ELSE greatest(rows.target_stock_level - rows.current_on_hand, 0)
    END,
    'supply_channel', rows.supply_channel,
    'is_below_min', rows.min_stock_level > 0
      AND rows.current_on_hand <= rows.min_stock_level
  ) ORDER BY (
    rows.min_stock_level > 0 AND rows.current_on_hand <= rows.min_stock_level
  ) DESC, rows.ingredient_name), '[]'::jsonb)
  INTO v_result
  FROM rows;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_branch_smart_reorder_suggestions(
  p_branch_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_location_id bigint;
BEGIN
  SELECT location.id
  INTO v_location_id
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = p_branch_id
    AND location.is_active
    AND location.is_default_consumption
  ORDER BY location.id
  LIMIT 1;
  RETURN public.get_branch_smart_reorder_suggestions(p_branch_id, v_location_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_branch_stock_thresholds(bigint, bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_branch_stock_thresholds(bigint, bigint)
  TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.upsert_branch_stock_thresholds(bigint, bigint, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_branch_stock_thresholds(bigint, bigint, jsonb)
  TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_branch_smart_reorder_suggestions(bigint, bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_branch_smart_reorder_suggestions(bigint, bigint)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.scan_inventory_alerts() RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_low bigint := 0;
BEGIN
  WITH stock_by_location AS (
    SELECT
      stock.tenant_id,
      stock.branch_id,
      stock.location_id,
      stock.ingredient_id,
      stock.current_quantity,
      location.name AS location_name,
      location.location_kind,
      branch.branch_kind
    FROM public.stock_levels AS stock
    JOIN public.inventory_locations AS location
      ON location.id = stock.location_id
     AND location.tenant_id = stock.tenant_id
     AND location.branch_id = stock.branch_id
     AND location.is_active
    JOIN public.branches AS branch
      ON branch.id = stock.branch_id
     AND branch.tenant_id = stock.tenant_id
     AND branch.is_active
    WHERE location.location_kind IN ('warehouse', 'kitchen')
       OR (
         branch.branch_kind = 'central_kitchen'
         AND location.location_kind = 'production_storage'
       )
  ),
  low_stock AS (
    SELECT
      stock.*,
      ingredient.name AS ingredient_name,
      coalesce(threshold.min_stock_level, ingredient.min_stock_level, 0)
        AS min_stock_level,
      unit_row.code AS display_unit_code,
      stock.current_quantity / coalesce(nullif(issue_unit.to_base_factor, 0), 1)
        AS display_quantity,
      coalesce(threshold.min_stock_level, ingredient.min_stock_level, 0)
        / coalesce(nullif(issue_unit.to_base_factor, 0), 1)
        AS display_min_stock_level
    FROM stock_by_location AS stock
    JOIN public.ingredients AS ingredient
      ON ingredient.id = stock.ingredient_id
     AND ingredient.tenant_id = stock.tenant_id
     AND ingredient.is_active
    LEFT JOIN public.branch_ingredient_thresholds AS threshold
      ON threshold.tenant_id = stock.tenant_id
     AND threshold.branch_id = stock.branch_id
     AND threshold.location_id = stock.location_id
     AND threshold.ingredient_id = stock.ingredient_id
     AND threshold.is_active
    LEFT JOIN public.ingredient_units AS issue_unit
      ON issue_unit.tenant_id = ingredient.tenant_id
     AND issue_unit.ingredient_id = ingredient.id
     AND issue_unit.unit_id = ingredient.issue_unit_id
     AND issue_unit.is_active
    LEFT JOIN public.units AS unit_row
      ON unit_row.id = issue_unit.unit_id
     AND unit_row.tenant_id = ingredient.tenant_id
    WHERE coalesce(threshold.min_stock_level, ingredient.min_stock_level, 0) > 0
      AND stock.current_quantity
        <= coalesce(threshold.min_stock_level, ingredient.min_stock_level, 0)
  ),
  reactivated AS (
    UPDATE public.notifications AS notification
    SET expires_at = NULL,
        created_at = now()
    FROM low_stock
    WHERE notification.tenant_id = low_stock.tenant_id
      AND notification.dedup_key = format(
        'inventory.stock_low:%s:%s:%s',
        low_stock.branch_id,
        low_stock.location_id,
        low_stock.ingredient_id
      )
      AND notification.expires_at IS NOT NULL
    RETURNING notification.id
  ),
  cleared_reads AS (
    DELETE FROM public.notification_reads AS read_state
    USING reactivated
    WHERE read_state.notification_id = reactivated.id
    RETURNING 1
  ),
  upserted AS (
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles, kind, severity, title, body,
      entity_type, entity_id, action_url, dedup_key, meta, expires_at
    )
    SELECT
      low_stock.tenant_id,
      low_stock.branch_id,
      CASE low_stock.branch_kind
        WHEN 'central_supply'
          THEN ARRAY['owner', 'central_supply_ops']::text[]
        WHEN 'central_kitchen'
          THEN ARRAY['owner', 'central_kitchen_lead']::text[]
        ELSE ARRAY['owner', 'branch_manager']::text[]
      END,
      'inventory.stock_low',
      'warning',
      format(
        'Tồn kho thấp: %s · %s',
        low_stock.ingredient_name,
        low_stock.location_name
      ),
      format(
        'Còn %s%s (mức tối thiểu %s%s)',
        trim(trailing '.' from trim(trailing '0' from to_char(
          low_stock.display_quantity,
          'FM999999999999999990.999999999999'
        ))),
        CASE WHEN low_stock.display_unit_code IS NULL THEN ''
          ELSE format(' %s', low_stock.display_unit_code) END,
        trim(trailing '.' from trim(trailing '0' from to_char(
          low_stock.display_min_stock_level,
          'FM999999999999999990.999999999999'
        ))),
        CASE WHEN low_stock.display_unit_code IS NULL THEN ''
          ELSE format(' %s', low_stock.display_unit_code) END
      ),
      'ingredient',
      low_stock.ingredient_id,
      CASE
        WHEN low_stock.branch_kind = 'branch' THEN format(
          '/br/%s/stock/on-hand?location=%s',
          low_stock.branch_id,
          low_stock.location_id
        )
        ELSE format(
          '/inventory/stock?branch=%s&location=%s&ingredientId=%s',
          low_stock.branch_id,
          low_stock.location_id,
          low_stock.ingredient_id
        )
      END,
      format(
        'inventory.stock_low:%s:%s:%s',
        low_stock.branch_id,
        low_stock.location_id,
        low_stock.ingredient_id
      ),
      jsonb_build_object(
        'branch_id', low_stock.branch_id,
        'location_id', low_stock.location_id,
        'location_kind', low_stock.location_kind,
        'current_quantity_base', low_stock.current_quantity,
        'min_stock_level_base', low_stock.min_stock_level,
        'display_quantity', low_stock.display_quantity,
        'display_min_stock_level', low_stock.display_min_stock_level,
        'display_unit_code', low_stock.display_unit_code
      ),
      NULL
    FROM low_stock
    ON CONFLICT (tenant_id, dedup_key)
      WHERE dedup_key IS NOT NULL
    DO UPDATE SET
      target_branch_id = excluded.target_branch_id,
      target_roles = excluded.target_roles,
      severity = excluded.severity,
      title = excluded.title,
      body = excluded.body,
      entity_type = excluded.entity_type,
      entity_id = excluded.entity_id,
      action_url = excluded.action_url,
      meta = excluded.meta,
      expires_at = NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_low FROM low_stock;

  WITH current_low AS (
    SELECT
      stock.tenant_id,
      stock.branch_id,
      stock.location_id,
      stock.ingredient_id
    FROM public.stock_levels AS stock
    JOIN public.inventory_locations AS location
      ON location.id = stock.location_id
     AND location.tenant_id = stock.tenant_id
     AND location.branch_id = stock.branch_id
     AND location.is_active
    JOIN public.branches AS branch
      ON branch.id = stock.branch_id
     AND branch.tenant_id = stock.tenant_id
     AND branch.is_active
    JOIN public.ingredients AS ingredient
      ON ingredient.id = stock.ingredient_id
     AND ingredient.tenant_id = stock.tenant_id
     AND ingredient.is_active
    LEFT JOIN public.branch_ingredient_thresholds AS threshold
      ON threshold.tenant_id = stock.tenant_id
     AND threshold.branch_id = stock.branch_id
     AND threshold.location_id = stock.location_id
     AND threshold.ingredient_id = stock.ingredient_id
     AND threshold.is_active
    WHERE (
      location.location_kind IN ('warehouse', 'kitchen')
      OR (
        branch.branch_kind = 'central_kitchen'
        AND location.location_kind = 'production_storage'
      )
    )
      AND coalesce(threshold.min_stock_level, ingredient.min_stock_level, 0) > 0
      AND stock.current_quantity
        <= coalesce(threshold.min_stock_level, ingredient.min_stock_level, 0)
  )
  UPDATE public.notifications AS notification
  SET expires_at = now()
  WHERE notification.kind = 'inventory.stock_low'
    AND notification.expires_at IS NULL
    AND notification.meta ? 'location_id'
    AND NOT EXISTS (
      SELECT 1
      FROM current_low
      WHERE current_low.tenant_id = notification.tenant_id
        AND current_low.branch_id = notification.target_branch_id
        AND current_low.location_id = (notification.meta ->> 'location_id')::bigint
        AND current_low.ingredient_id = notification.entity_id
    );

  UPDATE public.notifications
  SET expires_at = coalesce(expires_at, now())
  WHERE kind = 'inventory.stock_low'
    AND NOT coalesce(meta ? 'location_id', false);

  RETURN v_low;
END;
$$;

COMMENT ON FUNCTION public.scan_inventory_alerts() IS
  'Creates location-specific low-stock notifications and routes branch alerts to the matching warehouse or kitchen tab.';

REVOKE ALL ON FUNCTION public.scan_inventory_alerts()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_inventory_alerts() TO service_role;

-- ---------------------------------------------------------------------------
-- Location-aware stocktake and reports
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_stocktake_session(
  p_branch_id bigint,
  p_location_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_session_id bigint;
  v_location_id bigint;
  v_session_number text;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:stocktake_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT location.id
  INTO v_location_id
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = p_branch_id
    AND location.is_active
    AND location.location_kind IN ('warehouse', 'kitchen')
    AND (p_location_id IS NULL OR location.id = p_location_id)
  ORDER BY
    CASE WHEN p_location_id IS NOT NULL THEN 0 ELSE 1 END,
    location.is_default_consumption DESC,
    location.sort_order,
    location.id
  LIMIT 1;
  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'location_not_found_or_inactive' USING ERRCODE = 'P0002';
  END IF;

  IF public.auth_role() NOT IN ('owner', 'branch_manager') AND EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    WHERE location.id = v_location_id
      AND location.location_kind = 'warehouse'
      AND coalesce((
        SELECT flag.enabled
        FROM public.branch_feature_flags AS flag
        WHERE flag.branch_id = p_branch_id
          AND flag.flag_key = 'branch_kitchen_inventory_split'
      ), false)
  ) THEN
    RAISE EXCEPTION 'warehouse_stocktake_manager_only' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = p_branch_id
      AND stock.location_id = v_location_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.ingredient_units AS ingredient_unit
        JOIN public.units AS unit
          ON unit.id = ingredient_unit.unit_id
         AND unit.tenant_id = ingredient_unit.tenant_id
         AND unit.is_active
        WHERE ingredient_unit.tenant_id = v_tenant
          AND ingredient_unit.ingredient_id = stock.ingredient_id
          AND ingredient_unit.is_base
          AND ingredient_unit.is_active
      )
  ) THEN
    RAISE EXCEPTION 'stocktake_entry_unit_missing' USING ERRCODE = '23503';
  END IF;

  v_session_number := public.next_inventory_doc_number(v_tenant, 'stocktake');
  INSERT INTO public.stocktake_sessions (
    tenant_id, branch_id, location_id, created_by, session_number
  ) VALUES (
    v_tenant, p_branch_id, v_location_id, v_actor, v_session_number
  ) RETURNING id INTO v_session_id;

  INSERT INTO public.stocktake_lines (
    tenant_id, session_id, ingredient_id, system_quantity, entry_unit_id
  )
  SELECT
    v_tenant,
    v_session_id,
    stock.ingredient_id,
    stock.current_quantity,
    base_unit.unit_id
  FROM public.stock_levels AS stock
  JOIN LATERAL (
    SELECT ingredient_unit.unit_id
    FROM public.ingredient_units AS ingredient_unit
    WHERE ingredient_unit.tenant_id = v_tenant
      AND ingredient_unit.ingredient_id = stock.ingredient_id
      AND ingredient_unit.is_base
      AND ingredient_unit.is_active
    ORDER BY ingredient_unit.sort_order, ingredient_unit.id
    LIMIT 1
  ) AS base_unit ON TRUE
  WHERE stock.tenant_id = v_tenant
    AND stock.branch_id = p_branch_id
    AND stock.location_id = v_location_id;

  PERFORM public.log_audit(
    'inventory.stocktake.created',
    'stocktake_session',
    v_session_id,
    NULL,
    jsonb_build_object(
      'status', 'in_progress',
      'session_number', v_session_number,
      'branch_id', p_branch_id,
      'location_id', v_location_id
    )
  );

  RETURN jsonb_build_object(
    'id', v_session_id,
    'session_number', v_session_number,
    'location_id', v_location_id
  );
END;
$$;

DROP POLICY IF EXISTS stocktake_lines_count_update ON public.stocktake_lines;
CREATE POLICY stocktake_lines_count_update
  ON public.stocktake_lines
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND NOT is_final
    AND EXISTS (
      SELECT 1
      FROM public.stocktake_sessions AS session
      JOIN public.inventory_locations AS location
        ON location.id = session.location_id
       AND location.tenant_id = session.tenant_id
       AND location.branch_id = session.branch_id
       AND location.location_kind IN ('warehouse', 'kitchen')
       AND location.is_active
      WHERE session.id = stocktake_lines.session_id
        AND session.tenant_id = stocktake_lines.tenant_id
        AND session.status = 'in_progress'
        AND session.current_round = stocktake_lines.round_no
        AND public.has_permission(session.branch_id, 'inventory:write')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND NOT is_final
    AND EXISTS (
      SELECT 1
      FROM public.stocktake_sessions AS session
      JOIN public.inventory_locations AS location
        ON location.id = session.location_id
       AND location.tenant_id = session.tenant_id
       AND location.branch_id = session.branch_id
       AND location.location_kind IN ('warehouse', 'kitchen')
       AND location.is_active
      WHERE session.id = stocktake_lines.session_id
        AND session.tenant_id = stocktake_lines.tenant_id
        AND session.status = 'in_progress'
        AND session.current_round = stocktake_lines.round_no
        AND public.has_permission(session.branch_id, 'inventory:write')
    )
  );

DROP POLICY IF EXISTS stocktake_sessions_cancel ON public.stocktake_sessions;
CREATE POLICY stocktake_sessions_cancel
  ON public.stocktake_sessions
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND status = 'in_progress'
    AND public.has_permission(branch_id, 'inventory:write')
    AND EXISTS (
      SELECT 1
      FROM public.inventory_locations AS location
      WHERE location.id = stocktake_sessions.location_id
        AND location.tenant_id = stocktake_sessions.tenant_id
        AND location.branch_id = stocktake_sessions.branch_id
        AND location.location_kind IN ('warehouse', 'kitchen')
        AND location.is_active
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND status = 'cancelled'
    AND public.has_permission(branch_id, 'inventory:write')
    AND EXISTS (
      SELECT 1
      FROM public.inventory_locations AS location
      WHERE location.id = stocktake_sessions.location_id
        AND location.tenant_id = stocktake_sessions.tenant_id
        AND location.branch_id = stocktake_sessions.branch_id
        AND location.location_kind IN ('warehouse', 'kitchen')
        AND location.is_active
    )
  );

CREATE OR REPLACE FUNCTION private.enforce_stocktake_location_scope() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_kind text;
  v_split_enabled boolean;
BEGIN
  SELECT location.location_kind
  INTO v_kind
  FROM public.inventory_locations AS location
  WHERE location.id = NEW.location_id
    AND location.tenant_id = NEW.tenant_id
    AND location.branch_id = NEW.branch_id
    AND location.is_active
    AND location.location_kind IN ('warehouse', 'kitchen');
  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'stocktake_location_invalid' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(flag.enabled, false)
  INTO v_split_enabled
  FROM public.branch_feature_flags AS flag
  WHERE flag.branch_id = NEW.branch_id
    AND flag.flag_key = 'branch_kitchen_inventory_split';
  IF v_kind = 'warehouse'
     AND coalesce(v_split_enabled, false)
     AND public.auth_role() NOT IN ('owner', 'branch_manager') THEN
    RAISE EXCEPTION 'warehouse_stocktake_manager_only' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stocktake_sessions_location_scope
  BEFORE INSERT OR UPDATE OF location_id
  ON public.stocktake_sessions
  FOR EACH ROW EXECUTE FUNCTION private.enforce_stocktake_location_scope();

DO $stocktake_kitchen_location_patch$
DECLARE
  v_definition text;
  v_before text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.start_stocktake(bigint,bigint,text,boolean,uuid,numeric,numeric)'::regprocedure
  );
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    'location.location_kind = ''warehouse''',
    'location.location_kind IN (''warehouse'', ''kitchen'')'
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'start_stocktake_location_patch_failed';
  END IF;
  EXECUTE v_definition;

  v_definition := pg_get_functiondef(
    'public.complete_stocktake(bigint)'::regprocedure
  );
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    'location.location_kind = ''warehouse''',
    'location.location_kind IN (''warehouse'', ''kitchen'')'
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'complete_stocktake_location_patch_failed';
  END IF;
  EXECUTE v_definition;
END
$stocktake_kitchen_location_patch$;

CREATE OR REPLACE FUNCTION public.get_stock_movement_report(
  p_start_date date,
  p_end_date date,
  p_branch_id bigint,
  p_location_id bigint
) RETURNS TABLE(
  ingredient_id bigint,
  ingredient_name text,
  unit text,
  opening numeric,
  grn_receipt numeric,
  transfer_in numeric,
  transfer_out numeric,
  intra_transfer_in numeric,
  intra_transfer_out numeric,
  consumption numeric,
  production_consumption numeric,
  production_output numeric,
  adjustment numeric,
  closing numeric
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
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (
    public.has_permission(p_branch_id, 'inventory:read')
    OR public.has_permission(NULL, 'reports:view_branch')
    OR public.has_permission(NULL, 'reports:view_tenant')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    WHERE location.id = p_location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = p_branch_id
      AND location.is_active
      AND location.location_kind IN ('warehouse', 'kitchen', 'production_storage')
  ) THEN
    RAISE EXCEPTION 'report_location_invalid' USING ERRCODE = '23514';
  END IF;

  v_start := p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_end := (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';

  RETURN QUERY
  WITH current_stock AS (
    SELECT stock.ingredient_id, sum(stock.current_quantity) AS current_quantity
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND (p_branch_id IS NULL OR stock.branch_id = p_branch_id)
      AND (p_location_id IS NULL OR stock.location_id = p_location_id)
    GROUP BY stock.ingredient_id
  ),
  after_period AS (
    SELECT movement.ingredient_id, sum(movement.quantity_change) AS quantity
    FROM public.stock_movements AS movement
    WHERE movement.tenant_id = v_tenant
      AND (p_branch_id IS NULL OR movement.branch_id = p_branch_id)
      AND (p_location_id IS NULL OR movement.location_id = p_location_id)
      AND movement.created_at >= v_end
    GROUP BY movement.ingredient_id
  ),
  period AS (
    SELECT
      movement.ingredient_id,
      sum(movement.quantity_change) FILTER (
        WHERE movement.type IN ('grn_receipt', 'grn_amend')
      ) AS grn_receipt,
      sum(movement.quantity_change) FILTER (
        WHERE movement.type = 'transfer_in'
          AND coalesce(transfer.transfer_scope, 'inter_site') = 'inter_site'
      ) AS transfer_in,
      sum(movement.quantity_change) FILTER (
        WHERE movement.type = 'transfer_out'
          AND coalesce(transfer.transfer_scope, 'inter_site') = 'inter_site'
      ) AS transfer_out,
      sum(movement.quantity_change) FILTER (
        WHERE movement.type = 'transfer_in'
          AND transfer.transfer_scope = 'intra_site'
      ) AS intra_transfer_in,
      sum(movement.quantity_change) FILTER (
        WHERE movement.type = 'transfer_out'
          AND transfer.transfer_scope = 'intra_site'
      ) AS intra_transfer_out,
      sum(movement.quantity_change) FILTER (
        WHERE movement.type = 'consumption'
      ) AS consumption,
      sum(movement.quantity_change) FILTER (
        WHERE movement.type = 'production_consumption'
      ) AS production_consumption,
      sum(movement.quantity_change) FILTER (
        WHERE movement.type = 'production_output'
      ) AS production_output,
      sum(movement.quantity_change) FILTER (
        WHERE movement.type IN (
          'adjustment', 'count_adjustment', 'supplier_return', 'refund_restore'
        )
      ) AS adjustment
    FROM public.stock_movements AS movement
    LEFT JOIN public.stock_transfers AS transfer
      ON transfer.id = movement.transfer_id
     AND transfer.tenant_id = movement.tenant_id
    WHERE movement.tenant_id = v_tenant
      AND (p_branch_id IS NULL OR movement.branch_id = p_branch_id)
      AND (p_location_id IS NULL OR movement.location_id = p_location_id)
      AND movement.created_at >= v_start
      AND movement.created_at < v_end
    GROUP BY movement.ingredient_id
  ),
  computed AS (
    SELECT
      ingredient.id AS ingredient_id,
      ingredient.name AS ingredient_name,
      public.inventory_entry_unit_code(v_tenant, ingredient.id, NULL) AS unit,
      coalesce(current_stock.current_quantity, 0)
        - coalesce(after_period.quantity, 0) AS closing,
      coalesce(period.grn_receipt, 0) AS grn_receipt,
      coalesce(period.transfer_in, 0) AS transfer_in,
      coalesce(period.transfer_out, 0) AS transfer_out,
      coalesce(period.intra_transfer_in, 0) AS intra_transfer_in,
      coalesce(period.intra_transfer_out, 0) AS intra_transfer_out,
      coalesce(period.consumption, 0) AS consumption,
      coalesce(period.production_consumption, 0) AS production_consumption,
      coalesce(period.production_output, 0) AS production_output,
      coalesce(period.adjustment, 0) AS adjustment
    FROM public.ingredients AS ingredient
    LEFT JOIN current_stock ON current_stock.ingredient_id = ingredient.id
    LEFT JOIN after_period ON after_period.ingredient_id = ingredient.id
    LEFT JOIN period ON period.ingredient_id = ingredient.id
    WHERE ingredient.tenant_id = v_tenant
      AND ingredient.is_active
  )
  SELECT
    computed.ingredient_id,
    computed.ingredient_name,
    computed.unit,
    computed.closing - (
      computed.grn_receipt + computed.transfer_in + computed.transfer_out
      + computed.intra_transfer_in + computed.intra_transfer_out
      + computed.consumption + computed.production_consumption
      + computed.production_output + computed.adjustment
    ) AS opening,
    computed.grn_receipt,
    computed.transfer_in,
    computed.transfer_out,
    computed.intra_transfer_in,
    computed.intra_transfer_out,
    computed.consumption,
    computed.production_consumption,
    computed.production_output,
    computed.adjustment,
    computed.closing
  FROM computed
  WHERE computed.closing <> 0 OR (
    computed.grn_receipt + computed.transfer_in + computed.transfer_out
    + computed.intra_transfer_in + computed.intra_transfer_out
    + computed.consumption + computed.production_consumption
    + computed.production_output + computed.adjustment
  ) <> 0
  ORDER BY computed.ingredient_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_stock_movement_report(
  date, date, bigint, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stock_movement_report(
  date, date, bigint, bigint
) TO authenticated, service_role;

-- Goods-in is external by definition. Internal transfer-in valuation remains
-- visible in the inventory ledger but is excluded from Finance goods-in.
DO $finance_goods_in_scope$
DECLARE
  v_target regprocedure;
  v_definition text;
  v_before text;
BEGIN
  v_target := to_regprocedure(
    'public.get_finance_operating_cockpit(text,date,date,bigint)'
  );
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'finance_goods_in_scope_patch_failed';
  END IF;
  v_definition := pg_get_functiondef(v_target);

  -- A later Finance migration may already have wrapped the original cockpit
  -- and moved its goods-in query into this private helper.
  IF position('AND event.event_type = ''transfer_in''' IN v_definition) = 0 THEN
    v_target := to_regprocedure(
      'private.get_finance_operating_cockpit_without_inventory_breakdown(text,date,date,bigint)'
    );
    IF v_target IS NULL THEN
      RAISE EXCEPTION 'finance_goods_in_scope_patch_failed';
    END IF;
    v_definition := pg_get_functiondef(v_target);
  END IF;

  v_before := v_definition;
  v_definition := replace(
    v_definition,
    'AND event.event_type = ''transfer_in''',
    'AND event.event_type = ''transfer_in''
      AND EXISTS (
        SELECT 1
        FROM public.stock_transfers AS transfer
        WHERE transfer.id = movement.transfer_id
          AND transfer.tenant_id = movement.tenant_id
          AND transfer.transfer_scope = ''inter_site''
      )'
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'finance_goods_in_scope_patch_failed';
  END IF;
  EXECUTE v_definition;
END
$finance_goods_in_scope$;

-- ---------------------------------------------------------------------------
-- POS/KDS snapshot routing and location-scoped availability
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.compute_menu_item_stock_capacity(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_menu_item_id bigint,
  p_location_id bigint
) RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH item_primary_flags AS (
    SELECT bool_or(recipe.is_primary) AS has_primary
    FROM public.recipes AS recipe
    WHERE recipe.tenant_id = p_tenant_id
      AND recipe.menu_item_id = p_menu_item_id
  ),
  recipe_lines AS (
    SELECT
      recipe.ingredient_id,
      CASE
        WHEN recipe.entry_unit_id IS NULL
          THEN recipe.quantity / recipe.yield_factor
        WHEN ingredient_unit.id IS NULL THEN NULL::numeric
        ELSE (recipe.quantity / recipe.yield_factor)
          * ingredient_unit.to_base_factor
      END AS per_portion_quantity,
      recipe.entry_unit_id IS NOT NULL
        AND ingredient_unit.id IS NULL AS line_missing_config
    FROM public.recipes AS recipe
    CROSS JOIN item_primary_flags
    LEFT JOIN public.ingredient_units AS ingredient_unit
      ON ingredient_unit.tenant_id = p_tenant_id
     AND ingredient_unit.ingredient_id = recipe.ingredient_id
     AND ingredient_unit.unit_id = recipe.entry_unit_id
     AND ingredient_unit.is_active
    WHERE recipe.tenant_id = p_tenant_id
      AND recipe.menu_item_id = p_menu_item_id
      AND (
        recipe.is_primary
        OR NOT coalesce(item_primary_flags.has_primary, false)
      )
  ),
  capacity_lines AS (
    SELECT
      recipe_lines.*,
      coalesce(stock.current_quantity, 0) AS on_hand
    FROM recipe_lines
    LEFT JOIN public.stock_levels AS stock
      ON stock.tenant_id = p_tenant_id
     AND stock.branch_id = p_branch_id
     AND stock.location_id = p_location_id
     AND stock.ingredient_id = recipe_lines.ingredient_id
  )
  SELECT CASE
    WHEN count(*) = 0 THEN NULL::integer
    WHEN bool_or(
      line_missing_config
      OR per_portion_quantity IS NULL
      OR per_portion_quantity <= 0
    ) THEN NULL::integer
    ELSE floor(min(
      on_hand / nullif(per_portion_quantity, 0)
    ) + 0.000001)::integer
  END
  FROM capacity_lines;
$$;

CREATE OR REPLACE FUNCTION public.compute_menu_item_stock_capacity(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_menu_item_id bigint
) RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT public.compute_menu_item_stock_capacity(
    p_tenant_id,
    p_branch_id,
    p_menu_item_id,
    (
      SELECT location.id
      FROM public.inventory_locations AS location
      WHERE location.tenant_id = p_tenant_id
        AND location.branch_id = p_branch_id
        AND location.is_active
        AND location.is_default_consumption
        AND location.location_kind IN ('warehouse', 'kitchen')
      ORDER BY location.id
      LIMIT 1
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.compute_menu_item_stock_capacity(
  bigint, bigint, bigint, bigint
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_menu_item_stock_capacity(
  bigint, bigint, bigint, bigint
) TO service_role;

DO $pos_consumption_location_patch$
DECLARE
  v_definition text;
  v_before text;
  v_location_block text := replace($location_block$
  v_location_id := v_order.stock_consumption_location_id;

  SELECT il.is_default_consumption
  INTO v_location_is_default
  FROM public.inventory_locations il
  WHERE il.id = v_location_id
    AND il.branch_id = v_order.branch_id
    AND il.tenant_id = v_order.tenant_id
    AND il.location_kind IN ('warehouse', 'kitchen')
    AND il.is_active = TRUE;$location_block$, E'\r\n', E'\n');
BEGIN
  v_definition := replace(
    pg_get_functiondef(
      'public.post_pos_sale_consumption_if_ready(bigint,uuid)'::regprocedure
    ),
    E'\r\n',
    E'\n'
  );
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    'SELECT o.id, o.tenant_id, o.branch_id, o.status, o.payment_status, o.created_by',
    'SELECT o.id, o.tenant_id, o.branch_id, o.status, o.payment_status, o.created_by,
         o.stock_consumption_location_id'
  );
  v_definition := replace(
    v_definition,
    replace($old_location$
  SELECT il.id, il.is_default_consumption
  INTO v_location_id, v_location_is_default
  FROM public.inventory_locations il
  WHERE il.branch_id = v_order.branch_id
    AND il.tenant_id = v_order.tenant_id
    AND il.location_kind = 'warehouse'
    AND il.is_active = TRUE
  ORDER BY il.is_default_consumption DESC, il.sort_order NULLS LAST, il.id
  LIMIT 1;$old_location$, E'\r\n', E'\n'),
    v_location_block
  );
  v_definition := replace(
    v_definition,
    E'        AND sm.location_id = v_location_id\n',
    ''
  );
  v_definition := replace(
    v_definition,
    'format(''/br/%s/stock'', v_order.branch_id)',
    'format(''/br/%s/stock/on-hand?location=%s'', v_order.branch_id, v_location_id)'
  );
  v_definition := replace(
    v_definition,
    replace($old_shortfall_meta$
        'order_id', p_order_id,
        'short_ingredient_ids', to_jsonb(v_short),$old_shortfall_meta$, E'\r\n', E'\n'),
    replace($new_shortfall_meta$
        'order_id', p_order_id,
        'location_id', v_location_id,
        'short_ingredient_ids', to_jsonb(v_short),$new_shortfall_meta$, E'\r\n', E'\n')
  );
  IF v_definition = v_before
     OR position('v_order.stock_consumption_location_id' IN v_definition) = 0
     OR position('AND sm.location_id = v_location_id' IN v_definition) > 0
     OR position('/stock/on-hand?location=%s' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'pos_sale_consumption_location_patch_failed';
  END IF;
  EXECUTE v_definition;

  v_definition := replace(
    pg_get_functiondef(
      'public.post_pos_cancelled_ready_waste(bigint,uuid,text)'::regprocedure
    ),
    E'\r\n',
    E'\n'
  );
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    'SELECT o.id, o.tenant_id, o.branch_id, o.status, o.created_by',
    'SELECT o.id, o.tenant_id, o.branch_id, o.status, o.created_by,
         o.stock_consumption_location_id'
  );
  v_definition := replace(
    v_definition,
    replace($old_location$
  SELECT il.id, il.is_default_consumption
  INTO v_location_id, v_location_is_default
  FROM public.inventory_locations il
  WHERE il.branch_id = v_order.branch_id
    AND il.tenant_id = v_order.tenant_id
    AND il.location_kind = 'warehouse'
    AND il.is_active = TRUE
  ORDER BY il.is_default_consumption DESC, il.sort_order NULLS LAST, il.id
  LIMIT 1;$old_location$, E'\r\n', E'\n'),
    v_location_block
  );
  IF v_definition = v_before
     OR position('v_order.stock_consumption_location_id' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'pos_cancelled_waste_location_patch_failed';
  END IF;
  EXECUTE v_definition;
END
$pos_consumption_location_patch$;

DO $pos_preorder_location_patch$
DECLARE
  v_definition text;
  v_before text;
BEGIN
  v_definition := replace(
    pg_get_functiondef(
      'public.enforce_branch_stock_availability()'::regprocedure
    ),
    E'\r\n',
    E'\n'
  );
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    replace($old_order_select$
  SELECT o.tenant_id,
         o.branch_id,
         (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  INTO v_tenant_id, v_branch_id, v_order_date$old_order_select$, E'\r\n', E'\n'),
    replace($new_order_select$
  SELECT o.tenant_id,
         o.branch_id,
         (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
         o.stock_consumption_location_id
  INTO v_tenant_id, v_branch_id, v_order_date, v_location_id$new_order_select$, E'\r\n', E'\n')
  );
  v_definition := replace(
    v_definition,
    replace($old_preorder_location$
  SELECT il.id
  INTO v_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_branch_id
    AND il.tenant_id = v_tenant_id
    AND il.location_kind = 'warehouse'
    AND il.is_active = TRUE
  ORDER BY il.is_default_consumption DESC, il.sort_order NULLS LAST, il.id
  LIMIT 1;$old_preorder_location$, E'\r\n', E'\n'),
    ''
  );
  v_definition := replace(
    v_definition,
    'AND o.branch_id = v_branch_id',
    replace('AND o.branch_id = v_branch_id
        AND o.stock_consumption_location_id = v_location_id', E'\r\n', E'\n')
  );
  IF v_definition = v_before
     OR position('o.stock_consumption_location_id' IN v_definition) = 0
     OR position('il.location_kind = ''warehouse''' IN v_definition) > 0 THEN
    RAISE EXCEPTION 'pos_preorder_location_patch_failed';
  END IF;
  EXECUTE v_definition;
END
$pos_preorder_location_patch$;

DO $menu_availability_location_patch$
DECLARE
  v_definition text;
  v_before text;
BEGIN
  v_definition := replace(
    pg_get_functiondef(
      'public.branch_menu_limit_availability(bigint,bigint,date,boolean,uuid[])'::regprocedure
    ),
    E'\r\n',
    E'\n'
  );
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    'WITH order_line_demand AS (',
    replace('WITH scope_location AS (
    SELECT location.id
    FROM public.inventory_locations AS location
    WHERE location.tenant_id = p_tenant_id
      AND location.branch_id = p_branch_id
      AND location.is_active
      AND location.is_default_consumption
      AND location.location_kind IN (''warehouse'', ''kitchen'')
    ORDER BY location.id
    LIMIT 1
  ),
  order_line_demand AS (', E'\r\n', E'\n')
  );
  v_definition := replace(
    v_definition,
    'AND o.branch_id = p_branch_id',
    replace('AND o.branch_id = p_branch_id
      AND o.stock_consumption_location_id = (SELECT id FROM scope_location)', E'\r\n', E'\n')
  );
  v_definition := replace(
    v_definition,
    'AND h.branch_id = p_branch_id',
    replace('AND h.branch_id = p_branch_id
      AND h.stock_consumption_location_id = (SELECT id FROM scope_location)', E'\r\n', E'\n')
  );
  v_definition := replace(
    v_definition,
    replace($old_branch_stock$
      AND il.location_kind = 'warehouse'
      AND il.is_active = TRUE$old_branch_stock$, E'\r\n', E'\n'),
    replace($new_branch_stock$
      AND sl.location_id = (SELECT id FROM scope_location)
      AND il.is_active = TRUE$new_branch_stock$, E'\r\n', E'\n')
  );
  IF v_definition = v_before
     OR position('stock_consumption_location_id' IN v_definition) = 0
     OR position('il.location_kind = ''warehouse''' IN v_definition) > 0 THEN
    RAISE EXCEPTION 'menu_availability_location_patch_failed';
  END IF;
  EXECUTE v_definition;
END
$menu_availability_location_patch$;

COMMENT ON FUNCTION public.post_pos_sale_consumption_if_ready(bigint, uuid) IS
  'Posts delta consumption at the immutable order stock_consumption_location_id; prior movements across all locations prevent legacy double-posting.';
