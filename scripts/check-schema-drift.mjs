#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const DEFAULT_BASELINE = JSON.parse(
  readFileSync("supabase/migration-lineage.json", "utf8"),
).baselineFile;
const DEFAULT_SCHEMAS = ["public", "private"];

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/check-schema-drift.mjs --prod-manifest=<path> [options]
  node scripts/check-schema-drift.mjs --emit-prod-sql [options]
  node scripts/check-schema-drift.mjs --write-baseline-manifest=<path> [options]

Options:
  --baseline=<path>                 Baseline SQL file. Default: ${DEFAULT_BASELINE}
  --schemas=<list>                  Comma-separated schemas. Default: public,private
  --prod-manifest=<path>            Prod manifest JSON from --emit-prod-sql output
  --write-baseline-manifest=<path>  Write parsed baseline manifest JSON
  --emit-prod-sql                   Print a read-only SQL manifest query for prod
  --fail-on-drift                   Exit 1 when drift exists
  --self-test                       Run parser self-checks
  --help                            Show this help
`);
}

function parseArgs(argv) {
  const options = {
    baseline: DEFAULT_BASELINE,
    emitProdSql: false,
    failOnDrift: false,
    help: false,
    prodManifest: null,
    schemas: DEFAULT_SCHEMAS,
    selfTest: false,
    writeBaselineManifest: null,
  };

  for (const arg of argv) {
    if (arg === "--") continue;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--emit-prod-sql") options.emitProdSql = true;
    else if (arg === "--fail-on-drift") options.failOnDrift = true;
    else if (arg === "--self-test") options.selfTest = true;
    else if (arg.startsWith("--baseline=")) {
      options.baseline = arg.slice("--baseline=".length);
    } else if (arg.startsWith("--schemas=")) {
      options.schemas = arg
        .slice("--schemas=".length)
        .split(",")
        .map((schema) => schema.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--prod-manifest=")) {
      options.prodManifest = arg.slice("--prod-manifest=".length);
    } else if (arg.startsWith("--write-baseline-manifest=")) {
      options.writeBaselineManifest = arg.slice(
        "--write-baseline-manifest=".length,
      );
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.schemas.length === 0) {
    throw new Error("--schemas must include at least one schema");
  }

  return options;
}

function stripIdentifier(value) {
  return value.replace(/^"|"$/g, "");
}

function normalizeArgs(args) {
  if (!args.trim()) return "";

  return splitTopLevel(args)
    .map((arg) =>
      arg
        .replace(/\s+DEFAULT\s+[\s\S]*$/i, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .join(", ");
}

function splitTopLevel(value) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];

    if (quote) {
      if (char === quote && next === quote) {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "(" || char === "[") {
      depth += 1;
    } else if (char === ")" || char === "]") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function parseBaseline(sql, schemas) {
  const schemaSet = new Set(schemas);
  const functions = [];
  const tables = [];
  const columns = [];
  const lines = sql.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(
      /^CREATE FUNCTION\s+("?[\w]+"?)\.("?[\w]+"?)\((.*)\)\s+RETURNS\s+/i,
    );
    if (!match) continue;

    const schema = stripIdentifier(match[1]);
    if (!schemaSet.has(schema)) continue;

    functions.push({
      schema,
      name: stripIdentifier(match[2]),
      identity_args: normalizeArgs(match[3]),
    });
  }

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(
      /^CREATE TABLE\s+("?[\w]+"?)\.("?[\w]+"?)\s+\(/i,
    );
    if (!match) continue;

    const schema = stripIdentifier(match[1]);
    if (!schemaSet.has(schema)) continue;

    const table = stripIdentifier(match[2]);
    tables.push({ schema, name: table });

    for (index += 1; index < lines.length; index += 1) {
      const trimmed = lines[index].trim().replace(/,$/, "");
      if (trimmed === ");" || trimmed === ")" || trimmed.startsWith(") "))
        break;
      if (
        !trimmed ||
        trimmed.startsWith("--") ||
        /^(CONSTRAINT|PRIMARY KEY|UNIQUE|CHECK|FOREIGN KEY|EXCLUDE|LIKE|PARTITION)\b/i.test(
          trimmed,
        ) ||
        /^(CASE|WHEN|THEN|ELSE|END)\b/i.test(trimmed)
      ) {
        continue;
      }

      const column = trimmed.match(/^("?[\w]+"?)\s+/)?.[1];
      if (column) {
        columns.push({ schema, table, column: stripIdentifier(column) });
      }
    }
  }

  return { functions, tables, columns };
}

function manifestFromFile(filePath) {
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  const row = Array.isArray(parsed) ? parsed[0] : parsed;
  return row.schema_manifest ?? row;
}

function functionKey(item) {
  return `${item.schema}.${item.name}(${normalizeArgs(item.identity_args ?? "")})`;
}

function tableKey(item) {
  return `${item.schema}.${item.name}`;
}

function columnKey(item) {
  return `${item.schema}.${item.table}.${item.column}`;
}

function diffKeys(left, right, keyFn) {
  const rightKeys = new Set(right.map(keyFn));
  return left
    .map(keyFn)
    .filter((key) => !rightKeys.has(key))
    .sort();
}

function compareManifests(baseline, prod) {
  return {
    counts: {
      baseline: {
        functions: baseline.functions.length,
        tables: baseline.tables.length,
        columns: baseline.columns.length,
      },
      prod: {
        functions: prod.functions.length,
        tables: prod.tables.length,
        columns: prod.columns.length,
      },
    },
    baselineOnly: {
      functions: diffKeys(baseline.functions, prod.functions, functionKey),
      tables: diffKeys(baseline.tables, prod.tables, tableKey),
      columns: diffKeys(baseline.columns, prod.columns, columnKey),
    },
    prodOnly: {
      functions: diffKeys(prod.functions, baseline.functions, functionKey),
      tables: diffKeys(prod.tables, baseline.tables, tableKey),
      columns: diffKeys(prod.columns, baseline.columns, columnKey),
    },
  };
}

function printList(title, values) {
  process.stdout.write(`${title} (${values.length})\n`);
  if (values.length === 0) {
    process.stdout.write("  none\n");
    return;
  }
  for (const value of values) process.stdout.write(`  - ${value}\n`);
}

function printReport(report) {
  process.stdout.write("Schema drift audit\n");
  process.stdout.write(
    `Baseline counts: functions=${report.counts.baseline.functions}, tables=${report.counts.baseline.tables}, columns=${report.counts.baseline.columns}\n`,
  );
  process.stdout.write(
    `Prod counts: functions=${report.counts.prod.functions}, tables=${report.counts.prod.tables}, columns=${report.counts.prod.columns}\n\n`,
  );
  process.stdout.write("A. baseline declares, prod is missing\n");
  printList("  functions", report.baselineOnly.functions);
  printList("  tables", report.baselineOnly.tables);
  printList("  columns", report.baselineOnly.columns);
  process.stdout.write("\nB. prod has, baseline is missing\n");
  printList("  functions", report.prodOnly.functions);
  printList("  tables", report.prodOnly.tables);
  printList("  columns", report.prodOnly.columns);
}

function emitProdSql(schemas) {
  const schemaList = schemas
    .map((schema) => `'${schema.replaceAll("'", "''")}'`)
    .join(", ");
  process.stdout.write(`SELECT jsonb_build_object(
  'functions', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'name', p.proname,
        'identity_args', pg_get_function_identity_arguments(p.oid)
      )
      ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
    )
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN (${schemaList})
  ), '[]'::jsonb),
  'tables', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object('schema', n.nspname, 'name', c.relname)
      ORDER BY n.nspname, c.relname
    )
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN (${schemaList})
      AND c.relkind IN ('r', 'p')
  ), '[]'::jsonb),
  'columns', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'table', c.relname,
        'column', a.attname
      )
      ORDER BY n.nspname, c.relname, a.attnum
    )
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN (${schemaList})
      AND c.relkind IN ('r', 'p')
      AND a.attnum > 0
      AND NOT a.attisdropped
  ), '[]'::jsonb)
) AS schema_manifest;
`);
}

function hasDrift(report) {
  return [
    ...Object.values(report.baselineOnly),
    ...Object.values(report.prodOnly),
  ].some((values) => values.length > 0);
}

function runSelfTest() {
  const fixture = `
CREATE FUNCTION public.foo(p_id bigint, p_note text DEFAULT 'a,b'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$ BEGIN END; $$;

CREATE FUNCTION private.bar() RETURNS text
    LANGUAGE sql
    AS $$ SELECT 'ok'; $$;

CREATE TABLE public.orders (
    id bigint NOT NULL,
    note text DEFAULT 'x,y'::text,
    CONSTRAINT orders_pkey PRIMARY KEY (id)
)
WITH (autovacuum_vacuum_scale_factor='0.05');

CREATE TABLE public.order_items (
    id bigint NOT NULL,
    tier text GENERATED ALWAYS AS (
      CASE
        WHEN id > 10 THEN 'high'::text
        ELSE 'low'::text
      END
    ) STORED
);
`;
  const manifest = parseBaseline(fixture, ["public", "private"]);
  assert.deepEqual(manifest.functions.map(functionKey), [
    "public.foo(p_id bigint, p_note text)",
    "private.bar()",
  ]);
  assert.deepEqual(manifest.tables.map(tableKey), [
    "public.orders",
    "public.order_items",
  ]);
  assert.deepEqual(manifest.columns.map(columnKey), [
    "public.orders.id",
    "public.orders.note",
    "public.order_items.id",
    "public.order_items.tier",
  ]);
  process.stdout.write("schema drift parser self-test passed\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (options.selfTest) {
    runSelfTest();
    return;
  }
  if (options.emitProdSql) {
    emitProdSql(options.schemas);
    return;
  }

  if (!existsSync(options.baseline)) {
    throw new Error(`Baseline file does not exist: ${options.baseline}`);
  }

  const baseline = parseBaseline(
    readFileSync(options.baseline, "utf8"),
    options.schemas,
  );

  if (options.writeBaselineManifest) {
    writeFileSync(
      options.writeBaselineManifest,
      `${JSON.stringify(baseline, null, 2)}\n`,
    );
  }

  if (!options.prodManifest) {
    if (!options.writeBaselineManifest) printHelp();
    return;
  }

  const prod = manifestFromFile(options.prodManifest);
  const report = compareManifests(baseline, prod);
  printReport(report);

  if (options.failOnDrift && hasDrift(report)) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
