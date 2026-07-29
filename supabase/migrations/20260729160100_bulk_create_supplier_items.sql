ALTER TABLE public.supplier_items
  DROP CONSTRAINT supplier_items_supplier_id_supplier_sku_code_key,
  DROP COLUMN supplier_sku_code,
  ADD CONSTRAINT supplier_items_tenant_supplier_ingredient_key
    UNIQUE (tenant_id, supplier_id, ingredient_id);

COMMENT ON TABLE public.supplier_items IS
  'Maps ingredients that may be purchased from each supplier.';

CREATE OR REPLACE FUNCTION public.bulk_create_supplier_items(
  p_supplier_id bigint,
  p_items jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
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

COMMENT ON FUNCTION public.bulk_create_supplier_items(bigint, jsonb) IS
  'Atomically maps multiple active ingredients to one active supplier.';

REVOKE ALL ON FUNCTION public.bulk_create_supplier_items(bigint, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_create_supplier_items(bigint, jsonb)
  TO authenticated;
