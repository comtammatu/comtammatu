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

// REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC | anon | authenticated
const REVOKE_BROWSER_ROLE = /REVOKE\s[\s\S]*?\bFROM\s+(PUBLIC|anon|authenticated)/i;

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
