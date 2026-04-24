-- =============================================================
-- S3-a Patch — Self-approval guard for approve_waste
--
-- QA finding during S10-S15 scope review (pre-UI wiring):
-- approve_waste RPC allowed the waste creator to self-approve.
-- QLV/chef could submit then immediately approve own tier-2 waste,
-- bypassing the 4-eye principle required by spec §Q1 tier-2.
--
-- Fix: reject when p_issue.created_by = auth.uid(), unless the
-- approver has `accounting:period_reopen` (admin break-glass).
--
-- Caught during PM/BA/Dev/QA 4-agent debate 2026-04-24.
-- =============================================================

CREATE OR REPLACE FUNCTION public.approve_waste(p_issue_id BIGINT, p_decision TEXT, p_note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_uid UUID := auth.uid(); v_issue RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'decision must be approved or rejected' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_issue FROM public.stock_issues WHERE id = p_issue_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'issue not found' USING ERRCODE = 'P0002'; END IF;
  IF v_issue.issue_type <> 'writeoff' THEN
    RAISE EXCEPTION 'issue is not a writeoff' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(v_issue.branch_id, 'inventory:waste_approve') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_issue.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'issue is not pending approval (status=%)', v_issue.approval_status USING ERRCODE = '22023';
  END IF;

  -- 4-eye principle: creator cannot approve own waste unless admin break-glass.
  IF v_issue.created_by = v_uid
     AND NOT public.has_permission(NULL, 'accounting:period_reopen') THEN
    RAISE EXCEPTION 'self-approval forbidden: approver cannot be the creator'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.stock_issues
     SET approval_status = p_decision,
         approved_by = v_uid,
         approved_at = now(),
         status = CASE WHEN p_decision = 'approved' THEN 'confirmed' ELSE 'cancelled' END,
         notes = COALESCE(notes, '') ||
                 CASE WHEN p_note IS NOT NULL
                      THEN E'\n[' || p_decision || ' by ' || v_uid::TEXT || '] ' || p_note
                      ELSE '' END
   WHERE id = p_issue_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.approve_waste(BIGINT, TEXT, TEXT) TO authenticated;
