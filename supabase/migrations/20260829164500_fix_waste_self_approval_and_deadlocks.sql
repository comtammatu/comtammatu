-- Migration: fix_waste_self_approval_and_deadlocks
-- Allow Owner and break-glass roles to self-approve waste issues when necessary.
-- Recovery of legacy count-slip waste is intentionally deferred until after
-- the unit-rebase incident repair in 20260829190058.

CREATE OR REPLACE FUNCTION public.approve_waste(
  p_issue_id bigint,
  p_decision text,
  p_note text DEFAULT NULL::text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_issue public.stock_issues%ROWTYPE;
  v_is_owner boolean := false;
  v_can_bypass boolean := false;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'decision must be approved or rejected'
      USING ERRCODE = '22023';
  END IF;

  SELECT issue.*
  INTO v_issue
  FROM public.stock_issues AS issue
  WHERE issue.id = p_issue_id
    AND issue.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_issue.issue_type <> 'writeoff' THEN
    RAISE EXCEPTION 'issue is not a writeoff'
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(
    v_issue.branch_id,
    'inventory:waste_approve'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_issue.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'issue is not pending approval (status=%)',
      v_issue.approval_status
      USING ERRCODE = '22023';
  END IF;

  v_is_owner := coalesce(public.auth_is_owner(v_uid), false);
  v_can_bypass := v_is_owner
    OR public.has_permission(NULL, 'accounting:period_reopen')
    OR public.has_permission(v_issue.branch_id, 'inventory:waste_bypass_self_approval');

  IF v_issue.created_by = v_uid AND NOT v_can_bypass THEN
    RAISE EXCEPTION
      'self-approval forbidden: approver cannot be the creator'
      USING ERRCODE = '42501';
  END IF;

  IF p_decision = 'approved' THEN
    UPDATE public.stock_issues
    SET approval_status = 'approved',
        approved_by = v_uid,
        approved_at = now(),
        notes = coalesce(notes, '')
          || CASE
               WHEN v_issue.created_by = v_uid
                 THEN E'\n[self-approved by '
                   || CASE WHEN v_is_owner THEN 'owner ' ELSE 'manager ' END
                   || v_uid::text
                   || '] '
                   || coalesce(p_note, '')
               WHEN p_note IS NOT NULL
                 THEN E'\n[approved by '
                   || v_uid::text
                   || '] '
                   || p_note
               ELSE ''
             END
    WHERE id = p_issue_id
      AND tenant_id = v_tenant;

    PERFORM public._post_writeoff_movements(p_issue_id);
  ELSE
    UPDATE public.stock_issues
    SET approval_status = 'rejected',
        approved_by = v_uid,
        approved_at = now(),
        status = 'cancelled',
        notes = coalesce(notes, '')
          || CASE
               WHEN p_note IS NOT NULL
                 THEN E'\n[rejected by '
                   || v_uid::text
                   || '] '
                   || p_note
               ELSE ''
             END
    WHERE id = p_issue_id
      AND tenant_id = v_tenant;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_waste(bigint, text, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.approve_waste(bigint, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.approve_waste(bigint, text, text) TO service_role;
