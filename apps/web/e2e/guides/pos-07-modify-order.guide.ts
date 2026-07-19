/**
 * POS-07 Modify order — transfer / cancel / split / merge — capture spec.
 *
 * Landing for the order-modification actions:
 *   - "Chuyển bàn" — move the order to another table
 *   - "Hủy đơn" — cancel the whole order (reason required)
 *   - "Tách hóa đơn" — split one order into two (split the bill)
 *   - "Gộp hóa đơn" — merge orders into one (one customer pays all)
 *   - (Per-item void: swipe left — mentioned in the markdown, not captured)
 *
 * 4 main steps + 1 variant:
 *   step-01-more-menu        — "Khác..." dropdown open, options visible
 *   step-02-cancel-confirm   — cancel confirmation dialog (reason required)
 *   step-03-transfer-picker  — new-table picker
 *   step-04-split-flow       — split-bill UI
 *   variant-merge-flow       — merge-bill UI
 *
 * Run: pnpm --filter @comtammatu/web guides:capture --grep="POS-07"
 */

import { test, type Page } from "@playwright/test";
import { captureScenario } from "./_lib/capture";
import {
  ensureOccupiedTableWithOrder,
  ensureSecondOrderSameTable,
  ensureSingleOpenSession,
  getCashierContext,
} from "./_lib/fixtures";

const FLOW = "pos-07";
const MODULE = "pos";
const TOTAL = 4;

async function gotoOrderDetail(p: Page, branchId: number): Promise<void> {
  await p.goto(`/br/${String(branchId)}/pos`);
  const occupiedBtn = p.locator('button[aria-label*="Đang dùng"]').first();
  await occupiedBtn.waitFor({ state: "visible", timeout: 10000 });
  await occupiedBtn.click();
  await p
    .getByText(/Tạo đơn mới/i)
    .first()
    .waitFor({ state: "visible", timeout: 8000 });
  const orderCard = p.locator('button:has-text("GUIDE-")').first();
  await orderCard.click();
  await p
    .getByRole("button", { name: /Thanh toán/i })
    .first()
    .waitFor({ state: "visible", timeout: 8000 });
}

async function openMoreMenu(p: Page): Promise<void> {
  const moreBtn = p.getByRole("button", { name: "Thao tác khác" }).first();
  await moreBtn.waitFor({ state: "visible", timeout: 5000 });
  await moreBtn.click();
  await p
    .getByRole("menuitem", { name: /Hủy đơn/i })
    .waitFor({ state: "visible", timeout: 5000 });
}

test.describe("POS-07 Sửa đơn — chuyển bàn / hủy / tách / gộp", () => {
  test.describe.configure({ mode: "serial" });

  test("step-01-more-menu", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureOccupiedTableWithOrder(ctx);

    await captureScenario(page, browser, {
      id: "step-01-more-menu",
      flowId: FLOW,
      module: MODULE,
      step: { number: 1, total: TOTAL, title: 'Mở menu "Khác…"' },
      setup: async (p) => {
        await gotoOrderDetail(p, ctx.branchId);
        await openMoreMenu(p);
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 320,
          placement: "below",
          text: "Menu phụ:\nChiết khấu / Tách\nGộp / Hủy đơn",
        },
      ],
    });
  });

  test("step-02-cancel-confirm", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureOccupiedTableWithOrder(ctx);

    await captureScenario(page, browser, {
      id: "step-02-cancel-confirm",
      flowId: FLOW,
      module: MODULE,
      step: { number: 2, total: TOTAL, title: "Hủy đơn — xác nhận" },
      setup: async (p) => {
        await gotoOrderDetail(p, ctx.branchId);
        await openMoreMenu(p);
        const cancelItem = p
          .getByRole("menuitem", { name: /Hủy đơn/i })
          .first();
        await cancelItem.click();
        // "Hủy đơn ...?" AlertDialog + reason textarea
        await p
          .getByPlaceholder(/Lý do/i)
          .waitFor({ state: "visible", timeout: 5000 });
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 280,
          placement: "below",
          text: "Phải nhập lý do\n(≥5 ký tự) — audit\nlý do hủy đơn",
        },
      ],
    });
  });

  test("step-03-transfer-picker", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureOccupiedTableWithOrder(ctx);

    await captureScenario(page, browser, {
      id: "step-03-transfer-picker",
      flowId: FLOW,
      module: MODULE,
      step: {
        number: 3,
        total: TOTAL,
        title: "Chuyển bàn — chọn bàn mới",
      },
      setup: async (p) => {
        await gotoOrderDetail(p, ctx.branchId);
        const transferBtn = p
          .getByRole("button", { name: /Chuyển bàn/i })
          .first();
        await transferBtn.click();
        // Wait for the picker dialog/sheet with the table list
        await p
          .getByText(/Chọn bàn|Bàn đích/i)
          .first()
          .waitFor({ state: "visible", timeout: 5000 })
          .catch(() => {
            // Fallback — wait for any "Bàn" text in dialog
          });
        await p.waitForTimeout(500);
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 280,
          placement: "below",
          text: "Chọn bàn trống\nđể chuyển đơn sang\n(bàn cũ tự về Trống)",
        },
      ],
    });
  });

  test("step-04-split-flow", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureOccupiedTableWithOrder(ctx);

    await captureScenario(page, browser, {
      id: "step-04-split-flow",
      flowId: FLOW,
      module: MODULE,
      step: { number: 4, total: TOTAL, title: "Tách hóa đơn" },
      setup: async (p) => {
        await gotoOrderDetail(p, ctx.branchId);
        await openMoreMenu(p);
        const splitItem = p
          .getByRole("menuitem", { name: /Tách hóa đơn|Tách hóa đơn/i })
          .first();
        await splitItem.click();
        // Wait for the split UI
        await p.waitForTimeout(800);
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 280,
          placement: "below",
          text: "Tách: chọn món/qty\nchuyển sang đơn mới\n(chia hóa đơn cho khách)",
        },
      ],
    });
  });

  test("variant-merge-flow", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    const occupied = await ensureOccupiedTableWithOrder(ctx);
    // A 2nd order on the same table is required for merge to be available
    await ensureSecondOrderSameTable(ctx, occupied.tableId);

    await captureScenario(page, browser, {
      id: "variant-merge-flow",
      flowId: FLOW,
      module: MODULE,
      step: {
        number: 1,
        total: 1,
        title: "Variant — Gộp hóa đơn",
      },
      setup: async (p) => {
        await gotoOrderDetail(p, ctx.branchId);
        await openMoreMenu(p);
        const mergeItem = p
          .getByRole("menuitem", { name: /Gộp hóa đơn|Gộp hóa đơn/i })
          .first();
        // Merge can be disabled when no other order shares the table — capture as-is
        await mergeItem.click().catch(() => {});
        await p.waitForTimeout(800);
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 280,
          placement: "below",
          text: "Gộp: chọn đơn khác\ncùng bàn → gộp món\n+ tổng vào đơn này",
        },
      ],
    });
  });
});
