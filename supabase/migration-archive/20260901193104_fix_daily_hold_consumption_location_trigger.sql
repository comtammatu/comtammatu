-- Migration: fix_daily_hold_consumption_location_trigger

BEGIN;

-- Separate shared trigger function into dedicated, type-safe functions for
-- public.orders and public.branch_menu_item_daily_holds.
-- When the trigger fired on branch_menu_item_daily_holds, referencing
-- NEW.split_from_order_id in private.route_stock_consumption_location threw
-- error 42703 (record "new" has no field "split_from_order_id").

CREATE OR REPLACE FUNCTION private.route_order_stock_consumption_location() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_location record;
  v_hold_token uuid;
  v_hold_location_count integer;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.stock_consumption_location_id IS DISTINCT FROM OLD.stock_consumption_location_id THEN
    RAISE EXCEPTION 'order_stock_consumption_location_immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.stock_consumption_location_id IS NULL
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
  IF NEW.stock_consumption_location_id IS NULL THEN
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

CREATE OR REPLACE FUNCTION private.route_hold_stock_consumption_location() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_location record;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.stock_consumption_location_id IS DISTINCT FROM OLD.stock_consumption_location_id THEN
    RAISE EXCEPTION 'hold_stock_consumption_location_immutable'
      USING ERRCODE = '23514';
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

DROP TRIGGER IF EXISTS orders_route_stock_consumption_location ON public.orders;
CREATE TRIGGER orders_route_stock_consumption_location
  BEFORE INSERT OR UPDATE OF stock_consumption_location_id
  ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.route_order_stock_consumption_location();

DROP TRIGGER IF EXISTS branch_menu_holds_route_stock_consumption_location ON public.branch_menu_item_daily_holds;
CREATE TRIGGER branch_menu_holds_route_stock_consumption_location
  BEFORE INSERT OR UPDATE OF stock_consumption_location_id
  ON public.branch_menu_item_daily_holds
  FOR EACH ROW EXECUTE FUNCTION private.route_hold_stock_consumption_location();

DROP FUNCTION IF EXISTS private.route_stock_consumption_location();

COMMIT;
