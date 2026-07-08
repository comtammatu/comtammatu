SET search_path TO '';

DROP TRIGGER IF EXISTS trg_broadcast_branch_ops_checkout ON public.attendance_records;
CREATE TRIGGER trg_broadcast_branch_ops_checkout
  AFTER UPDATE OF
    checkout_requested_at,
    checkout_requested_by_role,
    checkout_approval_target_roles,
    checkout_approved_at,
    checkout_approved_by,
    checkout_approval_note,
    check_out
  ON public.attendance_records
  FOR EACH ROW
  WHEN (
    OLD.checkout_requested_at IS DISTINCT FROM NEW.checkout_requested_at
    OR OLD.checkout_requested_by_role IS DISTINCT FROM NEW.checkout_requested_by_role
    OR OLD.checkout_approval_target_roles IS DISTINCT FROM NEW.checkout_approval_target_roles
    OR OLD.checkout_approved_at IS DISTINCT FROM NEW.checkout_approved_at
    OR OLD.checkout_approved_by IS DISTINCT FROM NEW.checkout_approved_by
    OR OLD.checkout_approval_note IS DISTINCT FROM NEW.checkout_approval_note
    OR OLD.check_out IS DISTINCT FROM NEW.check_out
  )
  EXECUTE FUNCTION public.broadcast_branch_ops();

DROP TRIGGER IF EXISTS trg_broadcast_branch_ops_leave_requests ON public.leave_requests;
CREATE TRIGGER trg_broadcast_branch_ops_leave_requests
  AFTER INSERT OR UPDATE OR DELETE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_branch_ops();
