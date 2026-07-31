ALTER TABLE public.ingredients
  ADD COLUMN receipt_unit_id bigint,
  ADD COLUMN issue_unit_id bigint,
  ADD COLUMN production_unit_id bigint;

WITH configured AS (
  SELECT ingredient.id,
    (SELECT unit_id FROM public.ingredient_units
      WHERE tenant_id = ingredient.tenant_id AND ingredient_id = ingredient.id AND is_active
      ORDER BY to_base_factor DESC, sort_order LIMIT 1) AS receipt_unit_id,
    (SELECT unit_id FROM public.ingredient_units
      WHERE tenant_id = ingredient.tenant_id AND ingredient_id = ingredient.id AND is_active AND is_base
      LIMIT 1) AS issue_unit_id
  FROM public.ingredients AS ingredient
)
UPDATE public.ingredients AS ingredient
SET receipt_unit_id = configured.receipt_unit_id,
    issue_unit_id = configured.issue_unit_id
FROM configured
WHERE ingredient.id = configured.id;

ALTER TABLE public.ingredients
  ADD CONSTRAINT ingredients_receipt_unit_required CHECK (receipt_unit_id IS NOT NULL),
  ADD CONSTRAINT ingredients_issue_unit_required CHECK (issue_unit_id IS NOT NULL),
  ADD CONSTRAINT ingredients_receipt_unit_fkey FOREIGN KEY (receipt_unit_id) REFERENCES public.units(id),
  ADD CONSTRAINT ingredients_issue_unit_fkey FOREIGN KEY (issue_unit_id) REFERENCES public.units(id),
  ADD CONSTRAINT ingredients_production_unit_fkey FOREIGN KEY (production_unit_id) REFERENCES public.units(id);
GRANT SELECT (receipt_unit_id, issue_unit_id, production_unit_id) ON public.ingredients TO authenticated;

ALTER TABLE public.stock_movements ADD COLUMN entry_to_base_factor numeric(18,12), ADD COLUMN entry_unit_code text;
ALTER TABLE public.purchase_order_items ADD COLUMN entry_to_base_factor numeric(18,12), ADD COLUMN entry_unit_code text;
ALTER TABLE public.grn_items ADD COLUMN entry_to_base_factor numeric(18,12), ADD COLUMN entry_unit_code text;
ALTER TABLE public.stock_transfer_items ADD COLUMN entry_to_base_factor numeric(18,12), ADD COLUMN entry_unit_code text;
ALTER TABLE public.stock_issue_items ADD COLUMN entry_to_base_factor numeric(18,12), ADD COLUMN entry_unit_code text;
ALTER TABLE public.production_recipes ADD COLUMN entry_to_base_factor numeric(18,12), ADD COLUMN entry_unit_code text;
ALTER TABLE public.production_runs ADD COLUMN entry_to_base_factor numeric(18,12), ADD COLUMN entry_unit_code text;

CREATE OR REPLACE FUNCTION private.enforce_linked_grn_line_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_grn record;
  v_po_item record;
  v_confirming boolean := coalesce(pg_catalog.current_setting('comtammatu.grn_confirm', TRUE), 'false') = 'true';
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'entry_to_base_factor' - 'entry_unit_code') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'entry_to_base_factor' - 'entry_unit_code') THEN
    RETURN NEW;
  END IF;
  SELECT grn.* INTO v_grn FROM public.goods_received_notes AS grn
  WHERE grn.id = coalesce(NEW.grn_id, OLD.grn_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002'; END IF;
  IF TG_OP = 'DELETE' THEN
    IF v_grn.status = 'draft' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'confirmed_grn_lines_immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.grn_id IS DISTINCT FROM OLD.grn_id OR NEW.purchase_order_item_id IS DISTINCT FROM OLD.purchase_order_item_id
    OR NEW.ingredient_id IS DISTINCT FROM OLD.ingredient_id OR NEW.entry_unit_id IS DISTINCT FROM OLD.entry_unit_id
    OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
  ) THEN RAISE EXCEPTION 'grn_line_identity_immutable' USING ERRCODE = '23514'; END IF;
  SELECT po_item.*, purchase_order.supplier_id INTO v_po_item
  FROM public.purchase_order_items AS po_item JOIN public.purchase_orders AS purchase_order
    ON purchase_order.id = po_item.po_id AND purchase_order.tenant_id = po_item.tenant_id
  WHERE po_item.id = NEW.purchase_order_item_id AND po_item.tenant_id = v_grn.tenant_id AND po_item.po_id = v_grn.po_id;
  IF NOT FOUND OR NEW.ingredient_id <> v_po_item.ingredient_id
     OR NEW.entry_unit_id IS DISTINCT FROM v_po_item.entry_unit_id OR NEW.supplier_id <> v_po_item.supplier_id
  THEN RAISE EXCEPTION 'grn_line_po_mismatch' USING ERRCODE = '23514'; END IF;
  IF v_confirming THEN RETURN NEW; END IF;
  IF v_grn.status <> 'draft' THEN RAISE EXCEPTION 'confirmed_grn_lines_immutable' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.unit_cost := OLD.unit_cost;
    NEW.cost_pending := OLD.cost_pending;
    NEW.provisional_cost_source := OLD.provisional_cost_source;
  END IF;
  NEW.total_cost := 0;
  NEW.po_applied_quantity := 0;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.enforce_retrospective_purchase_order_line_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_po_id bigint; v_po_ids bigint[]; v_old_tenant_id bigint; v_new_tenant_id bigint;
  v_po_status text; v_linked boolean := FALSE; v_trusted_rpc boolean;
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'entry_to_base_factor' - 'entry_unit_code') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'entry_to_base_factor' - 'entry_unit_code') THEN
    RETURN NEW;
  END IF;
  SELECT CURRENT_USER = pg_catalog.pg_get_userbyid(relation.relowner) INTO v_trusted_rpc
  FROM pg_catalog.pg_class AS relation WHERE relation.oid = 'public.purchase_order_items'::pg_catalog.regclass;
  IF TG_OP = 'INSERT' THEN
    v_po_ids := ARRAY[NEW.po_id]; v_new_tenant_id := NEW.tenant_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_po_ids := ARRAY[OLD.po_id]; v_old_tenant_id := OLD.tenant_id;
  ELSE
    v_po_ids := ARRAY[OLD.po_id, NEW.po_id]; v_old_tenant_id := OLD.tenant_id; v_new_tenant_id := NEW.tenant_id;
  END IF;
  FOR v_po_id IN SELECT DISTINCT candidate.po_id FROM unnest(v_po_ids) AS candidate(po_id)
    WHERE candidate.po_id IS NOT NULL ORDER BY candidate.po_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('retrospective-po:' || v_po_id::text, 0));
  END LOOP;
  SELECT EXISTS (
    SELECT 1 FROM public.goods_received_notes AS grn
    WHERE grn.po_id = ANY (v_po_ids) AND (grn.tenant_id = v_old_tenant_id OR grn.tenant_id = v_new_tenant_id)
  ) INTO v_linked;
  IF NOT v_linked THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND v_trusted_rpc IS TRUE
     AND NEW.id IS NOT DISTINCT FROM OLD.id AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND NEW.po_id IS NOT DISTINCT FROM OLD.po_id AND NEW.ingredient_id IS NOT DISTINCT FROM OLD.ingredient_id
     AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity AND NEW.entry_unit_id IS NOT DISTINCT FROM OLD.entry_unit_id
  THEN
    SELECT purchase_order.status INTO v_po_status FROM public.purchase_orders AS purchase_order WHERE purchase_order.id = NEW.po_id;
    IF v_po_status = 'draft' THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'linked_grn_purchase_order_lines_immutable' USING ERRCODE = 'check_violation';
END;
$$;

UPDATE public.stock_movements AS row SET entry_to_base_factor = ingredient_unit.to_base_factor, entry_unit_code = unit_row.code
FROM public.ingredient_units AS ingredient_unit JOIN public.units AS unit_row ON unit_row.id = ingredient_unit.unit_id
WHERE ingredient_unit.tenant_id = row.tenant_id AND ingredient_unit.ingredient_id = row.ingredient_id AND ingredient_unit.unit_id = row.entry_unit_id;
UPDATE public.purchase_order_items AS row SET entry_to_base_factor = ingredient_unit.to_base_factor, entry_unit_code = unit_row.code
FROM public.ingredient_units AS ingredient_unit JOIN public.units AS unit_row ON unit_row.id = ingredient_unit.unit_id
WHERE ingredient_unit.tenant_id = row.tenant_id AND ingredient_unit.ingredient_id = row.ingredient_id AND ingredient_unit.unit_id = row.entry_unit_id;
UPDATE public.grn_items AS row SET entry_to_base_factor = ingredient_unit.to_base_factor, entry_unit_code = unit_row.code
FROM public.ingredient_units AS ingredient_unit JOIN public.units AS unit_row ON unit_row.id = ingredient_unit.unit_id
WHERE ingredient_unit.tenant_id = row.tenant_id AND ingredient_unit.ingredient_id = row.ingredient_id AND ingredient_unit.unit_id = row.entry_unit_id;
UPDATE public.stock_transfer_items AS row SET entry_to_base_factor = ingredient_unit.to_base_factor, entry_unit_code = unit_row.code
FROM public.ingredient_units AS ingredient_unit JOIN public.units AS unit_row ON unit_row.id = ingredient_unit.unit_id
WHERE ingredient_unit.tenant_id = row.tenant_id AND ingredient_unit.ingredient_id = row.ingredient_id AND ingredient_unit.unit_id = row.entry_unit_id;
UPDATE public.stock_issue_items AS row SET entry_to_base_factor = ingredient_unit.to_base_factor, entry_unit_code = unit_row.code
FROM public.ingredient_units AS ingredient_unit JOIN public.units AS unit_row ON unit_row.id = ingredient_unit.unit_id
WHERE ingredient_unit.tenant_id = row.tenant_id AND ingredient_unit.ingredient_id = row.ingredient_id AND ingredient_unit.unit_id = row.entry_unit_id;
UPDATE public.production_recipes AS row SET entry_to_base_factor = ingredient_unit.to_base_factor, entry_unit_code = unit_row.code
FROM public.ingredient_units AS ingredient_unit JOIN public.units AS unit_row ON unit_row.id = ingredient_unit.unit_id
WHERE ingredient_unit.tenant_id = row.tenant_id AND ingredient_unit.ingredient_id = row.ingredient_id AND ingredient_unit.unit_id = row.entry_unit_id;
UPDATE public.production_runs AS row SET entry_to_base_factor = ingredient_unit.to_base_factor, entry_unit_code = unit_row.code
FROM public.ingredient_units AS ingredient_unit JOIN public.units AS unit_row ON unit_row.id = ingredient_unit.unit_id
WHERE ingredient_unit.tenant_id = row.tenant_id AND ingredient_unit.ingredient_id = row.finished_good_id AND ingredient_unit.unit_id = row.entry_unit_id;

CREATE OR REPLACE FUNCTION private.snapshot_inventory_entry_unit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE v_factor numeric(18,12); v_code text;
BEGIN
  SELECT ingredient_unit.to_base_factor, unit_row.code INTO v_factor, v_code
  FROM public.ingredient_units AS ingredient_unit
  JOIN public.units AS unit_row ON unit_row.id = ingredient_unit.unit_id AND unit_row.tenant_id = ingredient_unit.tenant_id
  WHERE ingredient_unit.tenant_id = NEW.tenant_id
    AND ingredient_unit.ingredient_id = NEW.ingredient_id
    AND ingredient_unit.unit_id = NEW.entry_unit_id
    AND ingredient_unit.is_active;
  IF v_factor IS NULL THEN RAISE EXCEPTION 'entry_unit_not_configured' USING ERRCODE = '23503'; END IF;
  NEW.entry_to_base_factor := v_factor;
  NEW.entry_unit_code := v_code;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.enforce_inventory_unit_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE v_expected_unit_id bigint;
BEGIN
  SELECT CASE TG_ARGV[0]
    WHEN 'receipt' THEN receipt_unit_id
    WHEN 'issue' THEN issue_unit_id
    WHEN 'production' THEN production_unit_id
  END INTO v_expected_unit_id
  FROM public.ingredients WHERE tenant_id = NEW.tenant_id AND id = NEW.ingredient_id;
  IF v_expected_unit_id IS NULL OR NEW.entry_unit_id IS DISTINCT FROM v_expected_unit_id THEN
    RAISE EXCEPTION 'inventory_unit_role_mismatch:%', TG_ARGV[0] USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.enforce_stock_movement_unit_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE v_role text := CASE
  WHEN NEW.type IN ('grn_receipt', 'grn_amend', 'supplier_return') THEN 'receipt'
  WHEN NEW.type IN ('production_consumption', 'production_output') THEN 'production'
  ELSE 'issue' END;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ingredients
    WHERE tenant_id = NEW.tenant_id AND id = NEW.ingredient_id
      AND NEW.entry_unit_id = CASE v_role
        WHEN 'receipt' THEN receipt_unit_id WHEN 'issue' THEN issue_unit_id ELSE production_unit_id END
  ) THEN RAISE EXCEPTION 'inventory_unit_role_mismatch:%', v_role USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.snapshot_production_run_entry_unit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE v_factor numeric(18,12); v_code text;
BEGIN
  SELECT ingredient_unit.to_base_factor, unit_row.code INTO v_factor, v_code
  FROM public.ingredient_units AS ingredient_unit JOIN public.units AS unit_row
    ON unit_row.id = ingredient_unit.unit_id AND unit_row.tenant_id = ingredient_unit.tenant_id
  WHERE ingredient_unit.tenant_id = NEW.tenant_id AND ingredient_unit.ingredient_id = NEW.finished_good_id
    AND ingredient_unit.unit_id = NEW.entry_unit_id AND ingredient_unit.is_active;
  IF v_factor IS NULL THEN RAISE EXCEPTION 'entry_unit_not_configured' USING ERRCODE = '23503'; END IF;
  NEW.entry_to_base_factor := v_factor; NEW.entry_unit_code := v_code; RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.enforce_production_run_unit_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ingredients
    WHERE tenant_id = NEW.tenant_id AND id = NEW.finished_good_id AND production_unit_id = NEW.entry_unit_id) THEN
    RAISE EXCEPTION 'inventory_unit_role_mismatch:production' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_stock_movement_entry_unit_role BEFORE INSERT OR UPDATE OF ingredient_id, entry_unit_id, type ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION private.enforce_stock_movement_unit_role();
CREATE TRIGGER snapshot_stock_movement_entry_unit BEFORE INSERT OR UPDATE OF ingredient_id, entry_unit_id ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION private.snapshot_inventory_entry_unit();
CREATE TRIGGER enforce_purchase_order_entry_unit_role BEFORE INSERT OR UPDATE OF ingredient_id, entry_unit_id ON public.purchase_order_items FOR EACH ROW EXECUTE FUNCTION private.enforce_inventory_unit_role('receipt');
CREATE TRIGGER snapshot_purchase_order_entry_unit BEFORE INSERT OR UPDATE OF ingredient_id, entry_unit_id ON public.purchase_order_items FOR EACH ROW EXECUTE FUNCTION private.snapshot_inventory_entry_unit();
CREATE TRIGGER enforce_grn_entry_unit_role BEFORE INSERT OR UPDATE OF ingredient_id, entry_unit_id ON public.grn_items FOR EACH ROW EXECUTE FUNCTION private.enforce_inventory_unit_role('receipt');
CREATE TRIGGER snapshot_grn_entry_unit BEFORE INSERT OR UPDATE OF ingredient_id, entry_unit_id ON public.grn_items FOR EACH ROW EXECUTE FUNCTION private.snapshot_inventory_entry_unit();
CREATE TRIGGER enforce_transfer_entry_unit_role BEFORE INSERT OR UPDATE OF ingredient_id, entry_unit_id ON public.stock_transfer_items FOR EACH ROW EXECUTE FUNCTION private.enforce_inventory_unit_role('issue');
CREATE TRIGGER snapshot_transfer_entry_unit BEFORE INSERT OR UPDATE OF ingredient_id, entry_unit_id ON public.stock_transfer_items FOR EACH ROW EXECUTE FUNCTION private.snapshot_inventory_entry_unit();
CREATE TRIGGER enforce_issue_entry_unit_role BEFORE INSERT OR UPDATE OF ingredient_id, entry_unit_id ON public.stock_issue_items FOR EACH ROW EXECUTE FUNCTION private.enforce_inventory_unit_role('issue');
CREATE TRIGGER snapshot_issue_entry_unit BEFORE INSERT OR UPDATE OF ingredient_id, entry_unit_id ON public.stock_issue_items FOR EACH ROW EXECUTE FUNCTION private.snapshot_inventory_entry_unit();
CREATE TRIGGER enforce_production_recipe_entry_unit_role BEFORE INSERT OR UPDATE OF ingredient_id, entry_unit_id ON public.production_recipes FOR EACH ROW EXECUTE FUNCTION private.enforce_inventory_unit_role('production');
CREATE TRIGGER snapshot_production_recipe_entry_unit BEFORE INSERT OR UPDATE OF ingredient_id, entry_unit_id ON public.production_recipes FOR EACH ROW EXECUTE FUNCTION private.snapshot_inventory_entry_unit();
CREATE TRIGGER enforce_production_run_entry_unit_role BEFORE INSERT OR UPDATE OF finished_good_id, entry_unit_id ON public.production_runs FOR EACH ROW EXECUTE FUNCTION private.enforce_production_run_unit_role();
CREATE TRIGGER snapshot_production_run_entry_unit BEFORE INSERT OR UPDATE OF finished_good_id, entry_unit_id ON public.production_runs FOR EACH ROW EXECUTE FUNCTION private.snapshot_production_run_entry_unit();

CREATE OR REPLACE FUNCTION public.save_ingredient_catalog_v2(
  p_ingredient_id bigint, p_name text, p_sku text, p_category_id bigint,
  p_item_kind text, p_storage_type text, p_min_stock_level numeric,
  p_max_stock_level numeric, p_reorder_point numeric, p_shelf_life_days integer,
  p_units jsonb, p_default_fulfill_site_kind text, p_receipt_unit_id bigint,
  p_issue_unit_id bigint, p_production_unit_id bigint DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id(); v_id bigint := p_ingredient_id;
  v_base_unit_id bigint; v_has_movements boolean; v_category_name text;
  v_receipt_factor numeric; v_issue_factor numeric; v_production_factor numeric;
  v_receipt_dimension text; v_issue_dimension text; v_production_dimension text;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL OR public.auth_role() <> 'owner'
     OR NOT public.has_permission_any('inventory:write') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_units IS NULL OR jsonb_array_length(p_units) NOT BETWEEN 1 AND 3
     OR p_receipt_unit_id IS NULL OR p_issue_unit_id IS NULL THEN RAISE EXCEPTION 'inventory_unit_roles_invalid' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_units) AS incoming
    LEFT JOIN public.units AS unit_row ON unit_row.id = (incoming->>'unit_id')::bigint AND unit_row.tenant_id = v_tenant AND unit_row.is_active
    WHERE unit_row.id IS NULL OR COALESCE((incoming->>'to_base_factor')::numeric, 0) <= 0)
    OR (SELECT count(*) FROM jsonb_array_elements(p_units)) <> (SELECT count(DISTINCT (incoming->>'unit_id')::bigint) FROM jsonb_array_elements(p_units) AS incoming)
  THEN RAISE EXCEPTION 'inventory_unit_roles_invalid' USING ERRCODE = '23514'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_units) AS incoming WHERE COALESCE((incoming->>'is_base')::boolean, false)) <> 1 THEN RAISE EXCEPTION 'exactly_one_standard_unit_required' USING ERRCODE = '23514'; END IF;
  SELECT (incoming->>'unit_id')::bigint INTO v_base_unit_id FROM jsonb_array_elements(p_units) AS incoming WHERE COALESCE((incoming->>'is_base')::boolean, false) LIMIT 1;
  IF v_base_unit_id IS DISTINCT FROM COALESCE(p_production_unit_id, p_issue_unit_id) THEN RAISE EXCEPTION 'inventory_standard_unit_role_mismatch' USING ERRCODE = '23514'; END IF;
  SELECT (incoming->>'to_base_factor')::numeric INTO v_receipt_factor FROM jsonb_array_elements(p_units) AS incoming WHERE (incoming->>'unit_id')::bigint = p_receipt_unit_id;
  SELECT (incoming->>'to_base_factor')::numeric INTO v_issue_factor FROM jsonb_array_elements(p_units) AS incoming WHERE (incoming->>'unit_id')::bigint = p_issue_unit_id;
  SELECT (incoming->>'to_base_factor')::numeric INTO v_production_factor FROM jsonb_array_elements(p_units) AS incoming WHERE (incoming->>'unit_id')::bigint = p_production_unit_id;
  IF v_receipt_factor IS NULL OR v_issue_factor IS NULL OR (p_production_unit_id IS NOT NULL AND v_production_factor IS NULL)
     OR v_receipt_factor < v_issue_factor OR (p_production_unit_id IS NOT NULL AND v_issue_factor < v_production_factor) THEN RAISE EXCEPTION 'inventory_unit_role_order_invalid' USING ERRCODE = '23514'; END IF;
  SELECT CASE WHEN is_standard THEN dimension END INTO v_receipt_dimension FROM public.units WHERE tenant_id = v_tenant AND id = p_receipt_unit_id;
  SELECT CASE WHEN is_standard THEN dimension END INTO v_issue_dimension FROM public.units WHERE tenant_id = v_tenant AND id = p_issue_unit_id;
  SELECT CASE WHEN is_standard THEN dimension END INTO v_production_dimension FROM public.units WHERE tenant_id = v_tenant AND id = p_production_unit_id;
  IF (v_receipt_dimension IS NOT NULL AND v_issue_dimension IS NOT NULL AND v_receipt_dimension IS DISTINCT FROM v_issue_dimension)
     OR (v_production_dimension IS NOT NULL AND ((v_receipt_dimension IS NOT NULL AND v_production_dimension IS DISTINCT FROM v_receipt_dimension) OR (v_issue_dimension IS NOT NULL AND v_production_dimension IS DISTINCT FROM v_issue_dimension))) THEN RAISE EXCEPTION 'standard_unit_dimension_mismatch' USING ERRCODE = '23514'; END IF;

  IF v_id IS NULL THEN
    v_id := public.save_ingredient_catalog(NULL, p_name, p_sku, p_category_id, p_item_kind, p_storage_type, p_min_stock_level, p_max_stock_level, p_reorder_point, p_shelf_life_days, p_units, p_default_fulfill_site_kind);
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.stock_movements WHERE tenant_id = v_tenant AND ingredient_id = v_id) INTO v_has_movements;
    IF v_has_movements AND EXISTS (SELECT 1 FROM public.ingredient_units WHERE tenant_id = v_tenant AND ingredient_id = v_id AND is_base AND unit_id IS DISTINCT FROM v_base_unit_id) THEN RAISE EXCEPTION 'inventory_standard_unit_locked_by_stock_movements' USING ERRCODE = '23514'; END IF;
    IF NOT v_has_movements THEN
      v_id := public.save_ingredient_catalog(v_id, p_name, p_sku, p_category_id, p_item_kind, p_storage_type, p_min_stock_level, p_max_stock_level, p_reorder_point, p_shelf_life_days, p_units, p_default_fulfill_site_kind);
    ELSE
      SELECT name INTO v_category_name FROM public.ingredient_categories WHERE tenant_id = v_tenant AND id = p_category_id AND is_active;
      IF p_category_id IS NOT NULL AND v_category_name IS NULL THEN RAISE EXCEPTION 'category not found' USING ERRCODE = '23503'; END IF;
      UPDATE public.ingredients SET name = p_name, sku = p_sku, category_id = p_category_id, category = v_category_name, item_kind = p_item_kind, storage_type = p_storage_type, min_stock_level = COALESCE(p_min_stock_level, 0), max_stock_level = p_max_stock_level, reorder_point = p_reorder_point, shelf_life_days = p_shelf_life_days, default_fulfill_site_kind = p_default_fulfill_site_kind, updated_at = now() WHERE tenant_id = v_tenant AND id = v_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'ingredient not found' USING ERRCODE = 'P0002'; END IF;
      INSERT INTO public.ingredient_units (tenant_id, ingredient_id, unit_id, to_base_factor, is_base, anchor_unit_id, anchor_factor, sort_order)
      SELECT v_tenant, v_id, (incoming->>'unit_id')::bigint, CASE WHEN COALESCE((incoming->>'is_base')::boolean, false) THEN 1 ELSE (incoming->>'to_base_factor')::numeric END, COALESCE((incoming->>'is_base')::boolean, false), NULLIF(incoming->>'anchor_unit_id','')::bigint, NULLIF(incoming->>'anchor_factor','')::numeric, COALESCE((incoming->>'sort_order')::integer, 0) FROM jsonb_array_elements(p_units) AS incoming
      ON CONFLICT ON CONSTRAINT ingredient_units_ing_unit_key DO UPDATE SET to_base_factor = EXCLUDED.to_base_factor, is_base = EXCLUDED.is_base, anchor_unit_id = EXCLUDED.anchor_unit_id, anchor_factor = EXCLUDED.anchor_factor, sort_order = EXCLUDED.sort_order, is_active = true;
      UPDATE public.ingredient_units AS unit_row SET is_active = false WHERE unit_row.tenant_id = v_tenant AND unit_row.ingredient_id = v_id AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_units) AS incoming WHERE (incoming->>'unit_id')::bigint = unit_row.unit_id);
    END IF;
  END IF;
  UPDATE public.ingredients SET receipt_unit_id = p_receipt_unit_id, issue_unit_id = p_issue_unit_id, production_unit_id = p_production_unit_id WHERE tenant_id = v_tenant AND id = v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_ingredient_catalog_v2(bigint, text, text, bigint, text, text, numeric, numeric, numeric, integer, jsonb, text, bigint, bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_ingredient_catalog_v2(bigint, text, text, bigint, text, text, numeric, numeric, numeric, integer, jsonb, text, bigint, bigint, bigint) TO authenticated, service_role;
