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

const BROAD_GRANT_ALLOWLIST = new Set([
  "generate_order_payment_code",
  // Reads the customer-facing transfer-memo prefix (printed on every VietQR);
  // no auth boundary because callers run SECURITY DEFINER and a direct call only
  // returns public config. Sibling of generate_order_payment_code, which calls it.
  "vietqr_payment_code_prefix",
  "inv_to_base",
  // Non-SECURITY-DEFINER bill line-item aggregator (20260706150000_bill_line_items_merge_notes):
  // runs as the caller, so order_items RLS (tenant_id = auth_tenant_id()) gates every
  // row. Granted to authenticated for the web bill preview; the enqueue_*_bill
  // definers also call it. No in-body boundary needed — RLS is the boundary.
  "bill_line_items",
  // Pure catalog-factor resolver: parses the caller's jsonb and delegates to
  // inv_derive_to_base_factor (itself tenant-scoped from auth_tenant_id());
  // reads no tables and mutates nothing, so a direct browser call only echoes
  // arithmetic. Gated at the calling upsert_ingredient_catalog RPC.
  "inv_catalog_unit_to_base",
]);

const BROWSER_EXECUTE_GRANT =
  /GRANT\s+(?:EXECUTE|ALL)\s+ON\s+FUNCTION\s+(?:public\.)?([a-zA-Z_][\w]*)\s*\([^;]*?\)\s+TO\s+[^;]*\b(?:PUBLIC|anon|authenticated)\b[^;]*;/gi;
const FUNCTION_BODY =
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z_][\w]*)[\s\S]*?\bAS\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\2\s*;/gi;
const DEFINER_FUNCTION =
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z_][\w]*)\s*\([\s\S]*?\)[\s\S]*?SECURITY\s+DEFINER[\s\S]*?AS\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\2\s*;/gi;
const FUNCTION_CALL = /\b(?:public\.)?([a-zA-Z_][\w]*)\s*\(/g;

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
    `REVOKE\\s+(?:ALL|EXECUTE)\\s+ON\\s+FUNCTION\\s+(?:public\\.)?${escapeRegExp(functionName)}\\s*\\([^;]*?\\)\\s+FROM\\s+[^;]*\\b${escapeRegExp(role)}\\b`,
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

test("forward SECURITY DEFINER migrations carry an auth boundary or a browser-role REVOKE", () => {
  const files = forwardMigrationFiles();
  // Sanity: the scan resolves real forward migrations.
  assert.ok(files.length > 0, "expected at least one forward migration");

  const violations: string[] = [];

  const migrations = files.map((name) => ({
    name,
    sql: readFileSync(resolve(migrationsDir, name), "utf8"),
  }));
  const allSource = migrations.map(({ sql }) => sql).join("\n");

  for (const [index, migration] of migrations.entries()) {
    const finalSource = migrations
      .slice(index)
      .map(({ sql }) => sql)
      .join("\n");
    for (const match of migration.sql.matchAll(DEFINER_FUNCTION)) {
      const functionName = match[1]!;
      const body = match[3] ?? "";
      const hasAuthBoundary =
        bodyHasDirectAuthBoundary(body) ||
        delegatesToPrivateAuthorizedFunction(body, allSource);
      if (
        !hasAuthBoundary &&
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

test("browser-executable RPC grants have an auth boundary or an explicit allowlist entry", () => {
  const files = forwardMigrationFiles();
  assert.ok(files.length > 0, "expected at least one forward migration");

  const violations: string[] = [];
  const functionBodies = new Map<string, string[]>();
  const migrations = files.map((name) => ({
    name,
    sql: readFileSync(resolve(migrationsDir, name), "utf8"),
  }));
  const finalSource = migrations.map(({ sql }) => sql).join("\n");

  function bodyHasAuthBoundary(
    functionName: string,
    visited = new Set<string>(),
  ): boolean {
    if (visited.has(functionName)) return false;
    visited.add(functionName);

    for (const body of functionBodies.get(functionName) ?? []) {
      if (AUTH_BOUNDARY_TOKENS.some((token) => body.includes(token))) {
        return true;
      }

      for (const match of body.matchAll(FUNCTION_CALL)) {
        const callee = match[1];
        if (callee && bodyHasAuthBoundary(callee, visited)) return true;
      }
    }

    return false;
  }

  for (const { sql } of migrations) {
    for (const match of sql.matchAll(FUNCTION_BODY)) {
      const functionName = match[1];
      const body = match[3] ?? "";
      if (functionName) {
        functionBodies.set(functionName, [
          ...(functionBodies.get(functionName) ?? []),
          body,
        ]);
      }
    }

  }

  for (const { name, sql } of migrations) {
    for (const match of sql.matchAll(BROWSER_EXECUTE_GRANT)) {
      const functionName = match[1];
      if (!functionName) continue;
      if (BROAD_GRANT_ALLOWLIST.has(functionName)) continue;
      if (browserRolesAreFinallyRevoked(finalSource, functionName)) continue;

      if (!bodyHasAuthBoundary(functionName)) {
        violations.push(`${name}: ${functionName}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Browser-executable RPC grants must define an auth boundary in the same migration ` +
      `or be listed in BROAD_GRANT_ALLOWLIST:\n${violations.join("\n")}`,
  );
});
