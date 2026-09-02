-- Delivery sides must use channel list price (same helper as main items).
-- Root: pos_enrich_order_sides always read menu_items.base_price; create/append
-- already re-price mains via pos_resolve_item_list_price but left sides on dine-in.

-- Idempotent: Production still has the 3-arg overload; a retried apply may
-- already have the 5-arg channel-aware body after a prior successful replace.
DROP FUNCTION IF EXISTS public.pos_enrich_order_sides(bigint, bigint, jsonb);
DROP FUNCTION IF EXISTS public.pos_enrich_order_sides(bigint, bigint, jsonb, text, text);

CREATE OR REPLACE FUNCTION public.pos_enrich_order_sides(
  p_tenant_id bigint,
  p_main_item_id bigint,
  p_sides jsonb,
  p_order_type text DEFAULT NULL,
  p_delivery_platform text DEFAULT NULL
) RETURNS TABLE(sides_sum numeric, enriched_sides jsonb)
    LANGUAGE plpgsql
    STABLE
    SET search_path TO 'public'
AS $function$
DECLARE
  v_raw_count   INT := 0;
  v_valid_count INT := 0;
  v_live_count  INT := 0;
  v_order_type  TEXT := COALESCE(NULLIF(btrim(COALESCE(p_order_type, '')), ''), 'dine_in');
BEGIN
  IF p_sides IS NULL THEN
    RETURN QUERY SELECT 0::NUMERIC(15,2), '[]'::JSONB;
    RETURN;
  END IF;

  IF jsonb_typeof(p_sides) <> 'array' THEN
    RAISE EXCEPTION 'stale_side_or_modifier' USING ERRCODE = '22023';
  END IF;

  v_raw_count := jsonb_array_length(p_sides);
  IF v_raw_count = 0 THEN
    RETURN QUERY SELECT 0::NUMERIC(15,2), '[]'::JSONB;
    RETURN;
  END IF;

  WITH side_input AS (
    SELECT
      (side_el ->> 'side_item_id')::BIGINT AS side_item_id,
      CASE
        WHEN (side_el ->> 'quantity') ~ '^[0-9]+$'
          THEN LEAST(99, GREATEST(1, (side_el ->> 'quantity')::INT))
        ELSE 1
      END AS quantity
    FROM jsonb_array_elements(p_sides) AS side_el
    WHERE side_el ? 'side_item_id'
      AND (side_el ->> 'side_item_id') ~ '^[0-9]+$'
  )
  SELECT COUNT(*)::INT INTO v_valid_count
  FROM side_input;

  IF v_valid_count <> v_raw_count THEN
    RAISE EXCEPTION 'stale_side_or_modifier' USING ERRCODE = '22023';
  END IF;

  WITH side_input AS (
    SELECT
      (side_el ->> 'side_item_id')::BIGINT AS side_item_id,
      CASE
        WHEN (side_el ->> 'quantity') ~ '^[0-9]+$'
          THEN LEAST(99, GREATEST(1, (side_el ->> 'quantity')::INT))
        ELSE 1
      END AS quantity
    FROM jsonb_array_elements(p_sides) AS side_el
    WHERE side_el ? 'side_item_id'
      AND (side_el ->> 'side_item_id') ~ '^[0-9]+$'
  ),
  live_sides AS (
    SELECT 1
    FROM side_input si
    JOIN public.menu_item_available_sides mas
      ON mas.tenant_id = p_tenant_id
     AND mas.main_item_id = p_main_item_id
     AND mas.side_item_id = si.side_item_id
    JOIN public.menu_items mi
      ON mi.id = si.side_item_id
     AND mi.tenant_id = p_tenant_id
     AND mi.is_active = TRUE
  )
  SELECT COUNT(*)::INT INTO v_live_count
  FROM live_sides;

  IF v_live_count <> v_valid_count THEN
    RAISE EXCEPTION 'stale_side_or_modifier' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH side_input AS (
    SELECT
      (side_el ->> 'side_item_id')::BIGINT AS side_item_id,
      CASE
        WHEN (side_el ->> 'quantity') ~ '^[0-9]+$'
          THEN LEAST(99, GREATEST(1, (side_el ->> 'quantity')::INT))
        ELSE 1
      END AS quantity
    FROM jsonb_array_elements(p_sides) AS side_el
    WHERE side_el ? 'side_item_id'
      AND (side_el ->> 'side_item_id') ~ '^[0-9]+$'
  ),
  live_sides AS (
    SELECT
      mi.id,
      mi.name,
      public.pos_resolve_item_list_price(
        p_tenant_id,
        mi.id,
        v_order_type,
        p_delivery_platform
      ) AS unit_price,
      mas.is_default,
      si.quantity
    FROM side_input si
    JOIN public.menu_item_available_sides mas
      ON mas.tenant_id = p_tenant_id
     AND mas.main_item_id = p_main_item_id
     AND mas.side_item_id = si.side_item_id
    JOIN public.menu_items mi
      ON mi.id = si.side_item_id
     AND mi.tenant_id = p_tenant_id
     AND mi.is_active = TRUE
  )
  SELECT
    COALESCE(SUM(unit_price * quantity), 0)::NUMERIC(15,2),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'side_item_id', id,
          'name', name,
          'price', unit_price,
          'quantity', quantity,
          'is_default', is_default
        )
        ORDER BY name
      ),
      '[]'::JSONB
    )
  FROM live_sides;
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_enrich_order_sides(bigint, bigint, jsonb, text, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pos_enrich_order_sides(bigint, bigint, jsonb, text, text) TO anon;
GRANT ALL ON FUNCTION public.pos_enrich_order_sides(bigint, bigint, jsonb, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.pos_enrich_order_sides(bigint, bigint, jsonb, text, text) TO service_role;

COMMENT ON FUNCTION public.pos_enrich_order_sides(bigint, bigint, jsonb, text, text) IS
  'Validate and enrich POS side snapshots; unit price via pos_resolve_item_list_price (channel list for delivery).';

-- Patch create_order / append_order_items / edit_pending_order_item call sites
-- without rewriting full function bodies (same pattern as route_order_to_kds fix).

DO $patch_create_order_sides$
DECLARE
  v_def text;
  v_updated text;
  v_needle text := $n$FROM public.pos_enrich_order_sides(
        p_tenant_id,
        v_menu_item_id,
        COALESCE(v_item -> 'sides', '[]'::JSONB)
      )$n$;
  v_insert text := $n$FROM public.pos_enrich_order_sides(
        p_tenant_id,
        v_menu_item_id,
        COALESCE(v_item -> 'sides', '[]'::JSONB),
        p_order_type,
        v_platform
      )$n$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'create_order'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) =
      'p_tenant_id bigint, p_branch_id bigint, p_created_by uuid, p_items jsonb, p_order_type text, p_table_id bigint, p_pos_session_id bigint, p_note text, p_idempotency_key uuid, p_delivery_platform text, p_external_order_ref text';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'create_order missing';
  END IF;

  v_def := replace(replace(v_def, E'\r\n', E'\n'), E'\r', E'\n');
  v_def := regexp_replace(
    v_def,
    '^CREATE (OR REPLACE )?FUNCTION',
    'CREATE OR REPLACE FUNCTION'
  );

  IF position(v_needle in v_def) = 0 THEN
    IF position('p_order_type,' in v_def) > 0
      AND position('v_platform' in v_def) > 0
      AND position('pos_enrich_order_sides(' in v_def) > 0
    THEN
      -- Already patched or equivalent.
      NULL;
    ELSE
      RAISE EXCEPTION 'create_order pos_enrich_order_sides needle missing';
    END IF;
  ELSE
    v_updated := replace(v_def, v_needle, v_insert);
    IF v_updated = v_def THEN
      RAISE EXCEPTION 'create_order sides channel patch failed';
    END IF;
    EXECUTE v_updated;
  END IF;
END;
$patch_create_order_sides$;

DO $patch_append_order_sides$
DECLARE
  v_def text;
  v_updated text;
  v_needle text := $n$FROM public.pos_enrich_order_sides(
      v_order.tenant_id,
      v_menu_item_id,
      COALESCE(v_item -> 'sides', '[]'::JSONB)
    )$n$;
  v_insert text := $n$FROM public.pos_enrich_order_sides(
      v_order.tenant_id,
      v_menu_item_id,
      COALESCE(v_item -> 'sides', '[]'::JSONB),
      v_order.order_type,
      v_order.delivery_platform
    )$n$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'append_order_items'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) =
      'p_order_id bigint, p_items jsonb, p_idempotency_key uuid';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'append_order_items missing';
  END IF;

  v_def := replace(replace(v_def, E'\r\n', E'\n'), E'\r', E'\n');
  v_def := regexp_replace(
    v_def,
    '^CREATE (OR REPLACE )?FUNCTION',
    'CREATE OR REPLACE FUNCTION'
  );

  IF position(v_needle in v_def) = 0 THEN
    IF position('v_order.order_type,' in v_def) > 0
      AND position('v_order.delivery_platform' in v_def) > 0
      AND position('pos_enrich_order_sides(' in v_def) > 0
    THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'append_order_items pos_enrich_order_sides needle missing';
    END IF;
  ELSE
    v_updated := replace(v_def, v_needle, v_insert);
    IF v_updated = v_def THEN
      RAISE EXCEPTION 'append_order_items sides channel patch failed';
    END IF;
    EXECUTE v_updated;
  END IF;
END;
$patch_append_order_sides$;

DO $patch_edit_pending_sides$
DECLARE
  v_def text;
  v_updated text;
  v_sides_needle text := $n$FROM public.pos_enrich_order_sides(
    v_order.tenant_id,
    v_item.menu_item_id,
    COALESCE(p_sides, '[]'::JSONB)
  )$n$;
  v_sides_insert text := $n$FROM public.pos_enrich_order_sides(
    v_order.tenant_id,
    v_item.menu_item_id,
    COALESCE(p_sides, '[]'::JSONB),
    v_order.order_type,
    v_order.delivery_platform
  )$n$;
  v_base_needle text := $n$SELECT base_price, is_active
  INTO v_base_price, v_menu_active
  FROM public.menu_items
  WHERE id = v_item.menu_item_id AND tenant_id = v_order.tenant_id;

  IF NOT FOUND OR COALESCE(v_menu_active, FALSE) = FALSE THEN
    RAISE EXCEPTION 'menu item inactive' USING ERRCODE = '22023';
  END IF;$n$;
  v_base_insert text := $n$SELECT is_active
  INTO v_menu_active
  FROM public.menu_items
  WHERE id = v_item.menu_item_id AND tenant_id = v_order.tenant_id;

  IF NOT FOUND OR COALESCE(v_menu_active, FALSE) = FALSE THEN
    RAISE EXCEPTION 'menu item inactive' USING ERRCODE = '22023';
  END IF;

  v_base_price := public.pos_resolve_item_list_price(
    v_order.tenant_id,
    v_item.menu_item_id,
    v_order.order_type,
    v_order.delivery_platform
  );$n$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'edit_pending_order_item'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) =
      'p_order_item_id bigint, p_variant_id bigint, p_variant_name text, p_unit_price numeric, p_modifiers jsonb, p_sides jsonb, p_note text, p_quantity integer';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'edit_pending_order_item missing';
  END IF;

  v_def := replace(replace(v_def, E'\r\n', E'\n'), E'\r', E'\n');
  v_def := regexp_replace(
    v_def,
    '^CREATE (OR REPLACE )?FUNCTION',
    'CREATE OR REPLACE FUNCTION'
  );

  IF position(v_sides_needle in v_def) > 0 THEN
    v_updated := replace(v_def, v_sides_needle, v_sides_insert);
    IF v_updated = v_def THEN
      RAISE EXCEPTION 'edit_pending_order_item sides channel patch failed';
    END IF;
    v_def := v_updated;
  ELSIF position('v_order.order_type,' in v_def) = 0
    OR position('pos_enrich_order_sides(' in v_def) = 0
  THEN
    RAISE EXCEPTION 'edit_pending_order_item pos_enrich_order_sides needle missing';
  END IF;

  IF position(v_base_needle in v_def) > 0 THEN
    v_updated := replace(v_def, v_base_needle, v_base_insert);
    IF v_updated = v_def THEN
      RAISE EXCEPTION 'edit_pending_order_item list-price patch failed';
    END IF;
    v_def := v_updated;
  ELSIF position('pos_resolve_item_list_price(' in v_def) = 0 THEN
    RAISE EXCEPTION 'edit_pending_order_item base_price needle missing';
  END IF;

  EXECUTE v_def;
END;
$patch_edit_pending_sides$;
