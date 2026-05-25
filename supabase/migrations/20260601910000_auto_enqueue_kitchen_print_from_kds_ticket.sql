-- =========================================================================
-- POS/KDS: guarantee kitchen print enqueue when a KDS batch is created
--
-- Several POS paths create order_items + kds_tickets inside DB RPCs, while
-- paper printing historically depended on a follow-up web Server Action call
-- to enqueue_kitchen_print(...). If that follow-up is skipped by an older
-- deployed client, a retry/idempotent path, or another caller, KDS screens
-- show the work but no print_jobs row exists for the branch print agent.
--
-- This deferred trigger makes the DB queue invariant explicit:
-- kds_tickets with a kitchen_send_batch_id must best-effort enqueue the
-- corresponding kitchen print job before the transaction commits.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.auto_enqueue_kitchen_print_from_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.kitchen_send_batch_id IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    PERFORM public.enqueue_kitchen_print(NEW.order_id);
  EXCEPTION
    WHEN OTHERS THEN
      -- Printing is operationally fail-soft: creating the order/KDS ticket
      -- must not roll back because a printer is unconfigured, unreachable, or
      -- the actor lacks the print permission. The web action still calls
      -- enqueue_kitchen_print and can surface the operator warning; callers
      -- that bypass the web action leave unsent items visible for recovery.
      RAISE LOG 'auto_enqueue_kitchen_print_from_ticket skipped order_id=%, ticket_id=%, sqlstate=%, error=%',
        NEW.order_id,
        NEW.id,
        SQLSTATE,
        SQLERRM;
      RETURN NULL;
  END;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_enqueue_kitchen_print_from_ticket
  ON public.kds_tickets;

CREATE CONSTRAINT TRIGGER trg_auto_enqueue_kitchen_print_from_ticket
AFTER INSERT OR UPDATE OF kitchen_send_batch_id
ON public.kds_tickets
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.auto_enqueue_kitchen_print_from_ticket();

REVOKE ALL ON FUNCTION public.auto_enqueue_kitchen_print_from_ticket()
  FROM PUBLIC;
