-- =============================================================
-- SUPERSEDED — no-op since 2026-05-01.
--
-- Original v1 redefined split_order with the legacy BIGINT[] signature,
-- which would conflict with the JSONB partial-quantity overload already
-- live on remote (introduced out-of-order by 20260428021437).
--
-- The schema + RPC changes intended here are now delivered in:
--   20260513000000_pos_kitchen_ticket_sequence_v2.sql
--
-- This file remains as a no-op so that any environment which has already
-- recorded version 20260430190023 in supabase_migrations.schema_migrations
-- stays consistent (CLI will not retry, and removing the file would create
-- drift). Apply order on a fresh environment is unchanged.
-- =============================================================

DO $$ BEGIN NULL; END $$;
