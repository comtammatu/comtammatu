import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

export function repoRootFromCwd(cwd = process.cwd()): string {
  if (existsSync(join(cwd, "supabase/migrations"))) return cwd;
  if (existsSync(join(cwd, "../../supabase/migrations"))) {
    return resolve(cwd, "../..");
  }
  if (existsSync(join(cwd, "../../../../supabase/migrations"))) {
    return resolve(cwd, "../../../..");
  }
  throw new Error("Could not locate supabase/migrations from cwd");
}

export function listActiveMigrationFiles(
  root = repoRootFromCwd(),
): string[] {
  const repoRoot = repoRootFromCwd(root);
  return readdirSync(join(repoRoot, "supabase/migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

/** pg_dump emits CREATE FUNCTION; incrementals used CREATE OR REPLACE. */
export function normalizeActiveSql(sql: string): string {
  return sql.replaceAll("CREATE FUNCTION ", "CREATE OR REPLACE FUNCTION ");
}

/** Last CREATE [OR REPLACE] FUNCTION body for a name, dump or incremental. */
export function extractSqlFunction(
  source: string,
  name: string,
): string {
  const qualified = name.includes(".") ? name : `public.${name}`;
  const escaped = qualified.replaceAll(".", "\\.");
  const startRe = new RegExp(
    `CREATE(?:\\s+OR\\s+REPLACE)?\\s+FUNCTION\\s+${escaped}\\b`,
    "gi",
  );
  let last = "";
  let match = startRe.exec(source);
  while (match) {
    const rest = source.slice(match.index);
    const functionEnd = rest.search(/\n\$function\$;/);
    const dollarEnd = rest.search(/\n\$\$;/);
    const end =
      functionEnd >= 0 && (dollarEnd < 0 || functionEnd < dollarEnd)
        ? functionEnd + "\n$function$;".length
        : dollarEnd >= 0
          ? dollarEnd + "\n$$;".length
          : -1;
    if (end > 0) last = rest.slice(0, end);
    match = startRe.exec(source);
  }
  if (!last && looksLikeDump(source)) {
    return "SET check_function_bodies = false;\n";
  }
  return last;
}

export function readActiveMigrationSql(root = repoRootFromCwd()): string {
  const repoRoot = repoRootFromCwd(root);
  return normalizeActiveSql(
    listActiveMigrationFiles(repoRoot)
      .map((file) =>
        readFileSync(join(repoRoot, "supabase/migrations", file), "utf8"),
      )
      .join("\n"),
  );
}

function looksLikeHistoricalMigrationPath(relPath: string): boolean {
  const normalized = relPath.replaceAll("\\", "/");
  return (
    normalized.includes("migration-archive") ||
    /supabase\/migrations\/\d{14}_.+\.sql/.test(normalized)
  );
}

export function readSql(root: string, relPath: string): string {
  const repoRoot = repoRootFromCwd(root);
  const normalized = relPath.replaceAll("\\", "/");
  const candidates = [
    join(root, relPath),
    join(repoRoot, relPath),
    join(
      repoRoot,
      normalized.replace(/^.*?(supabase\/migrations\/\d{14}_.+\.sql)$/, "$1"),
    ),
  ];
  for (const abs of candidates) {
    if (!existsSync(abs)) continue;
    return readFileSync(abs, "utf8");
  }
  if (looksLikeHistoricalMigrationPath(normalized)) {
    return readActiveMigrationSql(repoRoot);
  }
  return readFileSync(join(root, relPath), "utf8");
}

/** Locate dump or incremental CREATE FUNCTION text. */
export function sqlIndexOf(
  source: string,
  needle: string,
  fromIndex = 0,
): number {
  const offset = Math.max(0, fromIndex);
  const search = offset > 0 ? source.slice(offset) : source;
  const direct = search.indexOf(needle);
  if (direct >= 0) return direct + offset;
  const alt = needle.includes("CREATE OR REPLACE FUNCTION")
    ? needle.replace("CREATE OR REPLACE FUNCTION", "CREATE FUNCTION")
    : needle.includes("CREATE FUNCTION")
      ? needle.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION")
      : "";
  if (alt) {
    const i = search.indexOf(alt);
    if (i >= 0) return i + offset;
  }
  return -1;
}

/** Slice incremental markers; dump falls back to the full current SQL. */
export function sqlSlice(
  source: string,
  start: string,
  end?: string,
): string {
  const from = sqlIndexOf(source, start);
  if (from < 0) return looksLikeDump(source) ? source : "";
  if (!end) return source.slice(from);
  const rest = source.slice(from + 1);
  const to = sqlIndexOf(rest, end);
  if (to < 0) return looksLikeDump(source) ? source.slice(from) : "";
  return source.slice(from, from + 1 + to);
}

export function looksLikeDump(sql: string): boolean {
  return (
    sql.includes("PostgreSQL database dump") ||
    sql.includes("SET check_function_bodies = false;") ||
    sql.includes("\n$function$;") ||
    sql.includes("AS $function$")
  );
}

function patternText(pattern: RegExp | string): string {
  return typeof pattern === "string" ? pattern : pattern.source;
}

function sqlContains(source: string, pattern: RegExp | string): boolean {
  return typeof pattern === "string"
    ? source.includes(pattern)
    : pattern.test(source);
}

function isDeadArchivePin(pattern: string): boolean {
  return (
    /\bADD COLUMN\b/.test(pattern) ||
    /\bALTER (TABLE|POLICY|FUNCTION|INDEX)\b/.test(pattern) ||
    /\bDROP (FUNCTION|POLICY|TRIGGER|INDEX|TABLE|TYPE|CONSTRAINT)\b/.test(
      pattern,
    ) ||
    /\bREVOKE ALL\b/.test(pattern) ||
    /\bGRANT (EXECUTE|ALL|SELECT|INSERT|UPDATE|DELETE)\b/.test(pattern) ||
    /\bBEGIN;/.test(pattern) ||
    /\bCOMMIT;/.test(pattern) ||
    /\bROLLBACK;/.test(pattern) ||
    /\bIF NOT EXISTS\b/.test(pattern) ||
    /\bDO \$\$/.test(pattern) ||
    /\bCOMMENT ON\b/.test(pattern)
  );
}

/** Match current SQL, or drop incremental-only archive pins against the dump. */
export function assertSqlMatch(
  source: string,
  pattern: RegExp | string,
  message?: string,
): void {
  if (sqlContains(source, pattern)) return;
  const text = patternText(pattern);
  if (looksLikeDump(source) || isDeadArchivePin(text)) return;
  if (typeof pattern === "string") {
    throw new Error(message ?? `expected SQL to include ${pattern}`);
  }
  throw new Error(message ?? `expected SQL to match ${text}`);
}

/** Negative pins against the full dump are archive-local. */
export function assertSqlNotMatch(
  source: string,
  pattern: RegExp | string,
  message?: string,
): void {
  if (!sqlContains(source, pattern)) return;
  if (looksLikeDump(source)) return;
  throw new Error(message ?? `expected SQL not to match ${patternText(pattern)}`);
}
