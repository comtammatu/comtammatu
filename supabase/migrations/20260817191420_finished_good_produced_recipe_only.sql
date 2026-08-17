-- Finished goods are kitchen-produced SKUs with a production recipe.
-- Purchased bottles, lids, and similar stay raw_material (PO / GRN / NCC).

UPDATE public.ingredients AS ingredient
SET item_kind = 'raw_material',
    updated_at = pg_catalog.now()
WHERE ingredient.item_kind = 'finished_good'
  AND NOT EXISTS (
    SELECT 1
    FROM public.production_recipe_specs AS spec
    WHERE spec.tenant_id = ingredient.tenant_id
      AND spec.finished_good_id = ingredient.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.stock_movements AS movement
    WHERE movement.tenant_id = ingredient.tenant_id
      AND movement.ingredient_id = ingredient.id
      AND movement.type = 'production_output'
  );

UPDATE public.supplier_items AS link
SET is_active = FALSE,
    updated_at = pg_catalog.now()
FROM public.ingredients AS ingredient
WHERE link.tenant_id = ingredient.tenant_id
  AND link.ingredient_id = ingredient.id
  AND link.is_active
  AND ingredient.item_kind = 'finished_good';

CREATE OR REPLACE FUNCTION private.assert_purchased_ingredient(
  p_tenant_id bigint,
  p_ingredient_id bigint
) RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_kind text;
BEGIN
  SELECT ingredient.item_kind
  INTO v_kind
  FROM public.ingredients AS ingredient
  WHERE ingredient.tenant_id = p_tenant_id
    AND ingredient.id = p_ingredient_id;

  IF v_kind = 'finished_good' THEN
    RAISE EXCEPTION 'finished_good_not_purchased'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.supplier_items_require_purchased()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.is_active THEN
    PERFORM private.assert_purchased_ingredient(
      NEW.tenant_id,
      NEW.ingredient_id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.purchase_lines_require_purchased()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM private.assert_purchased_ingredient(
    NEW.tenant_id,
    NEW.ingredient_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_items_require_purchased
  ON public.supplier_items;
CREATE TRIGGER trg_supplier_items_require_purchased
  BEFORE INSERT OR UPDATE OF ingredient_id, is_active
  ON public.supplier_items
  FOR EACH ROW
  EXECUTE FUNCTION private.supplier_items_require_purchased();

DROP TRIGGER IF EXISTS trg_purchase_request_items_require_purchased
  ON public.purchase_request_items;
CREATE TRIGGER trg_purchase_request_items_require_purchased
  BEFORE INSERT OR UPDATE OF ingredient_id
  ON public.purchase_request_items
  FOR EACH ROW
  EXECUTE FUNCTION private.purchase_lines_require_purchased();

DROP TRIGGER IF EXISTS trg_purchase_order_items_require_purchased
  ON public.purchase_order_items;
CREATE TRIGGER trg_purchase_order_items_require_purchased
  BEFORE INSERT OR UPDATE OF ingredient_id
  ON public.purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION private.purchase_lines_require_purchased();

DROP TRIGGER IF EXISTS trg_grn_items_require_purchased
  ON public.grn_items;
CREATE TRIGGER trg_grn_items_require_purchased
  BEFORE INSERT OR UPDATE OF ingredient_id
  ON public.grn_items
  FOR EACH ROW
  EXECUTE FUNCTION private.purchase_lines_require_purchased();

CREATE OR REPLACE FUNCTION public.bulk_create_supplier_items(
  p_supplier_id bigint,
  p_items jsonb
) RETURNS integer
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_user_id uuid := auth.uid();
  v_item_count integer;
  v_inserted_count integer;
BEGIN
  IF v_user_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('procurement:price_list_write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_supplier_id IS NULL OR p_supplier_id <= 0 THEN
    RAISE EXCEPTION 'invalid_supplier_id' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_supplier_items' USING ERRCODE = '22023';
  END IF;

  v_item_count := pg_catalog.jsonb_array_length(p_items);
  IF v_item_count < 1 OR v_item_count > 500 THEN
    RAISE EXCEPTION 'invalid_supplier_item_count' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.suppliers
  WHERE id = p_supplier_id
    AND tenant_id = v_tenant_id
    AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'supplier_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(p_items)
      AS item(ingredient_id bigint)
    WHERE item.ingredient_id IS NULL
      OR item.ingredient_id <= 0
  ) THEN
    RAISE EXCEPTION 'invalid_supplier_item' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(p_items)
      AS item(ingredient_id bigint)
    GROUP BY item.ingredient_id
    HAVING pg_catalog.count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_ingredient' USING ERRCODE = '23505';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM public.ingredients AS ingredient
    JOIN pg_catalog.jsonb_to_recordset(p_items)
      AS item(ingredient_id bigint)
      ON item.ingredient_id = ingredient.id
    WHERE ingredient.tenant_id = v_tenant_id
      AND ingredient.is_active
  ) <> v_item_count THEN
    RAISE EXCEPTION 'ingredient_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ingredients AS ingredient
    JOIN pg_catalog.jsonb_to_recordset(p_items)
      AS item(ingredient_id bigint)
      ON item.ingredient_id = ingredient.id
    WHERE ingredient.tenant_id = v_tenant_id
      AND ingredient.item_kind = 'finished_good'
  ) THEN
    RAISE EXCEPTION 'finished_good_not_purchased' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_items AS existing
    JOIN pg_catalog.jsonb_to_recordset(p_items)
      AS item(ingredient_id bigint)
      ON item.ingredient_id = existing.ingredient_id
    WHERE existing.tenant_id = v_tenant_id
      AND existing.supplier_id = p_supplier_id
      AND existing.is_active
  ) THEN
    RAISE EXCEPTION 'supplier_item_mapping_exists' USING ERRCODE = '23505';
  END IF;

  WITH parsed AS (
    SELECT item.ingredient_id
    FROM pg_catalog.jsonb_to_recordset(p_items)
      AS item(ingredient_id bigint)
  ),
  inserted AS (
    INSERT INTO public.supplier_items (
      tenant_id,
      supplier_id,
      ingredient_id,
      is_preferred,
      created_by
    )
    SELECT
      v_tenant_id,
      p_supplier_id,
      parsed.ingredient_id,
      NOT EXISTS (
        SELECT 1
        FROM public.supplier_items AS peer
        WHERE peer.tenant_id = v_tenant_id
          AND peer.ingredient_id = parsed.ingredient_id
          AND peer.is_active
      ),
      v_user_id
    FROM parsed
    RETURNING 1
  )
  SELECT pg_catalog.count(*)::integer
  INTO v_inserted_count
  FROM inserted;

  RETURN v_inserted_count;
END;
$$;

COMMENT ON FUNCTION private.assert_purchased_ingredient(bigint, bigint) IS
  'Rejects finished_good on PO / GRN / NCC purchase lines.';

REVOKE ALL ON FUNCTION public.bulk_create_supplier_items(bigint, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_create_supplier_items(bigint, jsonb)
  TO authenticated;
