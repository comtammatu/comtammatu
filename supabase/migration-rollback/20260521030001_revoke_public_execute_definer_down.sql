-- Rollback for 20260521030001_revoke_public_execute_definer.sql
-- GRANT EXECUTE TO PUBLIC lại cho mọi SECURITY DEFINER function trong
-- public schema mà PUBLIC HIỆN không còn grant. Chỉ apply nếu phát hiện
-- regression cụ thể (vd custom hook hoặc background job dùng PUBLIC).
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
      AND p.prosecdef = true
      AND has_function_privilege('public', p.oid, 'EXECUTE') = false
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO PUBLIC',
      v_func.proname,
      v_func.args
    );
  END LOOP;
END $$;
