-- =========================================================================
-- Realtime hardening: REPLICA IDENTITY FULL for tables in supabase_realtime
--
-- WHY: Supabase Realtime uses Postgres logical replication. With the default
-- REPLICA IDENTITY (= primary key), UPDATE events emit only the PK + changed
-- columns in `payload.old`, and DELETE events emit only the PK. Two failure
-- modes follow:
--
--   1. Filter drops on DELETE. POS hooks subscribe with non-PK filters like
--      `branch_id=eq.{branchId}`. With DEFAULT identity, DELETE payloads do
--      NOT carry `branch_id`, so Supabase Realtime cannot match the filter
--      and silently drops the event. Hard-deleted rows would never sync
--      across terminals.
--
--   2. UPDATE old-state truncation. Code that compares `payload.old` vs
--      `payload.new` to detect transitions (e.g. payment_status change)
--      sees only the changed fields in `old`, which can mask the prior
--      state. Setting REPLICA IDENTITY FULL makes `old` carry the full row.
--
-- Trade-off: WAL volume grows ~30% for these tables (full row written for
-- every UPDATE/DELETE). For pilot scale (3-5 terminals/branch, ~200 events
-- per branch per minute) this is negligible. Reassess if WAL pressure
-- becomes visible in monitoring.
--
-- Tables targeted: every table currently in `supabase_realtime` publication
-- (orders, tables, payments, kds_tickets, print_jobs, printer_agents,
-- notifications). Going forward, regression rule:
-- REALTIME-PUB-NEEDS-REPLICA-IDENTITY-FULL — adding a table to the
-- publication MUST set REPLICA IDENTITY FULL in the same migration.
--
-- ALTER TABLE ... REPLICA IDENTITY FULL is idempotent — safe to re-run.
-- =========================================================================

ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.tables REPLICA IDENTITY FULL;
ALTER TABLE public.payments REPLICA IDENTITY FULL;
ALTER TABLE public.kds_tickets REPLICA IDENTITY FULL;
ALTER TABLE public.print_jobs REPLICA IDENTITY FULL;
ALTER TABLE public.printer_agents REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
