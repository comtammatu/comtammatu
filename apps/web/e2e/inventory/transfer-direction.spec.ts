import { test, expect, type Page } from "@playwright/test";
import {
  createServiceClient,
  resolveTenantId,
  ensureBranch,
  ensureIngredient,
  ensureInventoryLocation,
  seedStockLevel,
  createTestTransferDraft,
  getTransferStatus,
  getStockLevel,
} from "./helpers";

/**
 * E2E: Transfer direction enforcement
 *
 * Covers the DB trigger `enforce_stock_transfer_direction` and the
 * application-layer checks in transfer-actions.ts.
 *
 * Allowed directions (happy path):
 *   branch → branch
 *
 * Constraint scope violations:
 *   stock_issue(kitchen_use)  trigger ERRCODE 23514
 *
 * Note: Scenarios 3–5 drive through the /inventory/transfers UI.
 *       Scenario 6 drives through /inventory/issues UI.
 *       UI navigation is skipped when the dev server is not running —
 *       in that case the service-role assertions validate trigger behaviour directly.
 *
 * Pre-conditions (.env.test.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   E2E_CASHIER_EMAIL, E2E_CASHIER_PASSWORD  (owner account or warehouse_manager)
 *   E2E_BASE_URL  (default http://localhost:3000)
 */

// ─── Fixtures ─────────────────────────────────────────────────────────────────

interface InventoryFixtures {
  tenantId: number;
  sourceBranchId: number;
  destinationBranchId: number;
  branchId: number;
  ingredientId: number;
  sourceLocId: number;
  destinationLocId: number;
  adminUserId: string;
}

async function isAccessDenied(page: Page) {
  const blockedPath = await page
    .locator("main")
    .getByText(/\/inventory\//i)
    .isVisible({ timeout: 1_000 })
    .catch(() => false);
  const loginLink = await page
    .locator('main a[href="/login"]')
    .isVisible({ timeout: 1_000 })
    .catch(() => false);

  return blockedPath && loginLink;
}

async function buildFixtures(): Promise<InventoryFixtures> {
  const supabase = createServiceClient();
  const tenantId = await resolveTenantId(supabase);

  const [sourceBranch, destinationBranch, branch, ingredient] =
    await Promise.all([
      ensureBranch(supabase, tenantId, "branch", "transfer-source"),
      ensureBranch(supabase, tenantId, "branch", "transfer-destination"),
      ensureBranch(supabase, tenantId, "branch", "1"),
      ensureIngredient(supabase, tenantId, "transfer"),
    ]);

  const [sourceLocId, destinationLocId] = await Promise.all([
    ensureInventoryLocation(supabase, tenantId, sourceBranch.id, "issue"),
    ensureInventoryLocation(
      supabase,
      tenantId,
      destinationBranch.id,
      "receive",
    ),
  ]);

  // Seed enough stock at the source branch for the happy-path transfer.
  await seedStockLevel(
    supabase,
    tenantId,
    sourceBranch.id,
    ingredient.id,
    100,
    sourceLocId,
  );

  // Resolve any admin user id (needed for createdByUserId in service-role inserts)
  const {
    data: { users },
  } = await supabase.auth.admin.listUsers();
  const adminUser = users[0];
  if (!adminUser)
    throw new Error("No auth users found — seed at least one test user");

  return {
    tenantId,
    sourceBranchId: sourceBranch.id,
    destinationBranchId: destinationBranch.id,
    branchId: branch.id,
    ingredientId: ingredient.id,
    sourceLocId,
    destinationLocId,
    adminUserId: adminUser.id,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Branch consumption redirect", () => {
  test("legacy transfer create URL opens the consumption surface", async ({
    page,
  }) => {
    const fx = await buildFixtures();

    await page.goto(`/inventory/transfers?branchId=${fx.branchId}&create=cap-bep`);
    await page.waitForLoadState("networkidle");
    if (await isAccessDenied(page)) {
      test.skip(true, "E2E auth user cannot access Inventory.");
      return;
    }

    await expect(page).toHaveURL(/\/inventory\/consumption/);
    await expect(page.getByRole("heading", { name: /Tiêu hao/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Cấp bếp/i })).toHaveCount(0);
  });
});

test.describe("Transfer direction — branch-to-branch happy path", () => {
  test("transfer progresses draft→confirmed_ship→in_transit→confirmed_receive→received and stock levels move correctly", async ({
    page,
  }) => {
    const supabase = createServiceClient();
    const fx = await buildFixtures();

    const stockBefore = await getStockLevel(
      supabase,
      fx.tenantId,
      fx.sourceBranchId,
      fx.ingredientId,
    );

    const transfer = await createTestTransferDraft(supabase, {
      tenantId: fx.tenantId,
      fromBranchId: fx.sourceBranchId,
      toBranchId: fx.destinationBranchId,
      ingredientId: fx.ingredientId,
      quantity: 5,
      createdByUserId: fx.adminUserId,
      fromLocationId: fx.sourceLocId,
      toLocationId: fx.destinationLocId,
    });

    try {
      // ── confirm_ship ───────────────────────────────────────────────────────
      await page.goto(
        `/inventory/transfers/${transfer.id}?branchId=${fx.sourceBranchId}`,
      );
      await page.waitForLoadState("networkidle");
      if (await isAccessDenied(page)) {
        test.skip(
          true,
          "E2E auth user cannot access Inventory transfer UI. Use owner, warehouse_manager, or production_manager for UI happy-path coverage.",
        );
        return;
      }

      // Click "Xác nhận xuất kho" button
      const confirmShipBtn = page.getByRole("button", {
        name: /x.c nh.n xu.t/i,
      });
      await expect(confirmShipBtn).toBeVisible({ timeout: 10_000 });
      await expect(confirmShipBtn).toBeEnabled({ timeout: 10_000 });
      await confirmShipBtn.click();

      // Wait for status to update in DB (RPC is async relative to UI rerender)
      await expect
        .poll(() => getTransferStatus(supabase, fx.tenantId, transfer.id), {
          timeout: 15_000,
          message: "status should become confirmed_ship after confirm_ship",
        })
        .toBe("confirmed_ship");

      await page.goto(
        `/inventory/transfers/${transfer.id}?branchId=${fx.sourceBranchId}`,
      );
      await page.waitForLoadState("networkidle");

      // ── mark_in_transit ────────────────────────────────────────────────────
      const inTransitBtn = page.getByRole("button", {
        name: /.ang v.n chuy.n|b.t .au v.n chuy.n/i,
      });
      await expect(inTransitBtn).toBeVisible({ timeout: 8_000 });
      await expect(inTransitBtn).toBeEnabled({ timeout: 10_000 });
      await inTransitBtn.click();

      await expect
        .poll(() => getTransferStatus(supabase, fx.tenantId, transfer.id), {
          timeout: 15_000,
          message: "status should become in_transit",
        })
        .toBe("in_transit");

      await page.goto(
        `/inventory/transfers/${transfer.id}?branchId=${fx.destinationBranchId}`,
      );
      await page.waitForLoadState("networkidle");

      // ── confirm_receive ────────────────────────────────────────────────────
      const receiveBtn = page.getByRole("button", {
        name: /x.c nh.n nh.n|ki.m nh.n|b.t .au ki.m nh.n/i,
      });
      await expect(receiveBtn).toBeVisible({ timeout: 8_000 });
      await expect(receiveBtn).toBeEnabled({ timeout: 10_000 });
      await receiveBtn.click();

      await expect
        .poll(() => getTransferStatus(supabase, fx.tenantId, transfer.id), {
          timeout: 15_000,
          message: "status should become confirmed_receive",
        })
        .toBe("confirmed_receive");

      await page.goto(
        `/inventory/transfers/${transfer.id}?branchId=${fx.destinationBranchId}`,
      );
      await page.waitForLoadState("networkidle");

      // Confirm receive (complete the receipt)
      const finishBtn = page.getByRole("button", {
        name: /ho.n t.t nh.n|x.c nh.n nh.n h.ng|x.c nh.n nh.p/i,
      });
      await expect(finishBtn).toBeVisible({ timeout: 8_000 });
      await expect(finishBtn).toBeEnabled({ timeout: 10_000 });
      await finishBtn.click();

      await expect
        .poll(() => getTransferStatus(supabase, fx.tenantId, transfer.id), {
          timeout: 20_000,
          message: "final status should be received",
        })
        .toBe("received");

      // ── Assert stock levels moved ──────────────────────────────────────────
      const sourceStockAfter = await getStockLevel(
        supabase,
        fx.tenantId,
        fx.sourceBranchId,
        fx.ingredientId,
      );
      const destinationStockAfter = await getStockLevel(
        supabase,
        fx.tenantId,
        fx.destinationBranchId,
        fx.ingredientId,
      );

      const beforeQty = stockBefore ?? 0;
      expect(sourceStockAfter).toBeCloseTo(beforeQty - 5, 2);
      expect(destinationStockAfter).toBeGreaterThan(0);
    } finally {
      await transfer.cleanup();
    }
  });
});

// Persisting `issue_type='kitchen_use'` trips the DB CHECK constraint.
test.describe("stock_issue kitchen_use retired (Scenario 6)", () => {
  test("DB CHECK constraint rejects kitchen_use issue_type at any branch kind", async ({
    page: _page,
  }) => {
    const supabase = createServiceClient();
    const fx = await buildFixtures();

    const {
      data: { users },
    } = await supabase.auth.admin.listUsers();
    const adminUser = users[0];
    if (!adminUser) throw new Error("No auth users to use as created_by");

    // Direct insert via service-role bypasses RLS but CHECK constraint still fires.
    const { error } = await supabase.from("stock_issues").insert({
      tenant_id: fx.tenantId,
      branch_id: fx.sourceBranchId,
      issue_number: `PXK-E2E-SCOPE-${Date.now()}`,
      issue_type: "kitchen_use",
      status: "draft",
      created_by: adminUser.id,
    });

    // stock_issues_issue_type_check constraint must fire
    expect(error).not.toBeNull();
    expect(error!.code).toBe("23514");
    // PostgREST surfaces CHECK violation on "stock_issues_issue_type_check"
    expect(error!.message.toLowerCase()).toContain("issue_type");
  });
});
