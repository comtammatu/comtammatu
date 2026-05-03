-- =============================================================
-- P2 NOISE REDUCTION — REVOKE EXECUTE FROM anon cho SECURITY DEFINER RPC
--
-- Vấn đề: Supabase advisor báo `anon_security_definer_function_executable`
-- WARN cho ~172 function SECURITY DEFINER trong public schema có
-- GRANT EXECUTE TO anon. Lint là defense-in-depth: SECURITY DEFINER chạy
-- với quyền owner (postgres) → bypass RLS. Nếu bất kỳ flow anon nào gọi
-- được, attacker có entry point bypass tenant isolation.
--
-- Đánh giá codebase: POS app KHÔNG support anon access (mọi route phải
-- login). Không có public menu/online booking/QR scan. Auth flow do
-- Supabase Auth tự xử (signup/login đi qua auth.* schema, không phải
-- RPC public). Custom JWT hook `custom_access_token_hook` đã GRANT cho
-- `supabase_auth_admin` riêng, không phụ thuộc anon GRANT.
--
-- Verdict: an toàn REVOKE EXECUTE FROM anon cho TẤT CẢ SECURITY DEFINER
-- function trong public schema. Authenticated/service_role grant giữ
-- nguyên (POS dùng authenticated, cron dùng service_role).
--
-- Fix: dynamic DO block enumerate function thoả predicate advisor
-- (`prosecdef = true AND has_function_privilege('anon', oid, 'EXECUTE')`)
-- và chạy `REVOKE EXECUTE ... FROM anon`. Idempotent — REVOKE no-op nếu
-- đã không có grant.
--
-- Whitelist: không cần (Supabase Auth admin functions ở schema `auth`,
-- không phải `public`; trigger function được PG bypass EXECUTE check khi
-- fire qua row event, không phụ thuộc grant).
--
-- Rollback: `_rollback/..._down.sql` GRANT lại cho cả ~172 function
-- bằng cùng predicate.
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
      AND has_function_privilege('anon', p.oid, 'EXECUTE') = true
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',
      v_func.proname,
      v_func.args
    );
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'REVOKE anon EXECUTE từ % SECURITY DEFINER function', v_count;
END $$;
