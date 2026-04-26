-- =========================================================================
-- POS Sessions: realtime publication for cross-tab session-state sync
--
-- Pair với 20260503000000_pos_session_per_branch (Owner D7). Per-branch
-- model = mọi tab/máy cùng branch chia sẻ 1 session. Khi cashier close ca
-- trên tab A, các tab khác (waiter ride session, cashier khác cùng branch)
-- cần sync ngay để KHÔNG ring đơn vào session đã closed (server sẽ reject
-- với SCOPE_SESSION_NOT_OPEN, vỡ flow cashier).
--
-- Hiện tại pos_sessions KHÔNG nằm trong supabase_realtime publication →
-- mọi cross-tab sync phụ thuộc `router.refresh()` thủ công sau open/close.
--
-- Changes:
--   1. REPLICA IDENTITY FULL  — DELETE/UPDATE payload phải carry đủ
--      branch_id để filter `branch_id=eq.X` không drop event silently.
--      Per regression REALTIME-PUB-NEEDS-REPLICA-IDENTITY-FULL.
--   2. ADD TABLE pos_sessions vào supabase_realtime publication.
--
-- Hook subscribe (caller side, NOT trong migration):
--   useRealtimeChannel via `apps/web/app/_hooks/use-realtime-channel.ts`
--   với status callback per regression REALTIME-SUBSCRIBE-NEEDS-STATUS-
--   CALLBACK. Caller: pos-desktop-shell.tsx; refresh khi UPDATE payload
--   có `new.status === 'closed'`.
-- =========================================================================

-- ─── 1. REPLICA IDENTITY FULL ────────────────────────────────────────────
-- Default identity = primary key only → DELETE payload không carry branch_id,
-- UPDATE old-state truncated. FULL emit toàn bộ row → filter
-- `branch_id=eq.{branchId}` work correctly cho mọi event type.
ALTER TABLE public.pos_sessions REPLICA IDENTITY FULL;


-- ─── 2. Add to supabase_realtime publication ─────────────────────────────
DO $pub$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'pos_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pos_sessions;
  END IF;
END
$pub$;
