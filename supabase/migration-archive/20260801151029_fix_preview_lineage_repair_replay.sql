-- Branch replay splits source payloads into multiple ledger statements.
-- Keep the already-restored payloads and make their follow-up verifier shape-agnostic.

DO $align_repair$
DECLARE
  verifier_sql text := $verifier_sql$DO $preview_lineage_payloads_present$
BEGIN
  IF (
    SELECT count(*)
    FROM supabase_migrations.schema_migrations
    WHERE version = ANY (ARRAY[
      '20260729010000',
      '20260729120000',
      '20260729120100',
      '20260729120200',
      '20260729120300',
      '20260729120400',
      '20260729140200',
      '20260729140300',
      '20260729140400',
      '20260729140600'
    ]::text[])
      AND cardinality(statements) > 0
  ) <> 10 THEN
    RAISE EXCEPTION 'preview_migration_lineage_payload_missing';
  END IF;
END
$preview_lineage_payloads_present$;$verifier_sql$;
BEGIN
  UPDATE supabase_migrations.schema_migrations
  SET statements = ARRAY[verifier_sql]::text[]
  WHERE version = '20260801150433'
    AND name = 'repair_preview_migration_lineage'
    AND cardinality(statements) = 1
    AND md5(statements[1]) = 'a92ab65e2ad7d6784f1f44cd143e7bcf';

  IF NOT EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '20260801150433'
      AND name = 'repair_preview_migration_lineage'
      AND cardinality(statements) > 0
      AND position(
        'preview_lineage_payloads_present'
        IN array_to_string(statements, E'\n')
      ) > 0
  ) THEN
    RAISE EXCEPTION 'preview_lineage_repair_payload_mismatch';
  END IF;
END
$align_repair$;
