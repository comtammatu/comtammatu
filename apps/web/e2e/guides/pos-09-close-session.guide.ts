/**
 * POS-09 Đóng ca POS — capture spec.
 *
 * Cashier chốt ca cuối ngày: đếm tiền mặt cuối ca theo mệnh giá → hệ
 * thống tự tính chênh lệch (closing - opening - cash payments) → ghi chú
 * lý do (nếu lệch) → confirm chốt.
 *
 * 4 main steps + 1 variant:
 *   step-01-tap-close-shift   — nút "Chốt ca" trên header
 *   step-02-close-sheet       — sheet "Đóng ca bán hàng" mở
 *   step-03-difference        — nhập tiền cuối → chênh lệch hiện
 *   step-04-confirm           — confirm chốt với chênh lệch
 *   variant-significant-diff  — cảnh báo chênh lệch lớn
 *
 * Chạy: pnpm --filter @comtammatu/web guides:capture --grep="POS-09"
 *
 * Note: KHÔNG actually click confirm — nếu chốt ca, cashier auth phải mở
 * lại ca cho các test khác (phá serial state).
 */

import { test, type Page } from "@playwright/test";
import { captureScenario } from "./_lib/capture";
import { ensureSingleOpenSession, getCashierContext } from "./_lib/fixtures";

const FLOW = "pos-09";
const MODULE = "pos";
const TOTAL = 4;

async function gotoPosMain(p: Page, branchId: number): Promise<void> {
  await p.goto(`/br/${String(branchId)}/pos`);
  // Đợi nút Chốt ca trên header
  await p
    .getByRole("button", { name: /Chốt ca/i })
    .first()
    .waitFor({ state: "visible", timeout: 10000 });
}

async function openCloseSheet(p: Page): Promise<void> {
  const closeBtn = p
    .getByRole("button", { name: /Chốt ca POS|^Chốt ca$/i })
    .first();
  await closeBtn.click();
  // Đợi sheet "Đóng ca bán hàng"
  await p
    .getByText(/Đóng ca bán hàng/i)
    .waitFor({ state: "visible", timeout: 5000 });
}

test.describe("POS-09 Đóng ca POS", () => {
  test.describe.configure({ mode: "serial" });

  test("step-01-tap-close-shift", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);

    await captureScenario(page, browser, {
      id: "step-01-tap-close-shift",
      flowId: FLOW,
      module: MODULE,
      step: { number: 1, total: TOTAL, title: 'Chạm "Chốt ca" trên header' },
      setup: async (p) => {
        await gotoPosMain(p, ctx.branchId);
      },
      annotations: [
        {
          type: "tap",
          selector: 'button[aria-label*="Chốt ca POS"]',
          label: "Chốt ca",
        },
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 100,
          placement: "below",
          text: 'Cuối ca: chạm\n"Chốt ca" góc phải header',
        },
      ],
    });
  });

  test("step-02-close-sheet", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);

    await captureScenario(page, browser, {
      id: "step-02-close-sheet",
      flowId: FLOW,
      module: MODULE,
      step: { number: 2, total: TOTAL, title: "Sheet đóng ca mở" },
      setup: async (p) => {
        await gotoPosMain(p, ctx.branchId);
        await openCloseSheet(p);
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 250,
          placement: "below",
          text: "Đếm tiền mặt cuối ca\ntheo mệnh giá\n(500k / 200k / 100k...)",
        },
      ],
    });
  });

  test("step-03-difference", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);

    await captureScenario(page, browser, {
      id: "step-03-difference",
      flowId: FLOW,
      module: MODULE,
      step: {
        number: 3,
        total: TOTAL,
        title: "Hệ thống tự tính chênh lệch",
      },
      setup: async (p) => {
        await gotoPosMain(p, ctx.branchId);
        await openCloseSheet(p);
        // Nhập 1 mệnh giá để chênh lệch hiện
        // Find any number input và fill 1
        const firstInput = p
          .locator('input[inputmode="numeric"], input[type="number"]')
          .first();
        await firstInput.waitFor({ state: "visible", timeout: 5000 });
        await firstInput.fill("1");
        await p.waitForTimeout(500);
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 500,
          placement: "above",
          text: "Tiền cuối - tiền đầu\n- thu tiền mặt\n= Chênh lệch (lệch két)",
        },
      ],
    });
  });

  test("step-04-confirm", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);

    await captureScenario(page, browser, {
      id: "step-04-confirm",
      flowId: FLOW,
      module: MODULE,
      step: { number: 4, total: TOTAL, title: "Confirm chốt ca" },
      setup: async (p) => {
        await gotoPosMain(p, ctx.branchId);
        await openCloseSheet(p);
        // Nhập 1 mệnh giá nhỏ để confirm button enabled
        const firstInput = p
          .locator('input[inputmode="numeric"], input[type="number"]')
          .first();
        await firstInput.waitFor({ state: "visible", timeout: 5000 });
        await firstInput.fill("5");
        // Page Down để cuộn sheet đến nút confirm — KHÔNG dùng locator
        // scrollIntoViewIfNeeded vì nó match cả button header → Radix
        // sheet auto-dismiss khi focus outside.
        await p.keyboard.press("End");
        await p.waitForTimeout(300);
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 700,
          placement: "above",
          text: "Sau khi chốt:\n• Ca → closed\n• Báo cáo end-of-shift\n• Phải mở ca mới để bán tiếp",
        },
      ],
    });
  });

  test("variant-significant-diff", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);

    await captureScenario(page, browser, {
      id: "variant-significant-diff",
      flowId: FLOW,
      module: MODULE,
      step: {
        number: 1,
        total: 1,
        title: "Variant — chênh lệch lớn cần ghi chú",
      },
      setup: async (p) => {
        await gotoPosMain(p, ctx.branchId);
        await openCloseSheet(p);
        // Nhập 1 mệnh giá 500k (large) để trigger significant diff
        const firstInput = p
          .locator('input[inputmode="numeric"], input[type="number"]')
          .first();
        await firstInput.fill("3");
        await p.waitForTimeout(500);
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 600,
          placement: "above",
          text: "Chênh lệch >50k\n→ phải nhập ghi chú\nlý do (audit)",
        },
      ],
    });
  });
});
