import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  centralSiteBranchKindForRole,
  type JwtClaims,
} from "@comtammatu/shared/auth";
import { resolveCentralSiteHomeBranchId } from "../app/_lib/branch-hub-device";

const repoRoot = resolve(process.cwd(), "../..");
const proxySource = readFileSync(resolve(repoRoot, "apps/web/proxy.ts"), "utf8");
const hrStaffActionsSource = readFileSync(
  resolve(repoRoot, "apps/web/app/(protected)/hr/staff/actions.ts"),
  "utf8",
);
const hrActionsSource = readFileSync(
  resolve(repoRoot, "apps/web/app/(protected)/hr/actions.ts"),
  "utf8",
);
const centralSiteClaimsMigration = readFileSync(
  resolve(
    repoRoot,
    "supabase/migrations/20260702123000_wf10_central_site_roles_tenant_claims.sql",
  ),
  "utf8",
);
const seedSource = readFileSync(resolve(repoRoot, "supabase/seed.sql"), "utf8");

function claims(
  role: JwtClaims["user_role"],
  branchId: number | null,
  tenantId: number,
): JwtClaims {
  return {
    tenant_id: tenantId,
    branch_id: branchId,
    user_role: role,
  };
}

test("central-site role maps to exactly its own branch_kind domain", () => {
  // Allow: matching role + kind pairs (D055 §1 mapping).
  assert.equal(
    centralSiteBranchKindForRole("warehouse_manager"),
    "central_supply",
  );
  assert.equal(
    centralSiteBranchKindForRole("production_manager"),
    "central_kitchen",
  );
  // Deny: every other role has no central-site domain, so the proxy keeps
  // the claims-match rule (cashier can never enter a central site).
  for (const role of [
    "owner",
    "branch_manager",
    "cashier",
    "chef",
    "office",
  ] as const) {
    assert.equal(centralSiteBranchKindForRole(role), null, role);
  }
});

test("proxy soft-routes central-site roles only when claims are tenant-level", () => {
  assert.match(
    proxySource,
    /claims\.branch_id === null\s*\?\s*centralSiteBranchKindForRole\(claims\.user_role\)\s*:\s*null/,
  );
});

test("proxy denies branch-scope mismatch unless the central kind matches an active site", () => {
  // Roles without a central domain (e.g. cashier) keep the hard deny.
  assert.match(
    proxySource,
    /if \(centralSiteKind === null\) \{\s*return redirectToAccessDenied\(\s*request,\s*response,\s*"branch-scope-mismatch",\s*\);/,
  );
  // Central-site roles are denied when the target branch does not match
  // their kind (warehouse_manager into a central_kitchen site) or is inactive.
  assert.match(
    proxySource,
    /if \(!branchSurfaceAllows\(branchSurface, centralSiteKind\)\) \{\s*return redirectToAccessDenied\(\s*request,\s*response,\s*"branch-scope-mismatch",\s*\);/,
  );
  assert.match(
    proxySource,
    /branchSurface\.branchKind === requiredBranchKind &&\s*branchSurface\.isActive === true/,
  );
});

test("proxy keeps stations on branch-kind branch; central kind covers non-station stock only", () => {
  assert.match(
    proxySource,
    /const requiredBranchKind = isStationRoute\s*\?\s*"branch"\s*:\s*\(centralSiteKind \?\? "branch"\)/,
  );
});

type BranchRow = { id: number };

function fakeBranchClient(
  result: { data: BranchRow | null; error: unknown },
  log: { fromCalls: number; filters: Record<string, unknown> },
) {
  const chain = {
    eq(column: string, value: unknown) {
      log.filters[column] = value;
      return chain;
    },
    order(column: string, options: { ascending: boolean }) {
      assert.equal(column, "id");
      assert.equal(options.ascending, true);
      return chain;
    },
    limit(count: number) {
      assert.equal(count, 1);
      return chain;
    },
    async maybeSingle() {
      return result;
    },
  };

  return {
    from(table: string) {
      log.fromCalls += 1;
      assert.equal(table, "branches");
      return {
        select(columns: string) {
          assert.equal(columns, "id");
          return chain;
        },
      };
    },
  };
}

test("resolveCentralSiteHomeBranchId queries the first active site of the role's kind and caches it", async () => {
  const log = { fromCalls: 0, filters: {} as Record<string, unknown> };
  const client = fakeBranchClient({ data: { id: 20 }, error: null }, log);

  assert.equal(
    await resolveCentralSiteHomeBranchId(
      client,
      claims("warehouse_manager", null, 101),
    ),
    20,
  );
  assert.deepEqual(log.filters, {
    tenant_id: 101,
    branch_kind: "central_supply",
    is_active: true,
  });

  // Second lookup for the same tenant+kind is served from the warm cache.
  assert.equal(
    await resolveCentralSiteHomeBranchId(
      client,
      claims("warehouse_manager", null, 101),
    ),
    20,
  );
  assert.equal(log.fromCalls, 1);
});

test("resolveCentralSiteHomeBranchId returns null without querying for non-central or pinned claims", async () => {
  const neverQueried = {
    from() {
      throw new Error("must not query branches for this role");
    },
  };

  assert.equal(
    await resolveCentralSiteHomeBranchId(
      neverQueried,
      claims("cashier", 3, 102),
    ),
    null,
  );
  assert.equal(
    await resolveCentralSiteHomeBranchId(
      neverQueried,
      claims("office", null, 102),
    ),
    null,
  );
  assert.equal(
    await resolveCentralSiteHomeBranchId(
      neverQueried,
      claims("warehouse_manager", 3, 102),
    ),
    null,
  );
});

test("resolveCentralSiteHomeBranchId does not cache a failed lookup", async () => {
  const errorLog = { fromCalls: 0, filters: {} as Record<string, unknown> };
  const errorClient = fakeBranchClient(
    { data: null, error: new Error("boom") },
    errorLog,
  );
  assert.equal(
    await resolveCentralSiteHomeBranchId(
      errorClient,
      claims("production_manager", null, 103),
    ),
    null,
  );

  const okLog = { fromCalls: 0, filters: {} as Record<string, unknown> };
  const okClient = fakeBranchClient({ data: { id: 10 }, error: null }, okLog);
  assert.equal(
    await resolveCentralSiteHomeBranchId(
      okClient,
      claims("production_manager", null, 103),
    ),
    10,
  );
  assert.equal(okLog.fromCalls, 1);
});

test("central-site auth SQL keeps warehouse/production branch claims tenant-level", () => {
  assert.match(
    centralSiteClaimsMigration,
    /v_final_role IN \('warehouse_manager', 'production_manager'\)[\s\S]*?v_final_branch := NULL;/,
  );
  assert.match(
    centralSiteClaimsMigration,
    /v_access_bucket IN \('warehouse_manager', 'production_manager'\)[\s\S]*?v_branch_id := NULL;/,
  );

  const branchRequiredFunction =
    centralSiteClaimsMigration.match(
      /CREATE OR REPLACE FUNCTION public\.check_branch_required\(\)[\s\S]*?\$\$;/,
    )?.[0] ?? "";
  assert.doesNotMatch(branchRequiredFunction, /warehouse_manager/);
  assert.doesNotMatch(branchRequiredFunction, /production_manager/);
});

test("dev seed keeps central-site operator users tenant-scoped", () => {
  assert.match(
    seedSource,
    /'warehouse@comtammatu\.vn'::text,\s*'warehouse_manager'::text,\s*NULL::bigint/,
  );
  assert.match(
    seedSource,
    /'production@comtammatu\.vn'::text,\s*'production_manager'::text,\s*NULL::bigint/,
  );
});

test("HR create/update actions normalize central-site branch ids before auth writes", () => {
  assert.match(
    hrStaffActionsSource,
    /const effectiveBranchId =\s*centralSiteBranchKindForRole\(role\) === null \? branch_id : undefined;/,
  );
  assert.match(hrStaffActionsSource, /branch_id: effectiveBranchId \?\? null/);
  assert.match(
    hrStaffActionsSource,
    /p_branch_id: effectiveBranchId \?\? undefined/,
  );

  assert.match(
    hrActionsSource,
    /const effectiveBranchId =\s*centralSiteBranchKindForRole\(role\) === null \? data\.branchId : undefined;/,
  );
  assert.match(hrActionsSource, /branch_id: effectiveBranchId \?\? null/);
});
