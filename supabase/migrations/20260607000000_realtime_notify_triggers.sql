-- realtime_notify_triggers.sql
-- Phase C: Go-native realtime — Postgres LISTEN/NOTIFY triggers.
-- Production apply is MANUAL per CLAUDE.md: file → PR → merge → owner apply.
--
-- Creates a generic trigger function that fires pg_notify('realtime_events', ...)
-- on AFTER INSERT/UPDATE/DELETE for the 11 realtime tables. Payload is ids + scope
-- only (no row bodies) to stay well under Postgres's 8 KB NOTIFY limit.
-- The Go LISTEN loop in backend/internal/realtime/listener.go consumes these.

-- ---------------------------------------------------------------------------
-- Trigger function
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.realtime_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _row   record;
  _id    bigint;
  _branch_id bigint;
  _payload text;
BEGIN
  -- Prefer NEW for INSERT/UPDATE, fall back to OLD for DELETE.
  IF TG_OP = 'DELETE' THEN
    _row := OLD;
  ELSE
    _row := NEW;
  END IF;

  -- id: use the row's id column if it exists; printer_agents uses branch_id as PK.
  BEGIN
    _id := (_row).id;
  EXCEPTION WHEN undefined_column THEN
    -- Tables without an "id" column (e.g. printer_agents whose PK is branch_id).
    _id := (_row).branch_id;
  END;

  -- branch_id: present on most tables, absent on notifications / order_status_history.
  BEGIN
    _branch_id := (_row).branch_id;
  EXCEPTION WHEN undefined_column THEN
    _branch_id := NULL;
  END;

  IF _branch_id IS NOT NULL THEN
    _payload := json_build_object(
      'table',     TG_TABLE_NAME,
      'op',        TG_OP,
      'tenant_id', (_row).tenant_id,
      'branch_id', _branch_id,
      'id',        _id
    )::text;
  ELSE
    _payload := json_build_object(
      'table',     TG_TABLE_NAME,
      'op',        TG_OP,
      'tenant_id', (_row).tenant_id,
      'id',        _id
    )::text;
  END IF;

  PERFORM pg_notify('realtime_events', _payload);
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- Drop old triggers if re-running (idempotent)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS realtime_notify ON public.kds_tickets;
DROP TRIGGER IF EXISTS realtime_notify ON public.kitchen_send_batches;
DROP TRIGGER IF EXISTS realtime_notify ON public.branch_menu_item_daily_limits;
DROP TRIGGER IF EXISTS realtime_notify ON public.pos_sessions;
DROP TRIGGER IF EXISTS realtime_notify ON public.orders;
DROP TRIGGER IF EXISTS realtime_notify ON public.tables;
DROP TRIGGER IF EXISTS realtime_notify ON public.payments;
DROP TRIGGER IF EXISTS realtime_notify ON public.printer_agents;
DROP TRIGGER IF EXISTS realtime_notify ON public.notifications;
DROP TRIGGER IF EXISTS realtime_notify ON public.print_jobs;
DROP TRIGGER IF EXISTS realtime_notify ON public.order_status_history;

-- ---------------------------------------------------------------------------
-- Triggers — one per realtime table
-- ---------------------------------------------------------------------------

-- kds_tickets (has branch_id)
CREATE TRIGGER realtime_notify
AFTER INSERT OR UPDATE OR DELETE ON public.kds_tickets
FOR EACH ROW EXECUTE FUNCTION public.realtime_notify();

-- kitchen_send_batches (has branch_id)
CREATE TRIGGER realtime_notify
AFTER INSERT OR UPDATE OR DELETE ON public.kitchen_send_batches
FOR EACH ROW EXECUTE FUNCTION public.realtime_notify();

-- branch_menu_item_daily_limits (has branch_id)
CREATE TRIGGER realtime_notify
AFTER INSERT OR UPDATE OR DELETE ON public.branch_menu_item_daily_limits
FOR EACH ROW EXECUTE FUNCTION public.realtime_notify();

-- pos_sessions (has branch_id)
CREATE TRIGGER realtime_notify
AFTER INSERT OR UPDATE OR DELETE ON public.pos_sessions
FOR EACH ROW EXECUTE FUNCTION public.realtime_notify();

-- orders (has branch_id)
CREATE TRIGGER realtime_notify
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.realtime_notify();

-- tables (has branch_id)
CREATE TRIGGER realtime_notify
AFTER INSERT OR UPDATE OR DELETE ON public.tables
FOR EACH ROW EXECUTE FUNCTION public.realtime_notify();

-- payments (has branch_id)
CREATE TRIGGER realtime_notify
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.realtime_notify();

-- printer_agents (has branch_id; PK = branch_id, no id column — id falls back to branch_id)
CREATE TRIGGER realtime_notify
AFTER INSERT OR UPDATE OR DELETE ON public.printer_agents
FOR EACH ROW EXECUTE FUNCTION public.realtime_notify();

-- notifications (NO branch_id — tenant-wide event)
CREATE TRIGGER realtime_notify
AFTER INSERT OR UPDATE OR DELETE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.realtime_notify();

-- print_jobs (has branch_id)
CREATE TRIGGER realtime_notify
AFTER INSERT OR UPDATE OR DELETE ON public.print_jobs
FOR EACH ROW EXECUTE FUNCTION public.realtime_notify();

-- order_status_history (NO branch_id — tenant-wide; FE looks up the parent order)
CREATE TRIGGER realtime_notify
AFTER INSERT OR UPDATE OR DELETE ON public.order_status_history
FOR EACH ROW EXECUTE FUNCTION public.realtime_notify();
