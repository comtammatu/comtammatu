import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Forward-migration static guard: a NEW migration that defines a
// SECURITY DEFINER function must either carry an in-function auth boundary or
// revoke the browser roles for it in the same migration. This prevents a new
// definer from shipping callable by anon/authenticated without an authz gate.
// Baseline + _archive + _rollback are intentionally out of scope (historical).
const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const migrationsDir = resolve(repoRoot, "supabase/migrations");

const AUTH_BOUNDARY_TOKENS = [
  "has_permission(",
  "has_permission_any(",
  "auth_tenant_id(",
  "auth.uid()",
  "auth.role()",
  "auth_is_owner(",
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

// REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC | anon | authenticated
const REVOKE_BROWSER_ROLE = /REVOKE\s[\s\S]*?\bFROM\s+(PUBLIC|anon|authenticated)/i;
const BROWSER_EXECUTE_GRANT =
  /GRANT\s+(?:EXECUTE|ALL)\s+ON\s+FUNCTION\s+(?:public\.)?([a-zA-Z_][\w]*)\s*\([^;]*?\)\s+TO\s+[^;]*\b(?:PUBLIC|anon|authenticated)\b[^;]*;/gi;
const FUNCTION_BODY =
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z_][\w]*)[\s\S]*?\bAS\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\2\s*;/gi;

function forwardMigrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter(
      (name) =>
        name.endsWith(".sql") &&
        /^\d{14}_/.test(name) &&
        !name.startsWith("00000000000000"),
    )
    .sort();
}

test("forward SECURITY DEFINER migrations carry an auth boundary or a browser-role REVOKE", () => {
  const files = forwardMigrationFiles();
  // Sanity: the scan resolves real forward migrations.
  assert.ok(files.length > 0, "expected at least one forward migration");

  const violations: string[] = [];

  for (const name of files) {
    const sql = readFileSync(resolve(migrationsDir, name), "utf8");
    if (!sql.includes("SECURITY DEFINER")) continue;

    const hasAuthBoundary = AUTH_BOUNDARY_TOKENS.some((token) =>
      sql.includes(token),
    );
    const hasRevoke = REVOKE_BROWSER_ROLE.test(sql);

    if (!hasAuthBoundary && !hasRevoke) {
      violations.push(name);
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

  for (const name of files) {
    const sql = readFileSync(resolve(migrationsDir, name), "utf8");
    const functionBodies = new Map<string, string[]>();
    for (const match of sql.matchAll(FUNCTION_BODY)) {
      const functionName = match[1];
      const body = match[3] ?? "";
      functionBodies.set(functionName, [
        ...(functionBodies.get(functionName) ?? []),
        body,
      ]);
    }

    for (const match of sql.matchAll(BROWSER_EXECUTE_GRANT)) {
      const functionName = match[1];
      if (BROAD_GRANT_ALLOWLIST.has(functionName)) continue;

      const bodies = functionBodies.get(functionName) ?? [];
      const hasAuthBoundary = bodies.some((body) =>
        AUTH_BOUNDARY_TOKENS.some((token) => body.includes(token)),
      );

      if (!hasAuthBoundary) {
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
