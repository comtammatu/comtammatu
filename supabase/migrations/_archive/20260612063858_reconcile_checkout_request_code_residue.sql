BEGIN;

DO $$
DECLARE
  v_true_count bigint;
  v_dependency_count bigint;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'attendance_records'
      AND column_name = 'checkout_requested_code_verified'
  ) THEN
    SELECT count(*)
    INTO v_true_count
    FROM public.attendance_records
    WHERE checkout_requested_code_verified IS TRUE;

    IF v_true_count > 0 THEN
      RAISE EXCEPTION 'checkout_requested_code_verified_has_true_values'
        USING ERRCODE = '23514';
    END IF;

    SELECT count(*)
    INTO v_dependency_count
    FROM pg_depend dep
    JOIN pg_attribute att
      ON att.attrelid = dep.refobjid
     AND att.attnum = dep.refobjsubid
    JOIN pg_class source_table
      ON source_table.oid = att.attrelid
    JOIN pg_namespace source_ns
      ON source_ns.oid = source_table.relnamespace
    WHERE source_ns.nspname = 'public'
      AND source_table.relname = 'attendance_records'
      AND att.attname = 'checkout_requested_code_verified'
      AND dep.deptype <> 'a';

    IF v_dependency_count > 0 THEN
      RAISE EXCEPTION 'checkout_requested_code_verified_has_dependencies'
        USING ERRCODE = '2BP01';
    END IF;

    ALTER TABLE public.attendance_records
      DROP COLUMN checkout_requested_code_verified;
  END IF;
END $$;

COMMIT;
