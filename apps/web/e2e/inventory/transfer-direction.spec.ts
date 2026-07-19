import { test, expect, type Page } from "@playwright/test";
import { E2E_AUTH_STORAGE_MANAGER, E2E_AUTH_STORAGE_OWNER } from "../../playwright.config";
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
  resolveInventoryManagerUser,
} from "./helpers";

test.use({ storageState: E2E_AUTH_STORAGE_MANAGER });

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
  const manager = await resolveInventoryManagerUser(supabase);

  // Kho Tong is always branch ID 3
  const sourceBranchId = 3;

  const [destinationBranch, branch, ingredient] =
    await Promise.all([
      ensureBranch(supabase, tenantId, "branch", "transfer-destination"),
      ensureBranch(supabase, tenantId, "branch", "1"),
      ensureIngredient(supabase, tenantId, "transfer"),
    ]);

  const [sourceLocId, destinationLocId] = await Promise.all([
    ensureInventoryLocation(supabase, tenantId, sourceBranchId, "issue"),
    ensureInventoryLocation(
      supabase,
      tenantId,
      destinationBranch.id,
      "receive",
    ),
  ]);

  // Seed enough stock at Kho Tong for the happy-path transfer.
  await seedStockLevel(
    supabase,
    tenantId,
    sourceBranchId,
    ingredient.id,
    100,
    sourceLocId,
  );

  return {
    tenantId,
    sourceBranchId,
    destinationBranchId: destinationBranch.id,
    branchId: branch.id,
    ingredientId: ingredient.id,
    sourceLocId,
    destinationLocId,
    adminUserId: manager.userId,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Transfer direction — branch-to-branch happy path", () => {
  test(
    "transfer progresses draft→confirmed_ship→in_transit→received and stock levels move correctly",
    { tag: "@slow" },
    async ({ page, browser }) => {
      test.setTimeout(90_000);
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

      // Owner context: keeper@comtammatu.vn (owner role) bypasses branch_claim DB checks
      // and can perform receive at any branch. This accurately models the real-world
      // two-person transfer workflow: manager ships, owner/branch-manager receives.
      const ownerCtx = await browser.newContext({ storageState: E2E_AUTH_STORAGE_OWNER });
      const ownerPage = await ownerCtx.newPage();

      try {
        // ── confirm_ship (manager = warehouse_manager at Kho Tong) ─────────────
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

        const confirmShipBtn = page.getByRole("button", {
          name: /x.c nh.n xu.t/i,
        });
        await expect(confirmShipBtn).toBeVisible({ timeout: 10_000 });
        await expect(confirmShipBtn).toBeEnabled({ timeout: 10_000 });
        await confirmShipBtn.click();

        // Inter-branch transfer auto-transitions to in_transit after confirm_ship.
        await expect
          .poll(() => getTransferStatus(supabase, fx.tenantId, transfer.id), {
            timeout: 15_000,
            message: "status should become in_transit after confirm_ship due to auto-transit",
          })
          .toBe("in_transit");

        // ── receive (owner — bypasses branch_claim check) ──────────────────────
        // The "Xác nhận nhận hàng" button calls transferReceive which atomically:
        //   1. stock_transfer_confirm_receive (in_transit → confirmed_receive)
        //   2. stock_transfer_receive         (confirmed_receive → received)
        // So the status goes directly to "received" from the UI's perspective.
        await ownerPage.goto(
          `/inventory/transfers/${transfer.id}?branchId=${fx.destinationBranchId}`,
        );
        await ownerPage.waitForLoadState("networkidle");

        const receiveBtn = ownerPage.getByRole("button", {
          name: /x.c nh.n nh.n h.ng/i,
        });
        await expect(receiveBtn).toBeVisible({ timeout: 10_000 });
        await expect(receiveBtn).toBeEnabled({ timeout: 10_000 });
        await receiveBtn.click();

        await expect
          .poll(() => getTransferStatus(supabase, fx.tenantId, transfer.id), {
            timeout: 20_000,
            message: "status should become received",
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
        await ownerPage.close();
        await ownerCtx.close();
        await transfer.cleanup();
      }
    },
  );
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
