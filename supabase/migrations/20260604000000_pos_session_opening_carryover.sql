-- =============================================================
-- POS open-shift: enforce carry-over from prior session's closing_cash
--
-- Bug discovered 2026-05-09: 70/249 closed-session transitions had
-- opening_cash[N] ≠ closing_cash[N-1] of the same branch. Cashier could
-- type any opening value (or leave default 0), so cash physically carried
-- over between shifts vanished from the books — single biggest gap was
-- 250.000.000đ between session 2 and session 3 (branch 2). Sessions opened
-- with opening_cash=0 contributed +335M VND to total drift across 249 ca,
-- vs -105M for sessions opened with opening_cash>0 — confirming the
-- carry-over gap was the dominant driver of "every shift has variance".
--
-- This migration adds the audit columns. Server Action openPosSession
-- (apps/web) computes the expected opening from prior session's closing
-- and rejects mismatches without an explicit reason.
--
-- Reference: tasks/regressions.md POS-OPEN-SHIFT-CARRY-OVER-ENFORCED.
-- =============================================================

ALTER TABLE public.pos_sessions
  ADD COLUMN IF NOT EXISTS opening_cash_carryover_delta NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS opening_cash_carryover_note  TEXT;

COMMENT ON COLUMN public.pos_sessions.opening_cash_carryover_delta IS
  'Delta giữa opening_cash và closing_cash của ca đóng gần nhất cùng branch. '
  'NULL = khớp hoàn toàn (auto carry-over từ ca trước). Non-zero = cashier '
  'đã override sau khi nhập lý do (xem opening_cash_carryover_note).';

COMMENT ON COLUMN public.pos_sessions.opening_cash_carryover_note IS
  'Lý do override khi opening_cash khác closing_cash ca trước. Bắt buộc '
  'khi opening_cash_carryover_delta khác NULL/0; ghi sổ audit để branch '
  'manager đối chiếu vật lý cuối ngày.';
