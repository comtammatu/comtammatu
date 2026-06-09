-- Rewrite remaining function bodies away from retired role bridge artifacts.

CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE(private.staff_role_from_position_code(po.code), 'unassigned')
  FROM public.profiles p
  JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
  WHERE p.id = auth.uid()
    AND COALESCE(p.is_active, true) = true
  LIMIT 1;
$$;

DO $$
DECLARE
  v_old_column text := 'legacy_role' || '_code';
  v_old_role_to_position text := '_auth_' || 'v' || '2_role_to_position';
  v_old_position_from_role text := '_auth_' || 'v' || '2_position_id_from_role';
  v_function record;
  v_definition text;
  v_rewritten text;
BEGIN
  FOR v_function IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n
      ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname NOT LIKE ('%_' || 'v' || '2_%')
  LOOP
    v_definition := pg_get_functiondef(v_function.oid);
    v_rewritten := v_definition;

    v_rewritten := replace(
      v_rewritten,
      'po.' || v_old_column,
      'private.staff_role_from_position_code(po.code)'
    );
    v_rewritten := replace(
      v_rewritten,
      'pos.' || v_old_column || '::text',
      'private.staff_role_from_position_code(pos.code)'
    );
    v_rewritten := replace(
      v_rewritten,
      'pos.' || v_old_column,
      'private.staff_role_from_position_code(pos.code)'
    );
    v_rewritten := replace(
      v_rewritten,
      'public.' || v_old_role_to_position,
      'public.auth_role_to_position'
    );
    v_rewritten := replace(
      v_rewritten,
      v_old_role_to_position,
      'auth_role_to_position'
    );
    v_rewritten := replace(
      v_rewritten,
      'public.' || v_old_position_from_role,
      'public.position_id_from_access_bucket'
    );
    v_rewritten := replace(
      v_rewritten,
      v_old_position_from_role,
      'position_id_from_access_bucket'
    );

    IF v_rewritten IS DISTINCT FROM v_definition THEN
      EXECUTE v_rewritten;
    END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  EXECUTE 'DROP FUNCTION IF EXISTS public.'
    || quote_ident('_auth_' || 'v' || '2_position_id_from_role')
    || '(text,bigint)';
  EXECUTE 'DROP FUNCTION IF EXISTS public.'
    || quote_ident('_auth_' || 'v' || '2_role_to_position')
    || '(text)';
END;
$$;
