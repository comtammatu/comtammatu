-- Thin self-order signals on the private branch ops bus.
-- POS listens on branch:{id}:ops (authorized via branch_ops_receive /
-- can_read_branch_ops). Do not publish self_order_* tables to
-- supabase_realtime — row/cart payloads stay behind staff SELECT RLS.

DROP TRIGGER IF EXISTS trg_broadcast_branch_ops ON public.self_order_requests;
CREATE TRIGGER trg_broadcast_branch_ops
  AFTER INSERT OR DELETE OR UPDATE ON public.self_order_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_branch_ops();

DROP TRIGGER IF EXISTS trg_broadcast_branch_ops ON public.self_order_payment_requests;
CREATE TRIGGER trg_broadcast_branch_ops
  AFTER INSERT OR DELETE OR UPDATE ON public.self_order_payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_branch_ops();
