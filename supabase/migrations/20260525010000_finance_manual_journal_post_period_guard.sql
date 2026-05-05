-- =============================================================
-- M6 Finance — manual journal post period guard
-- =============================================================
-- Manual journal entries are created as drafts, then posted by updating
-- journal_entries.status. That path bypasses auto_post_journal(), so the
-- period-close invariant must also live in the journal_entries status
-- trigger. This extends guard_journal_entry_period() to block draft→posted
-- when the entry_date's fiscal period is closed.

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
  IF NEW.status = 'posted' AND OLD.status = 'draft' THEN
    v_period_year := EXTRACT(YEAR FROM NEW.entry_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::INT;
    v_period_month := EXTRACT(MONTH FROM NEW.entry_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::INT;

    SELECT fp.status INTO v_period_status
    FROM public.fiscal_periods fp
    WHERE fp.tenant_id = NEW.tenant_id
      AND fp.period_year = v_period_year
      AND fp.period_month = v_period_month
    FOR SHARE;

    IF v_period_status = 'closed' THEN
      RAISE EXCEPTION
        'fiscal_period_closed_cannot_post: %-% is closed, cannot post journal entry %',
        v_period_year,
        lpad(v_period_month::TEXT, 2, '0'),
        NEW.entry_number
        USING ERRCODE = '23514';
    END IF;

    IF v_period_status IS NULL THEN
      INSERT INTO public.fiscal_periods (tenant_id, period_month, period_year, status)
      VALUES (NEW.tenant_id, v_period_month, v_period_year, 'open')
      ON CONFLICT (period_month, period_year, tenant_id) DO NOTHING;
    END IF;
  END IF;

  -- Only fire when a POSTED entry is being voided. Drafts have no
  -- GL impact yet; their void/delete is a working-set operation.
  IF NEW.status = 'voided' AND OLD.status = 'posted' THEN
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
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_journal_entry_period() IS
  'Blocks posting/voiding journal entries when the relevant fiscal period is closed. '
  'Period boundary uses Asia/Ho_Chi_Minh.';
