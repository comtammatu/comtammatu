-- Remove the retired position-to-access-bucket bridge column.
-- Auth now derives access buckets from positions.code via private mapper.

DO $$
BEGIN
  EXECUTE 'DROP INDEX IF EXISTS public.'
    || quote_ident('idx_positions_' || 'legacy_role' || '_code');

  EXECUTE 'ALTER TABLE public.positions DROP COLUMN IF EXISTS '
    || quote_ident('legacy_role' || '_code');
END;
$$;
