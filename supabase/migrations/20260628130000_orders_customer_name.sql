-- Optional takeaway customer name for pickup identification (eval rank-2 + code-review #11).
--
-- Replaces the stop-gap reuse of orders.note as the takeaway customer name. note
-- is the kitchen/prep field and prints on the kitchen ticket via {{note}}, so a
-- typed name leaked to the kitchen and a prep note showed as the customer name.
-- A dedicated nullable column removes that overload.
--
-- Phase 1 (this file): add the column. Phase 2 (after the owner applies this and
-- runs `pnpm db:types`): wire the POS takeaway create flow + order tile to
-- customer_name and drop the note relabel. Owner applies to PROD manually; not
-- auto-executed.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_name text;

COMMENT ON COLUMN public.orders.customer_name IS
  'Optional takeaway pickup name (free text). Distinct from note (kitchen/prep, prints on ticket). Set at order create for takeaway; shown on the order tile.';
