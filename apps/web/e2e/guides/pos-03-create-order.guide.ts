/**
 * POS-03 Create order + send to kitchen — capture spec.
 *
 * 5 main steps + 1 variant:
 *   step-01-menu-overview     — menu open, search + category tabs highlighted
 *   step-02-tap-item          — tap an item → added to cart
 *   step-03-cart-review       — cart open, item + qty + price visible
 *   step-04-add-note          — typing an order note
 *   step-05-ready-to-submit   — "Đặt món" button highlighted, ready to send
 *   variant-customizer        — item with modifiers/sides → customizer drawer
 *
 * Run: pnpm --filter @comtammatu/web guides:capture --grep="POS-03"
 *
 * Note: NEVER actually click "Đặt món" in step-05 — it would create an
 * orphan order in the test DB. Only highlight the button.
 */

import { test, type Page } from "@playwright/test";
import { captureScenario } from "./_lib/capture";
import {
  ensureMinTables,
  ensureSingleOpenSession,
  getCashierContext,
} from "./_lib/fixtures";

const FLOW = "pos-03";
const MODULE = "pos";
const TOTAL = 5;

/**
 * Helper: navigate to POS → tap an empty table → wait for the menu.
 * Every step sets up from scratch (mode "serial" does not guarantee state).
 */
async function gotoMenuViaTable(p: Page, branchId: number): Promise<void> {
  await p.goto(`/br/${String(branchId)}/pos`);
  const firstAvailable = p
    .locator('button[aria-label*="Bàn"][aria-label*="Trống"]')
    .first();
  await firstAvailable.waitFor({ state: "visible", timeout: 10000 });
  await firstAvailable.click();
  await p
    .getByPlaceholder(/Tìm món/i)
    .waitFor({ state: "visible", timeout: 8000 });
}

/** Tap a food item that almost certainly has no modifiers (basic rice). */
async function tapBasicMenuItem(p: Page): Promise<void> {
  // "Cơm Tấm Bì" / "Cơm Tấm Chả" — basic items in seed data
  const item = p
    .getByRole("button", { name: /Cơm Tấm Bì|Cơm Tấm Chả/i })
    .first();
  await item.waitFor({ state: "visible", timeout: 8000 });
  await item.click();
}

test.describe("POS-03 Tạo đơn mới + gửi bếp", () => {
  test.describe.configure({ mode: "serial" });

  test("step-01-menu-overview", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureMinTables(ctx, 4);

    await captureScenario(page, browser, {
      id: "step-01-menu-overview",
      flowId: FLOW,
      module: MODULE,
      step: { number: 1, total: TOTAL, title: "Vào menu — tìm món" },
      setup: async (p) => {
        await gotoMenuViaTable(p, ctx.branchId);
      },
      annotations: [
        {
          type: "highlight",
          selector: 'input[placeholder*="Tìm món"]',
        },
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 230,
          placement: "below",
          text: "Tìm theo tên\nhoặc chạm danh mục",
        },
      ],
    });
  });

  test("step-02-tap-item", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureMinTables(ctx, 4);

    await captureScenario(page, browser, {
      id: "step-02-tap-item",
      flowId: FLOW,
      module: MODULE,
      step: { number: 2, total: TOTAL, title: "Chạm món để thêm vào giỏ" },
      setup: async (p) => {
        await gotoMenuViaTable(p, ctx.branchId);
      },
      annotations: [
        {
          type: "tap",
          selector: 'button:has-text("Cơm Tấm Bì")',
          label: "Chạm món",
        },
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 700,
          placement: "above",
          text: "Mỗi lần chạm =\nthêm 1 món vào giỏ",
        },
      ],
    });
  });

  test("step-03-cart-review", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureMinTables(ctx, 4);

    await captureScenario(page, browser, {
      id: "step-03-cart-review",
      flowId: FLOW,
      module: MODULE,
      step: { number: 3, total: TOTAL, title: "Mở giỏ — kiểm tra món" },
      setup: async (p) => {
        await gotoMenuViaTable(p, ctx.branchId);
        await tapBasicMenuItem(p);
        // Open the cart drawer
        const cartBtn = p
          .getByRole("button", { name: /Giỏ mới|Giỏ đơn mới/i })
          .first();
        await cartBtn.waitFor({ state: "visible", timeout: 5000 });
        await cartBtn.click();
        // Wait for the cart drawer + the "Đặt món (n)" button
        await p
          .getByRole("button", { name: /Đặt món/i })
          .waitFor({ state: "visible", timeout: 5000 });
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 280,
          placement: "below",
          text: "Món + số lượng + giá\nKiểm tra trước khi gửi",
        },
      ],
    });
  });

  test("step-04-add-note", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureMinTables(ctx, 4);

    await captureScenario(page, browser, {
      id: "step-04-add-note",
      flowId: FLOW,
      module: MODULE,
      step: { number: 4, total: TOTAL, title: "Ghi chú đơn (tùy chọn)" },
      setup: async (p) => {
        await gotoMenuViaTable(p, ctx.branchId);
        await tapBasicMenuItem(p);
        const cartBtn = p
          .getByRole("button", { name: /Giỏ mới|Giỏ đơn mới/i })
          .first();
        await cartBtn.click();
        const noteBox = p.getByPlaceholder(/ít đường|không hành/i);
        await noteBox.waitFor({ state: "visible", timeout: 5000 });
        await noteBox.fill("ít cơm, không hành");
      },
      annotations: [
        {
          type: "highlight",
          selector: 'textarea[placeholder*="ít đường"]',
        },
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 540,
          placement: "above",
          text: "Bếp đọc ghi chú này\nkhi làm món",
        },
      ],
    });
  });

  test("step-05-ready-to-submit", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureMinTables(ctx, 4);

    await captureScenario(page, browser, {
      id: "step-05-ready-to-submit",
      flowId: FLOW,
      module: MODULE,
      step: { number: 5, total: TOTAL, title: "Gửi bếp — hòan tất" },
      setup: async (p) => {
        await gotoMenuViaTable(p, ctx.branchId);
        await tapBasicMenuItem(p);
        const cartBtn = p
          .getByRole("button", { name: /Giỏ mới|Giỏ đơn mới/i })
          .first();
        await cartBtn.click();
        await p
          .getByRole("button", { name: /Đặt món/i })
          .waitFor({ state: "visible", timeout: 5000 });
      },
      annotations: [
        {
          type: "tap",
          selector: 'button:has-text("Đặt món")',
          label: "Chạm để gửi bếp",
        },
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 600,
          placement: "above",
          text: "Sau khi gửi:\n• KDS có ticket\n• Bàn chuyển Đang dùng",
        },
      ],
    });
  });

  test("variant-customizer", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureMinTables(ctx, 4);

    await captureScenario(page, browser, {
      id: "variant-customizer",
      flowId: FLOW,
      module: MODULE,
      step: {
        number: 1,
        total: 1,
        title: "Variant — món có topping/options",
      },
      setup: async (p) => {
        await gotoMenuViaTable(p, ctx.branchId);
        // Tap a higher-priced item more likely to have modifiers/sides
        // ("Sườn Một Gang" / "Sườn Cốt Lết" in the seed data)
        const item = p
          .getByRole("button", { name: /Sườn Một Gang|Sườn Cốt Lết|Sườn Cây/i })
          .first();
        await item.waitFor({ state: "visible", timeout: 8000 });
        await item.click();
        // Wait for the customizer drawer (item heading or "Thêm vào giỏ").
        // Items without modifiers never open it → fall back on timeout
        await p
          .getByRole("button", { name: /Thêm vào giỏ|Cập nhật giỏ/i })
          .waitFor({ state: "visible", timeout: 4000 })
          .catch(() => {
            // Item has no customizer — capture the menu state instead
          });
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 280,
          placement: "below",
          text: "Món có topping/biến thể\n→ chọn xong rồi thêm vào giỏ",
        },
      ],
    });
  });
});
