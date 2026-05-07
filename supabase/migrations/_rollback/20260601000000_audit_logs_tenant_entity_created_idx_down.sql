DROP INDEX IF EXISTS public.idx_audit_logs_tenant_entity_created;

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant
  ON public.audit_logs (tenant_id);
