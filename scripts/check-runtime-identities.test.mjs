import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyzeRuntimeIdentitySource,
  analyzeTextRuntimeIdentitySource,
  formatRuntimeIdentityViolation,
  scanRuntimeIdentities,
} from "./check-runtime-identities.mjs";

test("detects numeric identity defaults, assignments, query filters, and routes", () => {
  const source = `
    const branchId = settings.branchId || 1;
    const CENTRAL_BRANCH_ID = 2;
    const payload = { tenant_id: "3" };
    settings.siteId = 4;
    client.eq("branch_id", 5);
    const href = "/br/6/pos";
    const schema = z.object({ site_id: z.number().default(7) });
    const BRANCH_ID_BY_NAME = { "Named branch": 8 };
    const TENANT_ID_MAP = new Map([["Primary", 9]]);
  `;

  const violations = analyzeRuntimeIdentitySource(source);
  assert.deepEqual(
    violations.map((violation) => violation.literal),
    ["1", "2", '"3"', "4", "5", "6", "7", "8", "9"],
  );
});

test("allows identities resolved from trusted runtime values", () => {
  const source = `
    const branchId = Number(input.branchId);
    const tenantId = claims.tenant_id;
    const payload = { branch_id: branchId };
    client.eq("branch_id", branchId);
    const href = \`/br/\${branchId}/pos\`;
    const sentinel = { tenant_id: 0, branch_id: null };
    client.eq("branch_id", claims.branch_id ?? -1);
  `;

  assert.deepEqual(analyzeRuntimeIdentitySource(source), []);
});

test("rejects identity inferred from the first matching database row", () => {
  const source = `
    const result = await client
      .from("branches")
      .select("id")
      .limit(1)
      .maybeSingle();
  `;

  assert.deepEqual(
    analyzeRuntimeIdentitySource(source).map((violation) => violation.literal),
    ["first row"],
  );
});

test("detects hardcoded identities in Kotlin, config, and operational examples", () => {
  const source = `
    const val DEFAULT_BRANCH_ID = 1
    val branchId = input.toIntOrNull() ?: 3
    val savedTenant = prefs.getInt("tenant_id", 7)
    AGENT_BRANCH_ID=9
    command --tenant-id 11 --branch-id=13
    setup.ps1 -TenantId 17 -BranchId 19
    Open /br/23/pos
  `;

  assert.deepEqual(
    analyzeTextRuntimeIdentitySource(source).map((violation) => violation.literal),
    ["1", "3", "7", "9", "11", "13", "17", "19", "23"],
  );
});

test("detects hardcoded identities in active SQL migrations", () => {
  const source = `
    UPDATE branches SET tenant_id = 29 WHERE branch_id = 31;
    site_id bigint DEFAULT 37
  `;

  assert.deepEqual(
    analyzeRuntimeIdentitySource(source, "migration.sql").map(
      (violation) => violation.literal,
    ),
    ["29", "31", "37"],
  );
});

test("active runtime contains no hardcoded operational identities", () => {
  const violations = scanRuntimeIdentities();
  assert.deepEqual(
    violations.map(formatRuntimeIdentityViolation),
    [],
    "runtime identities must be data-derived and must not use numeric fallbacks",
  );
});
