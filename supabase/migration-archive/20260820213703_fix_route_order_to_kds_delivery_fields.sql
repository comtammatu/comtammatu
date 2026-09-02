-- Correct route_order_to_kds after 20260820174417_pos_delivery_channel:
-- the kitchen payload patch injected v_order.delivery_platform /
-- v_order.external_order_ref without selecting those columns into the RECORD.
-- create_order → route_order_to_kds then raises 42703
-- (record "v_order" has no field "delivery_platform").
-- Also extend kitchen ticket sequence parse to GH- prefixes.

DO $fix_route_order_to_kds_delivery$
DECLARE
  v_def text;
  v_updated text;
  v_select_needle text := $n$SELECT tenant_id, branch_id, order_number, order_type, note, created_by,
         table_id, kitchen_send_count
  INTO v_order$n$;
  v_select_insert text := $n$SELECT tenant_id, branch_id, order_number, order_type,
         delivery_platform, external_order_ref, note, created_by,
         table_id, kitchen_send_count
  INTO v_order$n$;
  v_regex_needle text := $n$'^(?:TC|MV)-(?:(?:[0-9]{6}|[0-9]{8})-)?([0-9]{1,5})(?:-.+)?$'$n$;
  v_regex_insert text := $n$'^(?:TC|MV|GH)-(?:(?:[0-9]{6}|[0-9]{8})-)?([0-9]{1,5})(?:-.+)?$'$n$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'route_order_to_kds'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_order_id bigint';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'route_order_to_kds missing';
  END IF;

  v_def := replace(replace(v_def, E'\r\n', E'\n'), E'\r', E'\n');
  v_def := regexp_replace(
    v_def,
    '^CREATE (OR REPLACE )?FUNCTION',
    'CREATE OR REPLACE FUNCTION'
  );

  IF position(v_select_needle in v_def) > 0 THEN
    v_updated := replace(v_def, v_select_needle, v_select_insert);
    IF v_updated = v_def THEN
      RAISE EXCEPTION 'route_order_to_kds delivery SELECT patch failed';
    END IF;
    v_def := v_updated;
  ELSIF position('delivery_platform, external_order_ref, note, created_by' in v_def) = 0
    AND position('delivery_platform, external_order_ref' in v_def) = 0 THEN
    RAISE EXCEPTION 'route_order_to_kds delivery SELECT needle missing';
  END IF;

  IF position(v_regex_needle in v_def) > 0 THEN
    v_updated := replace(v_def, v_regex_needle, v_regex_insert);
    IF v_updated = v_def THEN
      RAISE EXCEPTION 'route_order_to_kds GH regex patch failed';
    END IF;
    v_def := v_updated;
  END IF;

  EXECUTE v_def;
END;
$fix_route_order_to_kds_delivery$;
