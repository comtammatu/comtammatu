-- =========================================================================
-- POS Session: per-terminal → per-branch (Owner D7, 2026-04-27)
--
-- Owner decision: 1 branch = 1 active POS session at any time. Cashier opens;
-- waiter / cashier / branch_manager khác cùng branch ride session đó. Multi-
-- terminal model retired — quán Cơm Tấm Má Tư 1 cash drawer = 1 session.
--
-- Why:
--   - Quán nhỏ pilot có 1 cashbox vật lý / branch → per-terminal model
--     silently mis-tagged orders khi 2 terminal cùng mở (variance gộp két
--     không thể split per-terminal).
--   - Stale `session.id` race trên RSC props khi cashier close→reopen liên
--     tục: client tab cũ ôm session cũ, server reject "session not open".
--     Per-branch invariant loại bỏ ambiguity này tại source.
--
-- Changes:
--   1. GUARD: fail-fast nếu phát hiện >1 open session/branch (chưa cleanup)
--   2. DROP unique-per-terminal partial index
--   3. ADD unique-per-branch partial index
--   4. terminal_id → NULLABLE (giữ FK cho audit history)
--   5. FK ON DELETE SET NULL (cho phép retire pos_terminal cũ không khóa
--      history)
--
-- Supersedes regression POS-SESSION-SCOPE-PER-TERMINAL-NOT-PER-USER (2026-04-25)
-- với rule mới POS-SESSION-SCOPE-PER-BRANCH (2026-04-27).
--
-- Reference: 4-agent debate synthesis 2026-04-27, owner sign-off.
-- =========================================================================

-- ─── 1. Guard: fail-fast nếu vi phạm invariant trước migration ──────────
DO $guard$
DECLARE
  v_violations INT;
  v_detail TEXT;
BEGIN
  SELECT COUNT(*), string_agg(branch_id::TEXT, ', ')
    INTO v_violations, v_detail
    FROM (
      SELECT branch_id
        FROM public.pos_sessions
       WHERE status = 'open'
       GROUP BY tenant_id, branch_id
      HAVING COUNT(*) > 1
    ) t;
  IF v_violations > 0 THEN
    RAISE EXCEPTION
      'Migration aborted: % branch(es) currently have >1 open POS session (branches: %). '
      'Manual `close_pos_session` required for stale rows BEFORE re-running this migration. '
      'Auto-close would corrupt cash audit (variance/closing_cash unknown).',
      v_violations, v_detail
      USING ERRCODE = 'P0001';
  END IF;
END
$guard$;


-- ─── 2. Drop unique-per-terminal partial index ──────────────────────────
DROP INDEX IF EXISTS public.idx_pos_sessions_one_open;


-- ─── 3. Add unique-per-branch partial index ─────────────────────────────
CREATE UNIQUE INDEX idx_pos_sessions_one_open_per_branch
  ON public.pos_sessions(branch_id) WHERE status = 'open';

COMMENT ON INDEX public.idx_pos_sessions_one_open_per_branch IS
  'Per-branch single-active invariant (Owner D7, 2026-04-27). Replaces idx_pos_sessions_one_open. '
  'Branch chỉ được có 1 session status=open tại 1 thời điểm. INSERT thứ 2 raise 23505.';


-- ─── 4. terminal_id → NULLABLE ──────────────────────────────────────────
-- Giữ cột cho audit history (admin POS sessions list join lên pos_terminals)
-- nhưng new sessions không bắt buộc liên kết terminal vật lý.
ALTER TABLE public.pos_sessions
  ALTER COLUMN terminal_id DROP NOT NULL;

COMMENT ON COLUMN public.pos_sessions.terminal_id IS
  'OPTIONAL sau D7 (2026-04-27). Trước D7: NOT NULL FK pos_terminals — per-terminal '
  'model. Sau D7: nullable. NULL = ca chung của chi nhánh (không liên kết terminal '
  'vật lý cụ thể). Closed sessions từ trước D7 vẫn giữ terminal_id cho audit.';


-- ─── 5. FK ON DELETE SET NULL ───────────────────────────────────────────
-- Trước D7: ON DELETE RESTRICT — không xoá được terminal nếu có session ref.
-- Sau D7: ON DELETE SET NULL — admin retire terminal cũ không khoá history,
-- terminal_id của session cũ tự thành NULL khi terminal bị xoá.
ALTER TABLE public.pos_sessions
  DROP CONSTRAINT pos_sessions_terminal_id_fkey;

ALTER TABLE public.pos_sessions
  ADD CONSTRAINT pos_sessions_terminal_id_fkey
    FOREIGN KEY (terminal_id) REFERENCES public.pos_terminals(id) ON DELETE SET NULL;
