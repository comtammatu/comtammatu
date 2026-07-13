-- Stock-level changes must refresh sale availability surfaces that read
-- compute_menu_item_stock_capacity(...). Keep stock_movements out of the ops
-- bus to avoid sale-line noise; publish only the resulting on-hand row change.

SET search_path TO '';

DROP TRIGGER IF EXISTS trg_broadcast_branch_ops ON public.stock_levels;
CREATE TRIGGER trg_broadcast_branch_ops
  AFTER INSERT OR UPDATE OR DELETE ON public.stock_levels
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_branch_ops();
