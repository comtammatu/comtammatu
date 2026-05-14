-- =============================================================
-- Migration: add uuid column to public.users
-- Purpose:   Go backend issues JWTs with sub = users.uuid so that
--            RPCs expecting p_created_by UUID have a valid value.
--            public.users uses a BIGINT PK (Go-native auth, no
--            dependency on auth.users) — this column bridges the gap.
-- Production apply: manual per CLAUDE.md (file → PR → merge → owner apply)
-- After apply: pnpm db:types
-- =============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS uuid UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_uuid ON public.users(uuid);
