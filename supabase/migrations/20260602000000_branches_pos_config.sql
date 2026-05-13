-- US-407 — per-branch POS session config (shift start time + cash float default).
--
-- Production deployment is manual per CLAUDE.md migration policy:
--   1. Merge the file via PR.
--   2. Owner applies it through the Supabase dashboard or psql against prod.
--   3. Re-run `pnpm db:types` so the generated types catch up.
--
-- Defaults match the legacy Vietnamese restaurant defaults: open at 07:00 local
-- and start the till empty (cashier sets cash float at session-open time).

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS pos_config JSONB NOT NULL
  DEFAULT '{"shift_start_time": "07:00", "cash_float_default": "0.00"}'::jsonb;

COMMENT ON COLUMN public.branches.pos_config IS
  'Per-branch POS session configuration. Shape: { shift_start_time: HH:MM (24h), cash_float_default: numeric string }. Managed via PUT /admin/settings/branches/{id}/pos-config.';
