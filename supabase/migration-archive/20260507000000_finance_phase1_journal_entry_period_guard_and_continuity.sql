-- =============================================================
-- M6 Finance Phase 1 — Journal entry period guard + continuity
-- =============================================================
-- Two DB-level triggers harden journal_entries against the two
-- known sequence/integrity holes:
--
-- 1. trg_journal_entries_period_guard — blocks status transition
--    from 'posted' to 'voided' when the entry's posting period
--    is 'closed'. Implements rule PERIOD-CLOSE-GUARD-ALL-MUTATIONS
--    (regression rule 2026-04-28). Today voidJournalEntry can flip
--    a posted entry from a signed BCTC kỳ — this trigger raises
--    23514 instead. App layer surfaces user-friendly Vietnamese
--    message.
--
-- 2. trg_journal_entries_no_delete_posted — blocks DELETE of any
--    entry with status IN ('posted','voided'). Implements rule
--    JE-VOID-REVERSING-ONLY (regression rule 2026-04-28) +
--    Luật Kế toán 2015 Đ24 (sequence-no continuity): every
--    posted entry MUST remain visible in sổ cái forever; void
--    is a header status flag, never a row deletion. Drafts can
--    still be deleted (status='draft' is pre-posting working set).
--
-- Period boundary uses 'Asia/Ho_Chi_Minh' per rule
-- PERIOD-FILTER-USES-LOCAL-TZ — UTC entry_date 23:30 next-day
-- could otherwise classify into the wrong calendar month.
-- =============================================================

-- ─── 1. Period guard trigger ───

CREATE OR REPLACE FUNCTION public.guard_journal_entry_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_status TEXT;
  v_period_year   INT;
  v_period_month  INT;
BEGIN
  -- Only fire when a POSTED entry is being voided. Drafts have no
  -- GL impact yet; their void/delete is a working-set operation.
  -- Allow draft → posted (normal posting), draft → voided (cancel
  -- pre-posting), posted stays posted, etc.
  IF NEW.status = 'voided' AND OLD.status = 'posted' THEN
    -- Use original entry_date, not NEW (entry_date is immutable post-creation
    -- but we lock semantics to OLD for safety).
    v_period_year := EXTRACT(YEAR FROM OLD.entry_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::INT;
    v_period_month := EXTRACT(MONTH FROM OLD.entry_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::INT;

    SELECT fp.status INTO v_period_status
    FROM public.fiscal_periods fp
    WHERE fp.tenant_id = OLD.tenant_id
      AND fp.period_year = v_period_year
      AND fp.period_month = v_period_month
    FOR SHARE;

    IF v_period_status = 'closed' THEN
      RAISE EXCEPTION
        'period_closed_cannot_void: entry % was posted in %-% which is closed; create a reversing entry in the current open period instead',
        OLD.entry_number,
        v_period_year,
        lpad(v_period_month::TEXT, 2, '0')
        USING ERRCODE = '23514';
    END IF;
    -- 'open' or 'closing' → allow (closing permits adjusting entries)
    -- NULL (no period row) → allow (auto_post_journal will create open one)
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_entries_period_guard ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_period_guard
  BEFORE UPDATE OF status ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_journal_entry_period();

COMMENT ON FUNCTION public.guard_journal_entry_period() IS
  'Blocks status transitions to voided when entry posting period is closed. '
  'Rule PERIOD-CLOSE-GUARD-ALL-MUTATIONS. Period boundary in Asia/Ho_Chi_Minh.';

-- ─── 2. No-delete-posted trigger (sequence-no continuity) ───

CREATE OR REPLACE FUNCTION public.guard_journal_entry_no_delete_posted()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('posted', 'voided') THEN
    RAISE EXCEPTION
      'cannot_delete_posted_journal_entry: entry % has status=%; void it (status flag) to preserve sequence continuity per Luật Kế toán Đ24',
      OLD.entry_number,
      OLD.status
      USING ERRCODE = '23514';
  END IF;
  -- status='draft' → allow delete (pre-posting working set)
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_entries_no_delete_posted ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_no_delete_posted
  BEFORE DELETE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_journal_entry_no_delete_posted();

COMMENT ON FUNCTION public.guard_journal_entry_no_delete_posted() IS
  'Blocks DELETE of journal_entries with status posted/voided. Rule '
  'JE-VOID-REVERSING-ONLY + Luật Kế toán 2015 Đ24 sequence continuity.';
