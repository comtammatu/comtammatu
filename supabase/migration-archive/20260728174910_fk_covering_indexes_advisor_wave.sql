-- Covering indexes for remaining unindexed foreign keys (performance advisor
-- `unindexed_foreign_keys`). Completes the earlier hot-path wave by indexing
-- relational, audit, composite, and tenant-scoped FK columns. Plain CREATE INDEX
-- is safe at Greenfield/pilot scale (tables are small; lock time is negligible).
--
-- Dynamic discovery keeps the migration idempotent on fresh replay and matches
-- whatever FKs still lack a leftmost covering index at apply time.

DO $$
DECLARE
  r record;
  v_created int := 0;
  v_index_name text;
  v_cols text;
BEGIN
  FOR r IN
    WITH fks AS (
      SELECT
        c.conname AS fkey_name,
        rel.relname AS table_name,
        ARRAY(
          SELECT att.attname
          FROM unnest(c.conkey) WITH ORDINALITY AS cols(attnum, ord)
          JOIN pg_attribute att
            ON att.attrelid = c.conrelid
           AND att.attnum = cols.attnum
          ORDER BY cols.ord
        ) AS columns
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      WHERE c.contype = 'f'
        AND n.nspname = 'public'
    ),
    indexed AS (
      SELECT
        i.indrelid,
        ARRAY(
          SELECT att.attname
          FROM unnest(i.indkey) WITH ORDINALITY AS cols(attnum, ord)
          JOIN pg_attribute att
            ON att.attrelid = i.indrelid
           AND att.attnum = cols.attnum
          WHERE cols.attnum > 0
          ORDER BY cols.ord
        ) AS index_columns
      FROM pg_index i
    ),
    missing AS (
      SELECT DISTINCT ON (f.table_name, f.columns)
        f.table_name,
        f.columns,
        left(
          f.table_name || '_' || array_to_string(f.columns, '_') || '_idx',
          63
        ) AS index_name
      FROM fks f
      JOIN pg_class rel ON rel.relname = f.table_name
      JOIN pg_namespace n ON n.oid = rel.relnamespace AND n.nspname = 'public'
      WHERE NOT EXISTS (
        SELECT 1
        FROM indexed ix
        WHERE ix.indrelid = rel.oid
          AND ix.index_columns[1:cardinality(f.columns)] = f.columns
      )
      ORDER BY f.table_name, f.columns, f.fkey_name
    )
    SELECT
      table_name,
      columns,
      CASE
        WHEN row_number() OVER (PARTITION BY index_name ORDER BY table_name, columns) = 1
          THEN index_name
        ELSE left(index_name, 60) || '_' || row_number() OVER (PARTITION BY index_name ORDER BY table_name, columns)::text
      END AS index_name
    FROM missing
    ORDER BY table_name, index_name
  LOOP
    SELECT string_agg(format('%I', col), ', ' ORDER BY ord)
      INTO v_cols
    FROM unnest(r.columns) WITH ORDINALITY AS u(col, ord);

    v_index_name := r.index_name;
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)',
      v_index_name,
      r.table_name,
      v_cols
    );
    v_created := v_created + 1;
  END LOOP;

  IF v_created = 0 THEN
    RAISE NOTICE 'fk covering index wave: nothing to create';
  ELSE
    RAISE NOTICE 'fk covering index wave: created_or_ensured % indexes', v_created;
  END IF;
END $$;
