-- GREENFIELD_ONLY: rehearsal SQL for the greenfield baseline; not part of supabase/migrations.
-- =============================================================
-- P5 (static part): drop 2 public indexes that EXACTLY duplicate a UNIQUE-constraint
-- index (identical columns, order, opclass). The UNIQUE index remains, so no query
-- loses an access path — this is a pure redundancy removal, telemetry-independent.
--
--   idx_kitchen_send_batches_order  ON kitchen_send_batches (tenant_id, order_id, send_seq)
--     == kitchen_send_batches_tenant_id_order_id_send_seq_key (UNIQUE)   [name is misleading]
--
-- NOT included here (require owner sign-off / representative telemetry, see worklog):
--   - 13 dead-RPC candidates (T3; DEFINER/money/auth/order path).
--   - ~231 idx_scan=0 indexes — prod pg_stat is NOT representative (stats_reset=null,
--     77% never-scanned => recent restart). Re-assess after a known >=1 business cycle.
-- Verified on dev sandbox matu-dev.
-- =============================================================

DROP INDEX IF EXISTS public.idx_kitchen_send_batches_order;
