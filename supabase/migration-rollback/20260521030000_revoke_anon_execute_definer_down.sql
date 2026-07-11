-- Rollback for 20260521030000_revoke_anon_execute_definer.sql
-- GRANT EXECUTE TO anon lại cho tất cả SECURITY DEFINER function trong
-- public schema (đảo predicate: chọn function ĐANG không có anon grant).
-- Chỉ apply nếu phát hiện flow anon nào silently dùng RPC công khai
-- mà chưa biết.
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
      AND has_function_privilege('anon', p.oid, 'EXECUTE') = false
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon',
      v_func.proname,
      v_func.args
    );
  END LOOP;
END $$;
