-- Backstop: a stock balance can never fall below zero. The only writer is the
-- AFTER-INSERT trigger trg_update_stock_on_movement, which applies signed deltas
-- with no lower bound; adjustStock can post an unguarded negative quantity_change.
-- This CHECK aborts the originating stock_movements write (SQLSTATE 23514) when
-- the resulting balance would be negative. Multi-item RPCs already pre-check with
-- strict less-than, so they draw down to exactly 0 and are unaffected.
-- NOT VALID + VALIDATE keeps the validate pass at SHARE UPDATE EXCLUSIVE instead
-- of an ACCESS EXCLUSIVE rewrite.
ALTER TABLE public.stock_levels
  ADD CONSTRAINT stock_levels_current_quantity_nonneg
  CHECK (current_quantity >= 0) NOT VALID;

ALTER TABLE public.stock_levels
  VALIDATE CONSTRAINT stock_levels_current_quantity_nonneg;
