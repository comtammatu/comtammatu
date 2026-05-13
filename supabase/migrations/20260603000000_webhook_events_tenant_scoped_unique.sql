-- Cross-tenant request_id collision was a DoS / silent-drop vector:
-- the inline UNIQUE(provider, request_id) on webhook_events let any
-- authenticated attacker (or noisy-neighbour tenant) pre-claim a request_id
-- that another tenant's real provider IPN would later try to use, causing
-- the legitimate event to no-op at ON CONFLICT.
--
-- Replacing with a tenant-scoped UNIQUE closes the hole. MoMo's natural
-- request_id is partner-code-prefixed so real collisions across tenants
-- are vanishingly rare, but the attacker-poisoning path was real.
--
-- Production deployment is manual per CLAUDE.md migration policy:
--   1. Merge the file via PR.
--   2. Owner applies via Supabase dashboard or psql.
--   3. Re-run `pnpm db:types` so generated types catch up.

ALTER TABLE public.webhook_events
  DROP CONSTRAINT IF EXISTS webhook_events_provider_request_id_key;

ALTER TABLE public.webhook_events
  ADD CONSTRAINT webhook_events_tenant_provider_request_id_key
  UNIQUE (tenant_id, provider, request_id);

COMMENT ON CONSTRAINT webhook_events_tenant_provider_request_id_key
  ON public.webhook_events IS
  'Idempotency key for provider IPN replays. Tenant-scoped so a request_id collision in tenant A cannot mask a legitimate event for tenant B.';
