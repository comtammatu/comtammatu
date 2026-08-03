-- D094: preferred supplier mapping for multi-NCC ingredients.
-- At most one active preferred supplier_items row per ingredient.
-- GRN draft auto-selects preferred when >1 active mapping; picker still allows override.

ALTER TABLE public.supplier_items
  ADD COLUMN IF NOT EXISTS is_preferred boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.supplier_items.is_preferred IS
  'Preferred active mapping for an ingredient. At most one per tenant+ingredient among active rows.';

-- Backfill sole active mappings so catalog state matches auto-select behavior.
UPDATE public.supplier_items AS target
SET is_preferred = true
WHERE target.is_active
  AND NOT target.is_preferred
  AND (
    SELECT count(*)::integer
    FROM public.supplier_items AS peer
    WHERE peer.tenant_id = target.tenant_id
      AND peer.ingredient_id = target.ingredient_id
      AND peer.is_active
  ) = 1;

CREATE UNIQUE INDEX IF NOT EXISTS supplier_items_one_preferred_per_ingredient_uidx
  ON public.supplier_items (tenant_id, ingredient_id)
  WHERE is_active AND is_preferred;

GRANT SELECT (is_preferred) ON public.supplier_items TO authenticated;
GRANT INSERT (is_preferred) ON public.supplier_items TO authenticated;
GRANT UPDATE (is_preferred) ON public.supplier_items TO authenticated;

CREATE OR REPLACE FUNCTION public.set_supplier_item_preferred(
  p_item_id bigint,
  p_is_preferred boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_uid uuid := auth.uid();
  v_item public.supplier_items%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'missing_tenant' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('procurement:price_list_write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_item_id IS NULL OR p_item_id <= 0 THEN
    RAISE EXCEPTION 'invalid_supplier_item_id' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_item
  FROM public.supplier_items
  WHERE id = p_item_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'supplier_item_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_item.is_active THEN
    RAISE EXCEPTION 'supplier_item_inactive' USING ERRCODE = '22023';
  END IF;

  IF p_is_preferred THEN
    UPDATE public.supplier_items
    SET is_preferred = false,
        updated_at = pg_catalog.now()
    WHERE tenant_id = v_tenant
      AND ingredient_id = v_item.ingredient_id
      AND is_active
      AND is_preferred
      AND id IS DISTINCT FROM p_item_id;

    UPDATE public.supplier_items
    SET is_preferred = true,
        updated_at = pg_catalog.now()
    WHERE id = p_item_id
      AND tenant_id = v_tenant;
  ELSE
    UPDATE public.supplier_items
    SET is_preferred = false,
        updated_at = pg_catalog.now()
    WHERE id = p_item_id
      AND tenant_id = v_tenant;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'item_id', p_item_id,
    'ingredient_id', v_item.ingredient_id,
    'supplier_id', v_item.supplier_id,
    'is_preferred', p_is_preferred
  );
END;
$$;

COMMENT ON FUNCTION public.set_supplier_item_preferred(bigint, boolean) IS
  'Sets or clears preferred supplier mapping for an ingredient; clears other active preferreds when enabling.';

REVOKE ALL ON FUNCTION public.set_supplier_item_preferred(bigint, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_supplier_item_preferred(bigint, boolean)
  TO authenticated;
