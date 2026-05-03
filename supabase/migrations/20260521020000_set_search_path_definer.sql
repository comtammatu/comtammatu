-- =============================================================
-- P1 SECURITY HARDENING — pin search_path cho 21 function thiếu setting
--
-- Vấn đề: Supabase advisor báo `function_search_path_mutable` WARN cho
-- 21 function trong public schema không có `SET search_path` (kiểm tra
-- live: tất cả là non-SECURITY-DEFINER, đa số là trigger function).
--
-- Lý do fix: dù là non-DEFINER (chạy với quyền caller), schema poisoning
-- vẫn khả thi nếu attacker tạo schema riêng + override built-in name.
-- Với trigger function chạy implicit qua INSERT/UPDATE → blast radius
-- không nhỏ. Best practice: pin `search_path = public, pg_temp` cho mọi
-- function (DEFINER và non-DEFINER).
--
-- Fix: dynamic DO block enumerate 21 function bằng cùng predicate
-- advisor dùng (`NOT EXISTS unnest(proconfig) WHERE LIKE 'search_path=%'`)
-- và chạy `ALTER FUNCTION ... SET search_path = public, pg_temp`.
-- Idempotent — apply lại không break (ALTER SET là replace).
--
-- Không hardcode danh sách 21 function vì có thể mới thêm/đổi tên giữa
-- lúc viết migration và lúc apply; predicate bắt đúng cái thiếu hiện
-- thời. Inspect-list 21 function (snapshot 2026-05-03) cho reference:
--   trigger: check_*_tenant, update_updated_at, guard_*, *_immutable,
--            stock_issue_items_*, save_item_*, save_station_categories
--   helper:  _auth_v2_check_*, auth_*_id, can_access_branch,
--            release_table, toggle_*_active, compute_discount_amount
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
      AND NOT EXISTS (
        SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp',
      v_func.proname,
      v_func.args
    );
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Pinned search_path cho % function', v_count;
END $$;
