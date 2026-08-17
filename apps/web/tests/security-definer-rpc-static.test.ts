import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Forward-migration static guard: a NEW migration that defines a
// SECURITY DEFINER function must either carry an in-function auth boundary or
// revoke the browser roles for it in the same migration. This prevents a new
// definer from shipping callable by anon/authenticated without an authz gate.
// Baseline + migration archive + rollback are intentionally out of scope (historical).
const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const migrationsDir = resolve(repoRoot, "supabase/migrations");

const AUTH_BOUNDARY_TOKENS = [
  "has_permission(",
  "has_permission_any(",
  "auth_tenant_id(",
  "auth.uid()",
  "auth.role()",
  "auth_is_owner(",
  "can_read_inventory_monetary(",
] as const;

const BROWSER_EXECUTE_GRANT =
  /GRANT\s+(?:EXECUTE|ALL)\s+ON\s+FUNCTION\s+(?:public\.)?([a-zA-Z_][\w]*)\s*\([^;]*?\)\s+TO\s+[^;]*\b(?:PUBLIC|anon|authenticated)\b[^;]*;/gi;
const DEFINER_FUNCTION =
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z_][\w]*)\s*\([\s\S]*?\)(?:(?!CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION)[\s\S])*?SECURITY\s+DEFINER[\s\S]*?AS\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\2\s*;/gi;
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function browserGrantPattern(functionName: string): RegExp {
  return new RegExp(
    `GRANT\\s+(?:EXECUTE|ALL)\\s+ON\\s+FUNCTION\\s+(?:public\\.)?${escapeRegExp(functionName)}\\s*\\([^;]*?\\)\\s+TO\\s+[^;]*(?:PUBLIC|anon|authenticated)`,
    "i",
  );
}

function browserRevokePattern(functionName: string, role: string): RegExp {
  return new RegExp(
    `REVOKE\\s+(?:ALL|EXECUTE)\\s+ON\\s+FUNCTION\\s+[^;]*?(?:public\\.)?${escapeRegExp(functionName)}\\s*\\([^;]*?\\)[^;]*?FROM\\s+[^;]*\\b${escapeRegExp(role)}\\b`,
    "i",
  );
}

function lastMatchIndex(source: string, pattern: RegExp): number {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  let last = -1;
  for (const match of source.matchAll(new RegExp(pattern.source, flags))) {
    last = match.index;
  }
  return last;
}

function browserRolesAreFinallyRevoked(
  source: string,
  functionName: string,
): boolean {
  const lastGrant = lastMatchIndex(source, browserGrantPattern(functionName));
  return ["PUBLIC", "anon", "authenticated"].every(
    (role) =>
      lastMatchIndex(source, browserRevokePattern(functionName, role)) >
      lastGrant,
  );
}

function isFinallySecurityInvoker(
  source: string,
  functionName: string,
): boolean {
  const escapedName = escapeRegExp(functionName);
  const lastDefiner = lastMatchIndex(
    source,
    new RegExp(
      `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${escapedName}\\s*\\([\\s\\S]*?SECURITY\\s+DEFINER`,
      "i",
    ),
  );
  const lastInvoker = lastMatchIndex(
    source,
    new RegExp(
      `ALTER\\s+FUNCTION\\s+(?:public\\.)?${escapedName}\\s*\\([^;]*?\\)\\s+SECURITY\\s+INVOKER`,
      "i",
    ),
  );
  return lastInvoker > lastDefiner;
}

function bodyHasDirectAuthBoundary(body: string): boolean {
  return AUTH_BOUNDARY_TOKENS.some((token) => body.includes(token));
}

function delegatesToPrivateAuthorizedFunction(
  body: string,
  allSource: string,
): boolean {
  const delegatedNames = Array.from(
    body.matchAll(/\bRETURN\s+public\.([a-zA-Z_][\w]*)\s*\(/gi),
    (match) => match[1]!,
  );

  return delegatedNames.some((delegatedName) => {
    if (!browserRolesAreFinallyRevoked(allSource, delegatedName)) return false;

    let delegatedBody = "";
    for (const match of allSource.matchAll(DEFINER_FUNCTION)) {
      if (match[1] === delegatedName) delegatedBody = match[3] ?? "";
    }

    if (!delegatedBody) {
      const renamePattern = new RegExp(
        `ALTER\\s+FUNCTION\\s+(?:public\\.)?([a-zA-Z_][\\w]*)\\s*\\([^;]*?\\)\\s+RENAME\\s+TO\\s+${escapeRegExp(delegatedName)}\\s*;`,
        "gi",
      );
      const rename = Array.from(allSource.matchAll(renamePattern)).at(-1);
      if (rename?.index !== undefined) {
        const sourceBeforeRename = allSource.slice(0, rename.index);
        for (const match of sourceBeforeRename.matchAll(DEFINER_FUNCTION)) {
          if (match[1] === rename[1]) delegatedBody = match[3] ?? "";
        }
      }
    }

    return bodyHasDirectAuthBoundary(delegatedBody);
  });
}

function isSecurityDefinerFunction(match: RegExpMatchArray): boolean {
  const headerEnd = match[0].search(/\bAS\s+\$[A-Za-z0-9_]*\$/i);
  return (
    headerEnd >= 0 &&
    /\bSECURITY\s+DEFINER\b/i.test(match[0].slice(0, headerEnd))
  );
}

function stripBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

function forwardMigrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter(
      (name) =>
        name.endsWith(".sql") &&
        /^\d{14}_/.test(name) &&
        !/^\d{14}_baseline\.sql$/.test(name),
    )
    .sort();
}

function readForwardMigrations(): Array<{ name: string; sql: string }> {
  return forwardMigrationFiles().map((name) => ({
    name,
    sql: stripBlockComments(
      readFileSync(resolve(migrationsDir, name), "utf8"),
    ),
  }));
}

test("forward SECURITY DEFINER migrations carry an auth boundary or a browser-role REVOKE", () => {
  const migrations = readForwardMigrations();
  // Sanity: the scan resolves real forward migrations.
  assert.ok(migrations.length > 0, "expected at least one forward migration");

  const violations: string[] = [];
  const allSource = migrations.map(({ sql }) => sql).join("\n");

  for (const [index, migration] of migrations.entries()) {
    const finalSource = migrations
      .slice(index)
      .map(({ sql }) => sql)
      .join("\n");
    for (const match of migration.sql.matchAll(DEFINER_FUNCTION)) {
      if (!isSecurityDefinerFunction(match)) continue;
      const functionName = match[1]!;
      const body = match[3] ?? "";
      const hasAuthBoundary =
        bodyHasDirectAuthBoundary(body) ||
        delegatesToPrivateAuthorizedFunction(body, allSource);
      if (
        !hasAuthBoundary &&
        !isFinallySecurityInvoker(finalSource, functionName) &&
        !browserRolesAreFinallyRevoked(finalSource, functionName)
      ) {
        violations.push(`${migration.name}: ${functionName}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Migrations define a SECURITY DEFINER function without an auth boundary ` +
      `(${AUTH_BOUNDARY_TOKENS.join(", ")}) or a REVOKE from PUBLIC/anon/authenticated:\n` +
      violations.join("\n"),
  );
});

test("browser-executable SECURITY DEFINER RPC grants have an auth boundary or browser-role revoke", () => {
  const migrations = readForwardMigrations();
  assert.ok(migrations.length > 0, "expected at least one forward migration");

  const violations: string[] = [];
  const allSource = migrations.map(({ sql }) => sql).join("\n");
  const definerNames = new Set<string>();

  for (const { sql } of migrations) {
    for (const match of sql.matchAll(DEFINER_FUNCTION)) {
      if (match[1] && isSecurityDefinerFunction(match)) {
        definerNames.add(match[1]);
      }
    }
  }

  for (const [index, migration] of migrations.entries()) {
    const finalSource = migrations
      .slice(index)
      .map(({ sql }) => sql)
      .join("\n");

    for (const match of migration.sql.matchAll(BROWSER_EXECUTE_GRANT)) {
      const functionName = match[1];
      if (!functionName || !definerNames.has(functionName)) continue;
      if (browserRolesAreFinallyRevoked(finalSource, functionName)) continue;
      if (isFinallySecurityInvoker(finalSource, functionName)) continue;

      // Walk files in order so a later CREATE OR REPLACE wins. Do not scan
      // concatenated SQL: an earlier `$$` body can swallow a later file.
      let body = "";
      for (const { sql } of migrations) {
        for (const definerMatch of sql.matchAll(DEFINER_FUNCTION)) {
          if (
            definerMatch[1] === functionName &&
            isSecurityDefinerFunction(definerMatch)
          ) {
            body = definerMatch[3] ?? "";
          }
        }
      }

      const hasAuthBoundary =
        bodyHasDirectAuthBoundary(body) ||
        delegatesToPrivateAuthorizedFunction(body, allSource);

      if (!hasAuthBoundary) {
        violations.push(`${migration.name}: ${functionName}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Browser-executable SECURITY DEFINER RPC grants must define an auth boundary ` +
      `(${AUTH_BOUNDARY_TOKENS.join(", ")}) or revoke PUBLIC/anon/authenticated:\n` +
      violations.join("\n"),
  );
});
