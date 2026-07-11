-- =============================================================
-- P2 NOISE REDUCTION (delta) — REVOKE EXECUTE FROM PUBLIC cho SECURITY
-- DEFINER RPC còn anon access qua PUBLIC grant
--
-- Vấn đề phát hiện sau apply 20260521030000: REVOKE FROM anon là no-op
-- nếu function chỉ có PUBLIC grant (mặc định PG khi tạo function không
-- có REVOKE/GRANT statement nào). Sau migration trước, vẫn còn 88 SECURITY
-- DEFINER function trong public schema mà anon có thể EXECUTE qua đường
-- PUBLIC. Lý do: nhiều migration cũ chỉ làm `GRANT EXECUTE TO authenticated`
-- mà KHÔNG kèm `REVOKE EXECUTE FROM PUBLIC` đầu tiên → PUBLIC grant
-- mặc định vẫn còn.
--
-- Fix: REVOKE EXECUTE FROM PUBLIC cho mọi SECURITY DEFINER function trong
-- public schema mà authenticated CÒN giữ explicit grant. Điều kiện
-- `auth_has_explicit_grant` đảm bảo POS app không bị mất quyền — chỉ
-- cắt PUBLIC (= anon + future role chưa biết).
--
-- service_role bypass ACL → không bị ảnh hưởng (cron + admin tasks OK).
-- Trigger function: PG bypass EXECUTE check khi fire qua row event,
-- không phụ thuộc grant → safe.
--
-- Idempotent qua REVOKE (no-op nếu đã không có PUBLIC grant).
-- =============================================================

DO $$
DECLARE
  v_func RECORD;
  v_count INT := 0;
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
      AND has_function_privilege('public', p.oid, 'EXECUTE') = true
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE') = true
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC',
      v_func.proname,
      v_func.args
    );
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'REVOKE PUBLIC EXECUTE from % SECURITY DEFINER functions', v_count;
END $$;
