/**
 * POS-07 Sửa đơn — chuyển bàn, hủy, tách, gộp — capture spec.
 *
 * Hub các thao tác chỉnh sửa đơn:
 *   - Chuyển bàn — di chuyển đơn sang bàn khác
 *   - Hủy đơn — hủy toàn bộ (cần lý do)
 *   - Tách hóa đơn — chia 1 đơn thành 2 (chia tiền cho khách)
 *   - Gộp hóa đơn — gộp nhiều đơn thành 1 (1 khách trả hết)
 *   - (Per-item void: vuốt món sang trái → mention trong markdown, không capture)
 *
 * 4 main steps + 1 variant:
 *   step-01-more-menu        — dropdown "Khác..." mở, thấy các option
 *   step-02-cancel-confirm   — dialog xác nhận Hủy đơn (cần lý do)
 *   step-03-transfer-picker  — picker chọn bàn mới
 *   step-04-split-flow       — UI tách hóa đơn
 *   variant-merge-flow       — UI gộp hóa đơn
 *
 * Chạy: pnpm --filter @comtammatu/web guides:capture --grep="POS-07"
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
    .getByRole("button", { name: /^Phục vụ$/i })
    .first()
    .waitFor({ state: "visible", timeout: 8000 });
}

async function openMoreMenu(p: Page): Promise<void> {
  const moreBtn = p.locator('button:has-text("Khác")').first();
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
        // AlertDialog "Hủy đơn ...?" + textarea Lý do
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
        // Đợi picker dialog/sheet với list bàn
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
        // Đợi split UI
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
    // Cần đơn thứ 2 cùng bàn cho merge available
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
        // Merge có thể disabled nếu không có đơn khác cùng bàn — capture as-is
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
