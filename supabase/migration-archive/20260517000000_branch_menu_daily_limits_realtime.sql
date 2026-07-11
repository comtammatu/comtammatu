-- =========================================================================
-- branch_menu_item_daily_limits: realtime publication for cross-tab
-- sold_today + is_disabled sync.
--
-- Bug: enforce_branch_menu_daily_limit trigger increments sold_today at DB
-- layer correctly (`20260510040000_branch_menu_item_daily_limits.sql`), but
-- the POS client fetches `daily_limit` once via RSC at `page.tsx`. After an
-- order lands the cap, cashier B's tab still shows "còn suất". Symmetric
-- on cancel — `decrement_branch_menu_daily_limit` decrements sold_today
-- but the client menu state never re-reads the row.
--
-- Subscribing to `postgres_changes` on this table closes the gap: the
-- trigger UPDATE fires a realtime event, all connected POS tabs on the
-- same branch merge it into their local map, and `is_disabled` /
-- "Hết suất" badges flip without a page refresh.
--
-- Changes:
--   1. REPLICA IDENTITY FULL — DELETE/UPDATE payload phải carry đủ
--      `branch_id` (filter `branch_id=eq.X` sẽ silent-drop nếu DEFAULT
--      identity chỉ ship PK) và `menu_item_id` (client merge dùng nó làm
--      key). Per regression REALTIME-PUB-NEEDS-REPLICA-IDENTITY-FULL.
--   2. ADD TABLE branch_menu_item_daily_limits vào supabase_realtime
--      publication (idempotent guard giống pattern các migration realtime
--      khác).
--
-- Hook subscribe (caller side, NOT trong migration):
--   `apps/web/app/br/[branchId]/pos/hooks/use-daily-limit-sync.ts` qua
--   `useRealtimeChannel` (`apps/web/app/_hooks/use-realtime-channel.ts`).
--   Status callback skip first SUBSCRIBED (RSC đã seed limits từ
--   fetchMenuForPos), reconnect refetch via
--   `get_branch_menu_daily_limits_for_pos`. Per regression
--   REALTIME-SUBSCRIBE-NEEDS-STATUS-CALLBACK.
-- =========================================================================

-- ─── 1. REPLICA IDENTITY FULL ────────────────────────────────────────────
ALTER TABLE public.branch_menu_item_daily_limits REPLICA IDENTITY FULL;


-- ─── 2. Add to supabase_realtime publication ─────────────────────────────
DO $pub$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'branch_menu_item_daily_limits'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.branch_menu_item_daily_limits;
  END IF;
END
$pub$;
