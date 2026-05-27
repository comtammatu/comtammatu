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
  resolveUserByEmail,
} from "./helpers";

/**
 * E2E: Transfer direction enforcement
 *
 * Covers the DB trigger `enforce_stock_transfer_direction` introduced in
 * migration 20260424000000_rename_warehouse_to_central_warehouse_retire_hq.sql
 * and the application-layer checks in transfer-actions.ts.
 *
 * Allowed directions (happy path):
 *   CW → CK   (Scenario 3)
 *
 * Rejected directions (trigger / server action returns error):
 *   CK → CW   (Scenario 4)  trigger ERRCODE 23514 → "Thông tin kho luân chuyển không hợp lệ."
 *   CW → CW   (Scenario 5)  trigger ERRCODE 23514 → same message
 *
 * Constraint scope violations:
 *   stock_issue(kitchen_use) at CW  (Scenario 6)  trigger ERRCODE 23514
 *
 * Note: Scenarios 3–5 drive through the /inventory/transfers UI.
 *       Scenario 6 drives through /inventory/issues UI.
 *       UI navigation is skipped when the dev server is not running —
 *       in that case the service-role assertions validate trigger behaviour directly.
 *
 * Pre-conditions (.env.test.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   E2E_CASHIER_EMAIL, E2E_CASHIER_PASSWORD  (owner/super_manager account or warehouse_manager)
 *   E2E_BASE_URL  (default http://localhost:3000)
 */

// ─── Fixtures ─────────────────────────────────────────────────────────────────

interface InventoryFixtures {
  tenantId: number;
  cw1Id: number;
  ckId: number;
  cw2Id: number;
  branchId: number;
  ingredientId: number;
  cwLocId: number;
  ckLocId: number;
  cw2LocId: number;
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

  const [cw1, ck, cw2, branch, ingredient] = await Promise.all([
    ensureBranch(supabase, tenantId, "central_warehouse", "1"),
    ensureBranch(supabase, tenantId, "central_kitchen", "1"),
    ensureBranch(supabase, tenantId, "central_warehouse", "2"),
    ensureBranch(supabase, tenantId, "branch", "1"),
    ensureIngredient(supabase, tenantId, "transfer"),
  ]);

  const [cwLocId, ckLocId, cw2LocId] = await Promise.all([
    ensureInventoryLocation(supabase, tenantId, cw1.id, "issue"),
    ensureInventoryLocation(supabase, tenantId, ck.id, "kitchen"),
    ensureInventoryLocation(supabase, tenantId, cw2.id, "receive"),
  ]);

  // Seed enough stock at CW1 for happy-path transfer
  await seedStockLevel(supabase, tenantId, cw1.id, ingredient.id, 100, cwLocId);

  // Resolve any admin user id (needed for createdByUserId in service-role inserts)
  const {
    data: { users },
  } = await supabase.auth.admin.listUsers();
  const adminUser = users[0];
  if (!adminUser)
    throw new Error("No auth users found — seed at least one test user");

  return {
    tenantId,
    cw1Id: cw1.id,
    ckId: ck.id,
    cw2Id: cw2.id,
    branchId: branch.id,
    ingredientId: ingredient.id,
    cwLocId,
    ckLocId,
    cw2LocId,
    adminUserId: adminUser.id,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Cấp bếp default_consumption warn-only contract", () => {
  test("dialog allows an active kitchen even when no kitchen is marked default_consumption", async ({
    page,
  }) => {
    const supabase = createServiceClient();
    const fx = await buildFixtures();

    let targetBranchId = fx.branchId;
    const authEmail = process.env.E2E_CASHIER_EMAIL;
    if (authEmail) {
      const authUser = await resolveUserByEmail(supabase, authEmail);
      const tenantWide = [
        "owner",
        "super_manager",
        "office",
        "area_manager",
      ].includes(authUser.role);
      if (!tenantWide && authUser.branchId != null) {
        targetBranchId = authUser.branchId;
      }
    }

    const { data: branch, error: branchErr } = await supabase
      .from("branches")
      .select("branch_kind")
      .eq("tenant_id", fx.tenantId)
      .eq("id", targetBranchId)
      .single();
    if (branchErr || !branch || branch.branch_kind !== "branch") {
      test.skip(true, "Cấp bếp UI needs an operational branch context.");
      return;
    }

    await ensureInventoryLocation(
      supabase,
      fx.tenantId,
      targetBranchId,
      "issue",
    );
    await ensureInventoryLocation(
      supabase,
      fx.tenantId,
      targetBranchId,
      "kitchen",
    );

    const { data: previousDefaults, error: defaultsErr } = await supabase
      .from("inventory_locations")
      .select("id")
      .eq("tenant_id", fx.tenantId)
      .eq("branch_id", targetBranchId)
      .eq("location_kind", "kitchen")
      .eq("is_active", true)
      .eq("is_default_consumption", true);
    if (defaultsErr) {
      throw new Error(
        `Failed to resolve default kitchens: ${defaultsErr.message}`,
      );
    }

    let nonDefaultKitchenId: number | null = null;
    const marker = Date.now();
    const nonDefaultKitchenName = `E2E Non-default kitchen ${marker}`;
    try {
      const { data: nonDefaultKitchen, error: insertErr } = await supabase
        .from("inventory_locations")
        .insert({
          tenant_id: fx.tenantId,
          branch_id: targetBranchId,
          name: nonDefaultKitchenName,
          code: `E2E-NONDEF-${targetBranchId}-${marker}`,
          location_kind: "kitchen",
          is_active: true,
          is_default_receive: false,
          is_default_issue: false,
          is_default_consumption: false,
          sort_order: 998,
        })
        .select("id")
        .single();
      if (insertErr || !nonDefaultKitchen) {
        throw new Error(
          `Failed to create non-default kitchen: ${insertErr?.message}`,
        );
      }
      nonDefaultKitchenId = nonDefaultKitchen.id;

      const { error: clearDefaultErr } = await supabase
        .from("inventory_locations")
        .update({ is_default_consumption: false })
        .eq("tenant_id", fx.tenantId)
        .eq("branch_id", targetBranchId)
        .eq("location_kind", "kitchen")
        .eq("is_active", true);
      if (clearDefaultErr) {
        throw new Error(
          `Failed to clear default kitchen flag: ${clearDefaultErr.message}`,
        );
      }

      await page.goto(
        `/inventory/transfers?branchId=${targetBranchId}&create=cap-bep`,
      );
      await page.waitForLoadState("networkidle");
      if (await isAccessDenied(page)) {
        test.skip(true, "E2E auth user cannot access Inventory transfer UI.");
        return;
      }

      const dialog = page.getByRole("dialog");
      if (!(await dialog.isVisible({ timeout: 10_000 }).catch(() => false))) {
        test.skip(
          true,
          "Transfer create dialog is not available to this E2E user.",
        );
        return;
      }

      const capBepTab = dialog.getByRole("tab", { name: /Cấp bếp/i });
      if (await capBepTab.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await capBepTab.click();
      }

      await expect(dialog.getByText("Cấu hình bếp cần rà soát")).toBeVisible({
        timeout: 10_000,
      });
      await expect(
        dialog.getByText("Chi nhánh chưa có Bếp mặc định"),
      ).toHaveCount(0);

      const receiveLocationSelect = dialog.getByRole("combobox").nth(1);
      await expect(receiveLocationSelect).toBeEnabled();
      await receiveLocationSelect.click();
      await expect(
        page.getByRole("option", { name: new RegExp(nonDefaultKitchenName) }),
      ).toBeVisible({ timeout: 5_000 });
      await page.keyboard.press("Escape");

      const ingredientSelect = dialog.getByRole("combobox").nth(2);
      await ingredientSelect.click();
      await page
        .getByRole("option", { name: /E2E Ingredient transfer/i })
        .first()
        .click();
      await dialog.getByRole("button", { name: "Thêm nguyên liệu" }).click();
      await dialog.getByPlaceholder("SL").fill("1");

      await expect(
        dialog.getByRole("button", { name: "Tạo phiếu" }),
      ).toBeEnabled();
    } finally {
      if (nonDefaultKitchenId != null) {
        await supabase
          .from("inventory_locations")
          .delete()
          .eq("id", nonDefaultKitchenId)
          .eq("tenant_id", fx.tenantId);
      }

      const restoreDefaultId = previousDefaults?.[0]?.id;
      if (restoreDefaultId != null) {
        await supabase
          .from("inventory_locations")
          .update({ is_default_consumption: true })
          .eq("id", restoreDefaultId)
          .eq("tenant_id", fx.tenantId);
      }
    }
  });
});

test.describe("Transfer direction — CW→CK happy path (Scenario 3)", () => {
  test("transfer CW→CK progresses draft→confirmed_ship→in_transit→confirmed_receive→received and stock levels move correctly", async ({
    page,
  }) => {
    const supabase = createServiceClient();
    const fx = await buildFixtures();

    const stockBefore = await getStockLevel(
      supabase,
      fx.tenantId,
      fx.cw1Id,
      fx.ingredientId,
    );

    const transfer = await createTestTransferDraft(supabase, {
      tenantId: fx.tenantId,
      fromBranchId: fx.cw1Id,
      toBranchId: fx.ckId,
      ingredientId: fx.ingredientId,
      quantity: 5,
      createdByUserId: fx.adminUserId,
      fromLocationId: fx.cwLocId,
      toLocationId: fx.ckLocId,
    });

    try {
      // ── confirm_ship ───────────────────────────────────────────────────────
      await page.goto(
        `/inventory/transfers/${transfer.id}?branchId=${fx.cw1Id}`,
      );
      await page.waitForLoadState("networkidle");
      if (await isAccessDenied(page)) {
        test.skip(
          true,
          "E2E auth user cannot access Inventory transfer UI. Use owner, super_manager, warehouse_manager, or production_manager for UI happy-path coverage.",
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
        `/inventory/transfers/${transfer.id}?branchId=${fx.cw1Id}`,
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
        `/inventory/transfers/${transfer.id}?branchId=${fx.ckId}`,
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
        `/inventory/transfers/${transfer.id}?branchId=${fx.ckId}`,
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
      const stockAfterCw = await getStockLevel(
        supabase,
        fx.tenantId,
        fx.cw1Id,
        fx.ingredientId,
      );
      const stockAfterCk = await getStockLevel(
        supabase,
        fx.tenantId,
        fx.ckId,
        fx.ingredientId,
      );

      const beforeQty = stockBefore ?? 0;
      // CW1 stock should decrease by 5
      expect(stockAfterCw).toBeCloseTo(beforeQty - 5, 2);
      // CK stock should have increased (may start from 0)
      expect(stockAfterCk).toBeGreaterThan(0);
    } finally {
      await transfer.cleanup();
    }
  });
});

test.describe("Transfer direction — CK→CW rejected (Scenario 4)", () => {
  test("returns user-facing error when attempting CK→CW transfer via server action", async ({
    page,
  }) => {
    const supabase = createServiceClient();
    const fx = await buildFixtures();

    // Attempt to create a CK→CW transfer via the UI transfer creation form
    await page.goto("/inventory/transfers/new");
    await page.waitForLoadState("networkidle");

    // Select from-branch = CK and to-branch = CW
    const fromSelect = page
      .locator('[name="fromBranchId"], [data-testid="from-branch-select"]')
      .first();
    const toSelect = page
      .locator('[name="toBranchId"], [data-testid="to-branch-select"]')
      .first();

    // If UI form is not found, fall back to direct service-role insert check
    if (!(await fromSelect.isVisible({ timeout: 5_000 }).catch(() => false))) {
      // Direct DB trigger validation via service-role insert (bypasses RLS)
      const { error } = await supabase.from("stock_transfers").insert({
        tenant_id: fx.tenantId,
        from_branch_id: fx.ckId,
        to_branch_id: fx.cw1Id,
        transfer_number: `TRF-E2E-CK-CW-${Date.now()}`,
        status: "draft",
        created_by: fx.adminUserId,
      });

      // Trigger must reject with a check violation (ERRCODE 23514)
      expect(error).not.toBeNull();
      expect(error!.code).toBe("23514");
      expect(error!.message).toContain(
        "invalid direction central_kitchen -> central_warehouse",
      );
      return;
    }

    // ── UI path ────────────────────────────────────────────────────────────
    // Find the CK option in from-branch and CW option in to-branch
    await fromSelect.selectOption({ value: String(fx.ckId) });
    await toSelect.selectOption({ value: String(fx.cw1Id) });

    const submitBtn = page.getByRole("button", { name: /tạo phiếu|xác nhận/i });
    await submitBtn.click();

    // Expect error toast / inline error containing the user-facing string
    const errorMsg = page
      .getByText("Thông tin kho luân chuyển không hợp lệ.")
      .or(page.getByText("Không được chuyển giữa hai chi nhánh vận hành."));
    await expect(errorMsg).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Transfer direction — CW→CW rejected (Scenario 5)", () => {
  test("returns trigger error when attempting transfer between two CW branches", async ({
    page: _page,
  }) => {
    const supabase = createServiceClient();
    const fx = await buildFixtures();

    // Validate via direct service-role insert — the trigger fires regardless of app layer
    const { error } = await supabase.from("stock_transfers").insert({
      tenant_id: fx.tenantId,
      from_branch_id: fx.cw1Id,
      to_branch_id: fx.cw2Id,
      transfer_number: `TRF-E2E-CW-CW-${Date.now()}`,
      status: "draft",
      created_by: fx.adminUserId,
    });

    // enforce_stock_transfer_direction must reject CW→CW (two different CW branches)
    expect(error).not.toBeNull();
    expect(error!.code).toBe("23514");
    expect(error!.message).toContain(
      "invalid direction central_warehouse -> central_warehouse",
    );
  });

  test("createStockTransfer server action surfaces user-facing error for CW→CW", async ({
    page,
  }) => {
    const fx = await buildFixtures();

    // Drive through the UI creation form — expect the app-layer branch-kind guard
    // to fire (fromKind === 'central_warehouse' && toKind === 'central_warehouse'
    // is not in the whitelist, so the trigger fires and the action maps it to the
    // user-facing message).
    await page.goto("/inventory/transfers/new");
    await page.waitForLoadState("networkidle");

    const fromSelect = page
      .locator('[name="fromBranchId"], [data-testid="from-branch-select"]')
      .first();
    if (!(await fromSelect.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(
        true,
        "Transfer creation UI not accessible — covered by direct DB assertion above",
      );
      return;
    }

    const toSelect = page
      .locator('[name="toBranchId"], [data-testid="to-branch-select"]')
      .first();
    await fromSelect.selectOption({ value: String(fx.cw1Id) });
    await toSelect.selectOption({ value: String(fx.cw2Id) });

    const submitBtn = page.getByRole("button", { name: /tạo phiếu|xác nhận/i });
    await submitBtn.click();

    const errorMsg = page.getByText("Thông tin kho luân chuyển không hợp lệ.");
    await expect(errorMsg).toBeVisible({ timeout: 10_000 });
  });
});

// kitchen_use was retired 2026-04-25 (CHECK constraint + Zod enum drop).
// Any attempt to persist `issue_type='kitchen_use'` now trips the CHECK.
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
      branch_id: fx.cw1Id,
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
