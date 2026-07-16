export function normalizePgDumpSql(source: string): string {
  return source
    .replace(/"([^"]+)"/g, "$1")
    .replace(/\bCREATE OR REPLACE FUNCTION\b/g, "CREATE FUNCTION")
    .replace(/\bCREATE TABLE IF NOT EXISTS\b/g, "CREATE TABLE")
    .replace(/\bCREATE OR REPLACE TRIGGER\b/g, "CREATE TRIGGER");
}
