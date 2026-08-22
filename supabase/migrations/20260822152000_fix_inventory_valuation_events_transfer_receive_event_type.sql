-- Fix inventory_valuation_events_event_type_check to allow 'transfer_receive' and 'refund_restore'
-- and ensure post_stock_movement_valuation matches the constraint.

-- 1. Extend event_type constraint on inventory_valuation_events
ALTER TABLE public.inventory_valuation_events
  DROP CONSTRAINT IF EXISTS inventory_valuation_events_event_type_check;

ALTER TABLE public.inventory_valuation_events
  ADD CONSTRAINT inventory_valuation_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'opening'::text,
    'receipt'::text,
    'issue'::text,
    'issue_restore'::text,
    'refund_restore'::text,
    'transfer_out'::text,
    'transfer_in'::text,
    'transfer_receive'::text,
    'transfer_loss'::text,
    'production_input'::text,
    'production_output'::text,
    'stocktake_gain'::text,
    'stocktake_loss'::text,
    'supplier_return'::text,
    'invoice_reprice'::text,
    'credit_reprice'::text,
    'rounding'::text,
    'company_wac_equalize'::text,
    'provisional_reprice'::text
  ]));

COMMENT ON CONSTRAINT inventory_valuation_events_event_type_check
  ON public.inventory_valuation_events IS
  'Allowed inventory valuation event types including transfer receive and refund restore.';
