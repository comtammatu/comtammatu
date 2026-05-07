-- Rollback for 20260601500000_h3b_tenants_owner_user_id.sql
-- WARNING: drops canonical owner identity column. Future ownership
-- transfer RPC depends on this column existing.

DROP INDEX IF EXISTS public.idx_tenants_owner_user_id;

ALTER TABLE public.tenants
  DROP COLUMN IF EXISTS owner_user_id;
