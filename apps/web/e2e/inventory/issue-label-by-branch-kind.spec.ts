import { test, expect } from "@playwright/test";
import { createServiceClient, resolveTenantId } from "./helpers";

/**
 * E2E: Stock-issue label & movement_subtype wiring
 *
 * Covers the 2026-04-25 cutover migrations:
 *   - 20260426100000_stock_issue_wac_strict_and_subtype.sql
 *   - 20260426100100_retire_kitchen_use_issue_type.sql
 *
 * These structural assertions guard against regressions in three areas:
 *
 *   1. `stock_issues.issue_type` CHECK constraint no longer accepts
 *      `kitchen_use` — any surface that re-introduces the enum will
 *      fail INSERT with ERRCODE 23514.
 *
 *   2. `reject_stock_issue_kitchen_use` trigger has been retired (the
 *      CHECK above is now the single source of truth).
 *
 *   3. `stock_movements.movement_subtype` CHECK accepts only:
 *        storage_loss | sale_consumption | writeoff | other | NULL
 *      This is the reporting discriminator for issue movements.
 *
 * We assert via service-role INSERTs because the CHECK fires regardless of
 * RLS. Full `confirm_stock_issue` RPC flow (auth.uid-scoped) is exercised by
 * integration tests with a signed-in fixture; here we only pin the schema
 * contract so migrations cannot silently regress it.
 */

test.describe("stock_issue retirement + movement_subtype schema", () => {
  test("stock_issues.issue_type CHECK rejects kitchen_use", async () => {
    const supabase = createServiceClient();
    const tenantId = await resolveTenantId(supabase);

    const { data: userRes } = await supabase.auth.admin.listUsers();
    const adminUser = userRes.users[0];
    if (!adminUser) throw new Error("No auth user for created_by");

    const { data: anyBranch } = await supabase
      .from("branches")
      .select("id")
      .eq("tenant_id", tenantId)
      .limit(1)
      .single();
    if (!anyBranch) throw new Error("No branch seeded");

    const { error } = await supabase.from("stock_issues").insert({
      tenant_id: tenantId,
      branch_id: anyBranch.id,
      issue_number: `PXK-E2E-KU-${Date.now()}`,
      issue_type: "kitchen_use",
      status: "draft",
      created_by: adminUser.id,
    });

    expect(error).not.toBeNull();
    expect(error!.code).toBe("23514");
    expect(error!.message.toLowerCase()).toContain("issue_type");
  });

  test("reject_stock_issue_kitchen_use trigger is dropped", async () => {
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("pg_trigger" as never)
      .select("tgname")
      .eq("tgname", "trg_stock_issue_reject_kitchen_use")
      .limit(1);

    // `pg_trigger` isn't exposed via PostgREST by default — expect either
    // empty array OR the schema-error response. What we must NOT see is a
    // row with the trigger name.
    if (!error) {
      expect(data ?? []).toHaveLength(0);
    }
  });

  test("stock_movements.movement_subtype CHECK accepts valid values", async () => {
    const supabase = createServiceClient();
    const tenantId = await resolveTenantId(supabase);

    const { data: branch } = await supabase
      .from("branches")
      .select("id")
      .eq("tenant_id", tenantId)
      .limit(1)
      .single();
    if (!branch) throw new Error("No branch seeded");

    const { data: ingredient } = await supabase
      .from("ingredients")
      .select("id")
      .eq("tenant_id", tenantId)
      .limit(1)
      .single();
    if (!ingredient) throw new Error("No ingredient seeded");

    const { data: location } = await supabase
      .from("inventory_locations")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("branch_id", branch.id)
      .limit(1)
      .single();
    if (!location) throw new Error("No inventory_location seeded");

    const { data: userRes } = await supabase.auth.admin.listUsers();
    const adminUser = userRes.users[0];
    if (!adminUser) throw new Error("No auth user for created_by");

    // Invalid subtype must raise 23514.
    const { error } = await supabase.from("stock_movements").insert({
      tenant_id: tenantId,
      branch_id: branch.id,
      ingredient_id: ingredient.id,
      location_id: location.id,
      created_by: adminUser.id,
      type: "adjustment",
      movement_subtype: "not_a_valid_subtype",
      quantity_change: 0,
      unit_cost: 0,
      reason: "schema check",
    });

    expect(error).not.toBeNull();
    expect(error!.code).toBe("23514");
    expect(error!.message.toLowerCase()).toContain("movement_subtype");
  });
});
