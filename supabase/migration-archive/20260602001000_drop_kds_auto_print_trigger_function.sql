-- ============================================================================
-- POS/KDS: remove retired KDS-ticket auto-print trigger function
--
-- 20260602000000 moves kitchen paper ownership to KDS completion and drops the
-- trigger. The trigger function is no longer part of the runtime contract.
-- ============================================================================

DROP FUNCTION IF EXISTS public.auto_enqueue_kitchen_print_from_ticket();
