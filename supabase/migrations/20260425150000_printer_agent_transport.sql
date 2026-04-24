-- printer_agents.transport — capability flag reported by agent heartbeat.
-- 'all' = LAN + USB dispatch; 'lan' = LAN-only build (e.g. Termux, Raspberry Pi).
-- Surfaced in printer_agent_status view; enqueue-side routing is future work.

ALTER TABLE public.printer_agents
  ADD COLUMN transport TEXT NOT NULL DEFAULT 'all'
    CHECK (transport IN ('lan', 'all'));

DROP VIEW IF EXISTS public.printer_agent_status;

CREATE VIEW public.printer_agent_status AS
SELECT
  branch_id,
  tenant_id,
  agent_id,
  version,
  transport,
  last_seen_at,
  (last_seen_at > now() - INTERVAL '60 seconds') AS is_online
FROM public.printer_agents;

GRANT SELECT ON public.printer_agent_status TO authenticated;
