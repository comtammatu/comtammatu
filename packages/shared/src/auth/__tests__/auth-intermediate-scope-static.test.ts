import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

import { STAFF_ROLES, type StaffRole } from "../types";
import { canAccess, type ModuleKey } from "../module-acl";

const repoRoot = resolve(import.meta.dirname, "../../../../..");

const retiredRole = ["ar", "ea_manager"].join("");
const retiredJoinTable = ["ar", "ea_branches"].join("");
const retiredHelper = ["auth_", "ar", "ea_id"].join("");
const retiredProfileColumn = ["profiles", ".", "ar", "ea_id"].join("");
const retiredLabel = ["Quản lý ", "khu vực"].join("");
const retiredLegacyColumn = ["legacy_role", "_code"].join("");

const FORBIDDEN_CONTRACT_TOKENS = [
  retiredRole,
  retiredJoinTable,
  retiredHelper,
  retiredProfileColumn,
  retiredLabel,
  retiredLegacyColumn,
] as const;

const SCAN_ROOTS = [
  "apps/web/app",
  "apps/web/lib",
  "apps/web/proxy.ts",
  "packages/database/src/types/database.types.ts",
  "packages/shared/src/auth",
  "apps/web/tests/fixtures/supabase-e2e/qa-users.sql",
  "supabase/migrations",
  "docs/agent/rules/database.md",
  "docs/modules/auth.md",
  "docs/modules/database.md",
  "docs/ref/glossary.md",
  "docs/ref/inventory.md",
  "tasks/todo.md",
] as const;

const SKIP_PATH_PARTS = [
  "apps/web/.next",
  "apps/web/public/sw.js",
  "supabase/migrations/20260727120000_baseline.sql",
  "supabase/migration-archive",
  // The one-shot dead-role-string cleanup must name the tokens in its strip
  // regexes; it removes them rather than using them in the active contract.
  "supabase/migration-archive/20260613130000_drop_dead_role_strings.sql",
  "supabase/migration-archive/20260630031456_canonicalize_branch_manager_template.sql",
  "packages/shared/src/auth/__tests__/auth-intermediate-scope-static.test.ts",
] as const;

const TEXT_FILE_EXTENSIONS = new Set([
  ".md",
  ".sql",
  ".ts",
  ".tsx",
]);

function shouldSkip(path: string): boolean {
  const normalized = relative(repoRoot, path).replaceAll("\\", "/");
  return SKIP_PATH_PARTS.some((part) => normalized.startsWith(part));
}

function isTextFile(path: string): boolean {
  return [...TEXT_FILE_EXTENSIONS].some((extension) =>
    path.endsWith(extension),
  );
}

function collectFiles(path: string): string[] {
  if (shouldSkip(path)) return [];

  const stats = statSync(path);
  if (stats.isFile()) return isTextFile(path) ? [path] : [];
  if (!stats.isDirectory()) return [];

  return readdirSync(path).flatMap((entry) => collectFiles(resolve(path, entry)));
}

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

test("roles and route ACL do not include retired intermediate scope", () => {
  assert.equal(STAFF_ROLES.includes(retiredRole as StaffRole), false);

  for (const moduleKey of [
    "inventory",
    "staff",
    "settings",
    "employee_checkout_approvals",
  ] satisfies ModuleKey[]) {
    assert.equal(
      canAccess(retiredRole as StaffRole, moduleKey),
      false,
      `${retiredRole} must not access ${moduleKey}`,
    );
  }
});

test("active auth contract has no retired intermediate-scope tokens", () => {
  const files = SCAN_ROOTS.flatMap((root) => collectFiles(resolve(repoRoot, root)));
  const violations: string[] = [];

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const displayPath = relative(repoRoot, file);

    for (const token of FORBIDDEN_CONTRACT_TOKENS) {
      if (content.includes(token)) violations.push(`${displayPath}: ${token}`);
    }
  }

  assert.deepEqual(violations, []);
});

test("auth docs and comments do not use release-version labels for the contract", () => {
  const files = [
    "apps/web/proxy.ts",
    "apps/web/app/_lib/permissions.ts",
    "packages/shared/src/auth/permissions.ts",
    "docs/agent/rules/database.md",
    "docs/modules/auth.md",
    "docs/modules/database.md",
    "docs/ref/glossary.md",
    "docs/ref/inventory.md",
    "tasks/todo.md",
  ];
  const forbiddenPhrases = [
    ["Auth ", "v2"].join(""),
    ["Auth-", "v2"].join(""),
    ["auth ", "v2"].join(""),
    ["contract ", "v2"].join(""),
  ];
  const violations: string[] = [];

  for (const file of files) {
    const content = readRepoFile(file);
    for (const phrase of forbiddenPhrases) {
      if (content.includes(phrase)) violations.push(`${file}: ${phrase}`);
    }
  }

  assert.deepEqual(violations, []);
});

test("proxy branch-surface cache fails closed for inactive or missing branches", () => {
  const proxy = readRepoFile("apps/web/proxy.ts");

  assert.match(proxy, /type BranchSurfaceGate = \{/);
  assert.match(proxy, /const BRANCH_SURFACE_CACHE = new Map/);
  assert.match(proxy, /\.select\("branch_kind, is_active"\)/);
  // branchSurfaceAllows is a positive predicate: a null cache entry or a
  // non-active branch always denies; the kind match is skipped only for a
  // null required kind (owner cross-branch on non-station surfaces, D066).
  assert.match(proxy, /branchSurface !== null &&/);
  assert.match(
    proxy,
    /requiredBranchKind === null \|\|\s*branchSurface\.branchKind === requiredBranchKind/,
  );
  assert.match(proxy, /branchSurface\.isActive === true/);
  assert.match(proxy, /"branch-surface-restricted"/);
  // Stations (POS/KDS/runner) never relax off branch-kind "branch".
  assert.match(proxy, /isStationRoute\s*\?\s*"branch"/);
});

test("remove intermediate scope migration preserves branch helper before dropping retired schema", () => {
  const migration = readRepoFile(
    "supabase/migration-archive/20260609103000_remove_intermediate_scope.sql",
  );
  const helperIndex = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.can_access_branch",
  );
  const dropRetiredHelperIndex = migration.indexOf(
    "quote_ident('auth_' || 'ar' || 'ea_' || 'id')",
  );

  assert.ok(
    migration.includes("area_id = NULL"),
    "retired profiles must clear area_id before the old area trigger can reject role remap",
  );
  assert.ok(helperIndex > 0, "expected can_access_branch to be rewritten");
  assert.ok(
    dropRetiredHelperIndex > helperIndex,
    "can_access_branch must be rewritten before dropping retired area helpers",
  );

  const helperBody = migration.slice(
    helperIndex,
    migration.indexOf("COMMENT ON FUNCTION public.can_access_branch", helperIndex),
  );
  assert.ok(
    !helperBody.includes("auth_area_id") && !helperBody.includes("area_branches"),
    "can_access_branch must not depend on retired area helper/table",
  );
  assert.ok(
    !/quote_ident\('auth_'[\s\S]*\|\| '\(\) CASCADE'/.test(migration),
    "retired auth_area_id helper should not be dropped with CASCADE",
  );
});
