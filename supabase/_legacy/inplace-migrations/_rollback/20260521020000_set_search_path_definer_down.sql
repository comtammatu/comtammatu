-- Rollback for 20260521020000_set_search_path_definer.sql
-- Reset search_path về NULL (default = caller's current setting) cho
-- mọi function vừa được pin. Predicate đảo: tìm function HIỆN có
-- search_path = public, pg_temp (chữ ký exact match) và RESET.
-- An toàn: function thiếu search_path là default behavior trước migration.
DO $$
DECLARE
  v_func RECORD;
BEGIN
  FOR v_func IN
    SELECT
      p.oid,
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND 'search_path=public, pg_temp' = ANY(COALESCE(p.proconfig, ARRAY[]::text[]))
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) RESET search_path',
      v_func.proname,
      v_func.args
    );
  END LOOP;
END $$;
