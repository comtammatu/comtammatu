-- Phase A (identity unification) step A2 — make public.users a complete superset
-- of public.profiles.
--
-- Goal: public.users becomes the single canonical identity table; profiles is
-- later (step A3) reduced to a plain-Postgres VIEW over public.users so the ~91
-- RPCs that SELECT FROM profiles keep working with zero rewrites, while the 29
-- *_by foreign keys repoint to public.users(uuid).
--
-- This migration is purely additive (new nullable columns) — safe, non-breaking,
-- no data change. profiles has three columns public.users lacks: avatar_url,
-- area_id, position_id. Add them so a profiles -> users backfill loses nothing.
--
-- Production apply is MANUAL per CLAUDE.md (file -> PR -> merge -> owner applies).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url  TEXT,
  ADD COLUMN IF NOT EXISTS area_id     BIGINT REFERENCES public.areas(id),
  ADD COLUMN IF NOT EXISTS position_id BIGINT REFERENCES public.positions(id);

CREATE INDEX IF NOT EXISTS idx_users_area_id     ON public.users(area_id);
CREATE INDEX IF NOT EXISTS idx_users_position_id ON public.users(position_id);
