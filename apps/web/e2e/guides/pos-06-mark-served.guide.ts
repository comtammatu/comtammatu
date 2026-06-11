/**
 * POS-06 Mark served — capture spec.
 *
 * Purpose: make clear that `served` = food delivered to the table
 * (audit-only). It is NOT payment, and it does NOT lock later actions
 * (append/void/transfer still work). Typically used so KDS knows
 * everything went out, or so the waiter signals the cashier that serving
 * finished before payment.
 *
 * 3 main steps + 1 variant:
 *   step-01-order-detail     — order detail with the 4 action buttons visible
 *   step-02-tap-serve        — "Phục vụ" button highlighted
 *   step-03-still-payable    — pay button still present after serving
 *   variant-payment-warning  — "Đơn chưa đánh dấu đã phục vụ" warning in the
 *                              bill (a reminder, not a lock)
 *
 * Run: pnpm --filter @comtammatu/web guides:capture --grep="POS-06"
 */

import { test, type Page } from "@playwright/test";
import { captureScenario } from "./_lib/capture";
import {
  ensureOccupiedTableWithOrder,
  ensureSingleOpenSession,
  getCashierContext,
} from "./_lib/fixtures";

const FLOW = "pos-06";
const MODULE = "pos";
const TOTAL = 3;

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

test.describe("POS-06 Đánh dấu đã phục vụ", () => {
  test.describe.configure({ mode: "serial" });

  test("step-01-order-detail", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureOccupiedTableWithOrder(ctx);

    await captureScenario(page, browser, {
      id: "step-01-order-detail",
      flowId: FLOW,
      module: MODULE,
      step: { number: 1, total: TOTAL, title: "Mở chi tiết đơn" },
      setup: async (p) => {
        await gotoOrderDetail(p, ctx.branchId);
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 720,
          placement: "above",
          text: "4 nút action:\nThanh toán / Phục vụ\nThêm món / Chuyển bàn",
        },
      ],
    });
  });

  test("step-02-tap-serve", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureOccupiedTableWithOrder(ctx);

    await captureScenario(page, browser, {
      id: "step-02-tap-serve",
      flowId: FLOW,
      module: MODULE,
      step: { number: 2, total: TOTAL, title: 'Chạm "Phục vụ"' },
      setup: async (p) => {
        await gotoOrderDetail(p, ctx.branchId);
      },
      annotations: [
        {
          type: "tap",
          selector: 'button:has-text("Phục vụ")',
          label: "Phục vụ",
        },
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 720,
          placement: "above",
          text: "Đánh dấu món\nđã ra bàn xong\n(audit cho KDS / báo cáo)",
        },
      ],
    });
  });

  test("step-03-still-payable", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureOccupiedTableWithOrder(ctx);

    await captureScenario(page, browser, {
      id: "step-03-still-payable",
      flowId: FLOW,
      module: MODULE,
      step: {
        number: 3,
        total: TOTAL,
        title: "Phục vụ ≠ Thanh toán",
      },
      setup: async (p) => {
        await gotoOrderDetail(p, ctx.branchId);
        // Tap "Phục vụ" to flip the status
        const serveBtn = p.getByRole("button", { name: /^Phục vụ$/i }).first();
        await serveBtn.click();
        // Wait for the update — the button label or item badges may change
        await p.waitForTimeout(800);
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 700,
          placement: "above",
          text: "Sau khi phục vụ:\nnút Thanh toán\nVẪN còn → cần thu tiền",
        },
        {
          type: "tap",
          selector: 'button:has-text("Thanh toán")',
          label: "Phải bấm Thanh toán riêng",
        },
      ],
    });
  });

  test("variant-payment-warning", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureOccupiedTableWithOrder(ctx);

    await captureScenario(page, browser, {
      id: "variant-payment-warning",
      flowId: FLOW,
      module: MODULE,
      step: {
        number: 1,
        total: 1,
        title: "Variant — Cảnh báo trong bill",
      },
      setup: async (p) => {
        await gotoOrderDetail(p, ctx.branchId);
        // Tap pay → bill opens with the "chưa đánh dấu phục vụ" alert
        const payBtn = p
          .getByRole("button", { name: /Thanh toán\s*-/i })
          .first();
        await payBtn.click();
        await p
          .getByText(/Đơn chưa đánh dấu đã phục vụ/i)
          .waitFor({ state: "visible", timeout: 5000 });
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 230,
          placement: "below",
          text: "Cảnh báo (không khóa):\nvẫn thanh toán được\ndù chưa bấm Phục vụ",
        },
      ],
    });
  });
});
