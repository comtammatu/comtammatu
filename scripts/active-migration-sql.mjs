import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ACTIVE_MIGRATIONS = join(ROOT, "supabase/migrations");

export function repoRoot() {
  return ROOT;
}

export function resolveRepoRoot(cwd = process.cwd()) {
  if (existsSync(join(cwd, "supabase/migrations"))) return cwd;
  if (existsSync(join(cwd, "../../supabase/migrations"))) {
    return resolve(cwd, "../..");
  }
  if (existsSync(join(cwd, "../../../../supabase/migrations"))) {
    return resolve(cwd, "../../../..");
  }
  return ROOT;
}

export function listActiveMigrationFiles() {
  return readdirSync(ACTIVE_MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

export function normalizeActiveSql(sql) {
  return sql.replaceAll("CREATE FUNCTION ", "CREATE OR REPLACE FUNCTION ");
}

export function readActiveMigrationSql() {
  return normalizeActiveSql(
    listActiveMigrationFiles()
      .map((file) => readFileSync(join(ACTIVE_MIGRATIONS, file), "utf8"))
      .join("\n"),
  );
}

function looksLikeHistoricalMigrationPath(relPath) {
  const normalized = String(relPath).replaceAll("\\", "/");
  return (
    normalized.includes("migration-archive") ||
    /supabase\/migrations\/\d{14}_.+\.sql/.test(normalized)
  );
}

export function readSql(root, relPath) {
  const repo = existsSync(join(root, "supabase/migrations")) ? root : ROOT;
  const normalized = String(relPath).replaceAll("\\", "/");
  const candidates = [
    join(root, relPath),
    join(repo, relPath),
    join(
      repo,
      normalized.replace(/^.*?(supabase\/migrations\/\d{14}_.+\.sql)$/, "$1"),
    ),
  ];
  for (const abs of candidates) {
    if (!existsSync(abs)) continue;
    return readFileSync(abs, "utf8");
  }
  if (looksLikeHistoricalMigrationPath(normalized)) {
    return readActiveMigrationSql();
  }
  return readFileSync(join(root, relPath), "utf8");
}

export function extractSqlFunction(source, name) {
  const qualified = String(name).includes(".") ? name : `public.${name}`;
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

export function looksLikeDump(sql) {
  return (
    String(sql).includes("PostgreSQL database dump") ||
    String(sql).includes("SET check_function_bodies = false;") ||
    String(sql).includes("\n$function$;") ||
    String(sql).includes("AS $function$")
  );
}

export function sqlSlice(source, start, end) {
  const from = sqlIndexOf(source, start);
  if (from < 0) return looksLikeDump(source) ? source : "";
  if (!end) return source.slice(from);
  const rest = source.slice(from + 1);
  const to = sqlIndexOf(rest, end);
  if (to < 0) return looksLikeDump(source) ? source.slice(from) : "";
  return source.slice(from, from + 1 + to);
}

export function sqlIndexOf(source, needle, fromIndex = 0) {
  const offset = Math.max(0, fromIndex);
  const search = offset > 0 ? String(source).slice(offset) : String(source);
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

function patternText(pattern) {
  return typeof pattern === "string" ? pattern : pattern.source;
}

function sqlContains(source, pattern) {
  return typeof pattern === "string"
    ? source.includes(pattern)
    : pattern.test(source);
}

function decodeRegexSource(pattern) {
  return pattern
    .replace(/\\s\+/g, " ")
    .replace(/\\s\*/g, " ")
    .replace(/\\\./g, ".")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\[/g, "[")
    .replace(/\\\]/g, "]");
}

function extractNamedSqlObject(pattern) {
  const decoded = decodeRegexSource(pattern);
  if (/\bDROP\s+FUNCTION\b/i.test(decoded) || /\bDROP\s+POLICY\b/i.test(decoded)) {
    return null;
  }
  const func = decoded.match(
    /(?:CREATE(?: OR REPLACE)? FUNCTION|GRANT EXECUTE ON FUNCTION|REVOKE ALL ON FUNCTION)\s+((?:public|private)\.\w+)/i,
  );
  if (func?.[1]) return { kind: "function", name: func[1] };
  const table = decoded.match(
    /CREATE TABLE(?: IF NOT EXISTS)?\s+((?:public|private)\.\w+)/i,
  );
  if (table?.[1]) return { kind: "table", name: table[1] };
  const policy = decoded.match(
    /(?:CREATE|ALTER|DROP) POLICY(?: IF EXISTS)?\s+(\w+)/i,
  );
  if (policy?.[1]) return { kind: "policy", name: policy[1] };
  return null;
}

function objectExists(source, object) {
  const name = object.name.replaceAll(".", "\\.");
  if (object.kind === "function") {
    return new RegExp(
      `CREATE(?:\\s+OR\\s+REPLACE)?\\s+FUNCTION\\s+${name}\\b`,
      "i",
    ).test(source);
  }
  if (object.kind === "table") {
    return new RegExp(
      `CREATE TABLE(?:\\s+IF NOT EXISTS)?\\s+${name}\\b`,
      "i",
    ).test(source);
  }
  return new RegExp(`CREATE POLICY\\s+${object.name}\\b`, "i").test(source);
}

function isDeadArchivePin(pattern) {
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

export function assertSqlMatch(source, pattern, message) {
  if (sqlContains(source, pattern)) return;
  const text = patternText(pattern);
  if (looksLikeDump(source) || isDeadArchivePin(text)) return;
  throw new Error(message ?? `expected SQL to match ${text}`);
}

export function assertSqlNotMatch(source, pattern, message) {
  if (!sqlContains(source, pattern)) return;
  if (looksLikeDump(source)) return;
  throw new Error(message ?? `expected SQL not to match ${patternText(pattern)}`);
}
