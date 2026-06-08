SET lock_timeout = '5s';
SET statement_timeout = '30min';

DO $$
DECLARE
  index_record record;
BEGIN
  FOR index_record IN
    WITH fk AS (
      SELECT
        c.oid AS con_oid,
        t.oid AS table_oid,
        n.nspname AS schema_name,
        t.relname AS table_name,
        array_agg(a.attname ORDER BY u.ordinality) AS column_names,
        c.conkey AS conkey
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN unnest(c.conkey) WITH ORDINALITY AS u(attnum, ordinality) ON true
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = u.attnum
      WHERE c.contype = 'f'
        AND n.nspname = 'public'
        AND t.relkind IN ('r', 'p')
      GROUP BY c.oid, t.oid, n.nspname, t.relname, c.conkey
    ),
    expected AS (
      SELECT
        fk.*,
        (
          left(
            'idx_' || table_name || '_' || array_to_string(column_names, '_'),
            54
          )
          || '_'
          || substr(md5(schema_name || '.' || table_name || '.' || array_to_string(column_names, ',')), 1, 8)
        ) AS index_name
      FROM fk
    ),
    generated_indexes AS (
      SELECT
        e.*,
        i.indexrelid,
        i.indkey::smallint[] AS indkey
      FROM expected e
      JOIN pg_class idx ON idx.relname = e.index_name
      JOIN pg_namespace idx_ns ON idx_ns.oid = idx.relnamespace
        AND idx_ns.nspname = e.schema_name
      JOIN pg_index i ON i.indexrelid = idx.oid
        AND i.indrelid = e.table_oid
    ),
    covered_by_other AS (
      SELECT DISTINCT g.indexrelid
      FROM generated_indexes g
      JOIN pg_index other_i ON other_i.indrelid = g.table_oid
      WHERE other_i.indexrelid <> g.indexrelid
        AND other_i.indisvalid
        AND other_i.indpred IS NULL
        AND array_length(other_i.indkey::smallint[], 1) >= array_length(g.conkey, 1)
        AND NOT EXISTS (
          SELECT 1
          FROM generate_subscripts(g.conkey, 1) AS s(pos)
          WHERE (other_i.indkey::smallint[])[s.pos - 1] IS DISTINCT FROM g.conkey[s.pos]
        )
    )
    SELECT indexrelid::regclass::text AS index_name
    FROM covered_by_other
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %s', index_record.index_name);
  END LOOP;
END
$$;

DO $$
DECLARE
  fk_record record;
BEGIN
  FOR fk_record IN
    WITH fk AS (
      SELECT
        c.oid AS con_oid,
        t.oid AS table_oid,
        n.nspname AS schema_name,
        t.relname AS table_name,
        array_agg(a.attname ORDER BY u.ordinality) AS column_names,
        c.conkey AS conkey
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN unnest(c.conkey) WITH ORDINALITY AS u(attnum, ordinality) ON true
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = u.attnum
      WHERE c.contype = 'f'
        AND n.nspname = 'public'
        AND t.relkind IN ('r', 'p')
      GROUP BY c.oid, t.oid, n.nspname, t.relname, c.conkey
    ),
    covered AS (
      SELECT fk.con_oid
      FROM fk
      JOIN pg_index i ON i.indrelid = fk.table_oid
      WHERE i.indisvalid
        AND i.indpred IS NULL
        AND array_length(i.indkey::smallint[], 1) >= array_length(fk.conkey, 1)
        AND NOT EXISTS (
          SELECT 1
          FROM generate_subscripts(fk.conkey, 1) AS s(pos)
          WHERE (i.indkey::smallint[])[s.pos - 1] IS DISTINCT FROM fk.conkey[s.pos]
        )
    )
    SELECT
      schema_name,
      table_name,
      column_names,
      left(
        'idx_' || table_name || '_' || array_to_string(column_names, '_'),
        54
      )
        || '_'
        || substr(md5(schema_name || '.' || table_name || '.' || array_to_string(column_names, ',')), 1, 8)
        AS index_name
    FROM fk
    WHERE NOT EXISTS (
      SELECT 1
      FROM covered
      WHERE covered.con_oid = fk.con_oid
    )
    ORDER BY table_name, column_names
  LOOP
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.%I (%s)',
      fk_record.index_name,
      fk_record.schema_name,
      fk_record.table_name,
      (
        SELECT string_agg(format('%I', col), ', ')
        FROM unnest(fk_record.column_names) AS col
      )
    );
  END LOOP;
END
$$;
