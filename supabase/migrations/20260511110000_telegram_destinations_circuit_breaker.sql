-- =========================================================================
-- feedback module — Slice 3F: circuit breaker column on telegram_destinations
-- =========================================================================

ALTER TABLE public.telegram_destinations
  ADD COLUMN IF NOT EXISTS consecutive_failures SMALLINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.telegram_destinations.consecutive_failures IS
  'Count of consecutive send failures. When >= 10, destination is auto-deactivated.';
