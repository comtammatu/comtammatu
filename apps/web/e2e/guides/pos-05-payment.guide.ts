/**
 * POS-05 Pay an order — capture spec.
 *
 * The bill sheet is ALL-IN-ONE: a single sheet holds the method picker,
 * tendered input, quick amount chips, e-invoice checkbox and the cancel /
 * confirm / provisional-print actions. There is no separate cash dialog.
 *
 * 4 main steps + 1 variant:
 *   step-01-open-bill         — bill sheet open ("Tiền mặt" selected by default)
 *   step-02-cash-amount       — quick amount chips fill the tendered total
 *   step-03-invoice-toggle    — e-invoice checkbox
 *   step-04-confirm           — "Đã thanh toán" button
 *   variant-transfer          — "Chuyển khoản" selected → QR / banking info
 *
 * Run: pnpm --filter @comtammatu/web guides:capture --grep="POS-05"
 *
 * Note: KHÔNG actually click "Đã thanh toán" — tránh đổi đơn fixture sang
 * `paid` (sẽ phá variant POS-04 / POS-05 lần chạy sau).
 */

import { test, type Page } from "@playwright/test";
import { captureScenario } from "./_lib/capture";
import {
  ensureOccupiedTableWithOrder,
  ensureSingleOpenSession,
  getCashierContext,
} from "./_lib/fixtures";

const FLOW = "pos-05";
const MODULE = "pos";
const TOTAL = 4;

/** Navigate POS → bàn occupied → order detail → tap Thanh toán → bill sheet. */
async function gotoBillSheet(p: Page, branchId: number): Promise<void> {
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
  const payBtn = p.getByRole("button", { name: /Thanh toán\s*-/i }).first();
  await payBtn.waitFor({ state: "visible", timeout: 8000 });
  await payBtn.click();
  // Bill sheet — wait for "Phương thức thanh toán" header
  await p
    .getByText(/Phương thức thanh toán/i)
    .waitFor({ state: "visible", timeout: 8000 });
}

test.describe("POS-05 Thanh toán đơn", () => {
  test.describe.configure({ mode: "serial" });

  test("step-01-open-bill", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureOccupiedTableWithOrder(ctx);

    await captureScenario(page, browser, {
      id: "step-01-open-bill",
      flowId: FLOW,
      module: MODULE,
      step: { number: 1, total: TOTAL, title: "Mở hóa đơn" },
      setup: async (p) => {
        await gotoBillSheet(p, ctx.branchId);
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 130,
          placement: "below",
          text: "Hóa đơn:\nmón + tổng tiền\n+ phương thức",
        },
      ],
    });
  });

  test("step-02-cash-amount", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureOccupiedTableWithOrder(ctx);

    await captureScenario(page, browser, {
      id: "step-02-cash-amount",
      flowId: FLOW,
      module: MODULE,
      step: { number: 2, total: TOTAL, title: "Nhập tiền khách đưa" },
      setup: async (p) => {
        await gotoBillSheet(p, ctx.branchId);
        // Click the FIRST chip above the order total (overpay → change due).
        // The chip set is generated from the total → no hardcoded 20k/30k,
        // the fixture amounts can change.
        const chip = p
          .locator("button")
          .filter({ hasText: /^\s*\d+\.\d+đ\s*$/ })
          .nth(1);
        await chip.click().catch(() => {
          // No suitable chip — capture as-is (tendered defaults to the total)
        });
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 480,
          placement: "above",
          text: "Chip mệnh giá nhanh\nhoặc gõ số tiền\n→ tiền thừa tự tính",
        },
      ],
    });
  });

  test("step-03-invoice-toggle", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureOccupiedTableWithOrder(ctx);

    await captureScenario(page, browser, {
      id: "step-03-invoice-toggle",
      flowId: FLOW,
      module: MODULE,
      step: { number: 3, total: TOTAL, title: "Hóa đơn điện tử (tùy chọn)" },
      setup: async (p) => {
        await gotoBillSheet(p, ctx.branchId);
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 600,
          placement: "above",
          text: 'Tick "Xuất hóa đơn điện tử"\nnếu khách yêu cầu HĐĐT\n(tự gửi sau khi xác nhận)',
        },
      ],
    });
  });

  test("step-04-confirm", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureOccupiedTableWithOrder(ctx);

    await captureScenario(page, browser, {
      id: "step-04-confirm",
      flowId: FLOW,
      module: MODULE,
      step: { number: 4, total: TOTAL, title: "Xác nhận thanh toán" },
      setup: async (p) => {
        await gotoBillSheet(p, ctx.branchId);
        const confirmBtn = p
          .getByRole("button", { name: /Đã thanh toán/i })
          .first();
        await confirmBtn.scrollIntoViewIfNeeded().catch(() => {});
      },
      annotations: [
        {
          type: "tap",
          selector: 'button:has-text("Đã thanh toán")',
          label: "Đã thanh toán",
        },
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 700,
          placement: "above",
          text: "Sau khi xác nhận:\n• Đơn → paid\n• Bàn → trống\n• Toast HĐĐT (nếu có)",
        },
      ],
    });
  });

  test("variant-transfer", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureOccupiedTableWithOrder(ctx);

    await captureScenario(page, browser, {
      id: "variant-transfer",
      flowId: FLOW,
      module: MODULE,
      step: {
        number: 1,
        total: 1,
        title: "Variant — Chuyển khoản (VietQR)",
      },
      setup: async (p) => {
        await gotoBillSheet(p, ctx.branchId);
        const transferBtn = p
          .locator('button:has-text("Chuyển khoản")')
          .first();
        await transferBtn.scrollIntoViewIfNeeded().catch(() => {});
        await transferBtn.click();
        // Wait for the QR / banking info to appear
        await p.waitForTimeout(800);
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 350,
          placement: "below",
          text: "Đưa điện thoại khách\nquét QR — chuyển khoản\nxong rồi Đã thanh toán",
        },
      ],
    });
  });
});
