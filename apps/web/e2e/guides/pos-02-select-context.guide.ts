/**
 * POS-02 Chọn bối cảnh bán hàng — capture spec.
 *
 * Mobile POS hiện toggle "Tại bàn" / "Mang về" ngay header → cashier
 * không cần mở cart drawer để switch order_type.
 *
 * 3 main steps + 1 variant:
 *   step-01-table-tab        — POS main, tab "Tại bàn" active, table grid
 *   step-02-tap-empty-table  — chạm bàn trống → menu pane hiện
 *   step-03-takeaway-tab     — chuyển tab "Mang về" → menu pane (no table)
 *   variant-multi-order      — chạm bàn đang dùng → multi-order picker
 *
 * Chạy: pnpm --filter @comtammatu/web guides:capture --grep="POS-02"
 */

import { test } from "@playwright/test";
import { captureScenario } from "./_lib/capture";
import {
  ensureMinTables,
  ensureOccupiedTableWithOrder,
  ensureSingleOpenSession,
  getCashierContext,
} from "./_lib/fixtures";

const FLOW = "pos-02";
const MODULE = "pos";
const TOTAL = 3;

test.describe("POS-02 Chọn bối cảnh bán hàng", () => {
  test.describe.configure({ mode: "serial" });

  test("step-01-table-tab", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureMinTables(ctx, 4);

    await captureScenario(page, browser, {
      id: "step-01-table-tab",
      flowId: FLOW,
      module: MODULE,
      step: { number: 1, total: TOTAL, title: "Vào màn POS chính" },
      setup: async (p) => {
        await p.goto(`/br/${String(ctx.branchId)}/pos`);
        // Đợi danh sách bàn render
        await p
          .getByText(/trống/i)
          .first()
          .waitFor({ state: "visible", timeout: 10000 });
      },
      annotations: [
        {
          type: "callout",
          selector:
            '[role="tab"]:has-text("Mang về"), button:has-text("Mang về")',
          placement: "below",
          text: "2 chế độ bán:\nTại bàn / Mang về",
        },
      ],
    });
  });

  test("step-02-tap-empty-table", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureMinTables(ctx, 4);

    await captureScenario(page, browser, {
      id: "step-02-tap-empty-table",
      flowId: FLOW,
      module: MODULE,
      step: {
        number: 2,
        total: TOTAL,
        title: "Chạm bàn trống → vào menu",
      },
      setup: async (p) => {
        await p.goto(`/br/${String(ctx.branchId)}/pos`);
        const firstAvailable = p
          .locator('button[aria-label*="Bàn"][aria-label*="Trống"]')
          .first();
        await firstAvailable.waitFor({ state: "visible", timeout: 10000 });
        await firstAvailable.click();
        // Đợi menu pane hiện — search box xuất hiện khi vào menu mode
        await p
          .getByPlaceholder(/Tìm món/i)
          .waitFor({ state: "visible", timeout: 8000 });
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 80,
          placement: "below",
          text: "Bàn đã chọn → menu mở\nChọn món để thêm vào giỏ",
        },
      ],
    });
  });

  test("step-03-takeaway-tab", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureMinTables(ctx, 4);

    await captureScenario(page, browser, {
      id: "step-03-takeaway-tab",
      flowId: FLOW,
      module: MODULE,
      step: {
        number: 3,
        total: TOTAL,
        title: "Mang về — chuyển tab",
      },
      setup: async (p) => {
        await p.goto(`/br/${String(ctx.branchId)}/pos`);
        // Đợi tab Mang về visible
        const takeawayTab = p
          .getByRole("tab", { name: /Mang về/i })
          .or(p.locator('button:has-text("Mang về")').first());
        await takeawayTab.waitFor({ state: "visible", timeout: 10000 });
        await takeawayTab.click();
        // Đợi menu pane hiện
        await p
          .getByPlaceholder(/Tìm món/i)
          .waitFor({ state: "visible", timeout: 8000 });
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 100,
          placement: "below",
          text: "Mang về → menu mở\nKhông cần chọn bàn",
        },
      ],
    });
  });

  test("variant-multi-order", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    const occupied = await ensureOccupiedTableWithOrder(ctx);

    await captureScenario(page, browser, {
      id: "variant-multi-order",
      flowId: FLOW,
      module: MODULE,
      step: {
        number: 1,
        total: 1,
        title: `Variant — bàn ${String(occupied.tableNumber)} đang dùng`,
      },
      setup: async (p) => {
        await p.goto(`/br/${String(ctx.branchId)}/pos`);
        const occupiedBtn = p
          .locator('button[aria-label*="Đang dùng"]')
          .first();
        await occupiedBtn.waitFor({ state: "visible", timeout: 10000 });
        await occupiedBtn.click();
        await p
          .getByText(/Tạo đơn mới/i)
          .first()
          .waitFor({ state: "visible", timeout: 8000 });
      },
      annotations: [
        {
          type: "highlight",
          selector: 'button:has-text("Tạo đơn mới")',
        },
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 250,
          placement: "below",
          text: "Bàn đang có đơn:\nchọn đơn cũ HOẶC\ntạo đơn mới cùng bàn",
        },
      ],
    });
  });
});
