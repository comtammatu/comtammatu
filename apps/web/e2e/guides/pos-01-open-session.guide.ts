/**
 * POS-01 Mở ca POS — capture spec.
 *
 * Per-branch model (Owner D7, 2026-04-27): chi nhánh có tối đa 1 ca POS
 * active cùng lúc, mở ca không cần chọn terminal cụ thể. UI chỉ còn 1 ô
 * Tiền đầu ca + nút "Mở ca POS".
 *
 * 3 main steps + 1 variant:
 *   step-01-form-empty   — vào màn mở ca trống
 *   step-02-enter-cash   — focus ô tiền, nhập số
 *   step-03-ready        — form hợp lệ, button active
 *   step-04-pos-main     — vào màn POS chính sau khi mở
 *   variant-no-terminal  — chi nhánh chưa có máy POS (skip - destructive)
 *
 * Chạy: pnpm --filter @comtammatu/web guides:capture --grep="POS-01"
 */

import { test } from "@playwright/test";
import { captureScenario } from "./_lib/capture";
import {
  closeAllOpenSessions,
  ensureMinTerminals,
  getCashierContext,
} from "./_lib/fixtures";

const FLOW = "pos-01";
const MODULE = "pos";
const TOTAL = 4;

test.describe("POS-01 Mở ca POS", () => {
  test.describe.configure({ mode: "serial" });

  test("step-01-form-empty", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await closeAllOpenSessions(ctx);
    await ensureMinTerminals(ctx, 1);

    await captureScenario(page, browser, {
      id: "step-01-form-empty",
      flowId: FLOW,
      module: MODULE,
      step: { number: 1, total: TOTAL, title: "Vào màn hình mở ca" },
      setup: async (p) => {
        await p.goto(`/br/${String(ctx.branchId)}/pos`);
        await p.getByText("Mở ca bán hàng").waitFor({ state: "visible" });
      },
      annotations: [
        { type: "highlight", selector: "#opening-cash" },
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 130,
          placement: "below",
          text: "Card mở ca\nchỉ cần nhập tiền đầu ca",
        },
      ],
    });
  });

  test("step-02-enter-cash", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await closeAllOpenSessions(ctx);
    await ensureMinTerminals(ctx, 1);

    await captureScenario(page, browser, {
      id: "step-02-enter-cash",
      flowId: FLOW,
      module: MODULE,
      step: { number: 2, total: TOTAL, title: "Nhập tiền đầu ca" },
      setup: async (p) => {
        await p.goto(`/br/${String(ctx.branchId)}/pos`);
        await p.getByText("Mở ca bán hàng").waitFor({ state: "visible" });
        await p.locator("#opening-cash").focus();
      },
      annotations: [
        {
          type: "tap",
          selector: "#opening-cash",
          label: "Gõ tiền mặt thực tế",
        },
        {
          type: "callout-coord",
          anchorX: 200,
          anchorY: 380,
          placement: "above",
          text: "Số này dùng để\nđối soát cuối ca",
        },
      ],
    });
  });

  test("step-03-ready", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await closeAllOpenSessions(ctx);
    await ensureMinTerminals(ctx, 1);

    await captureScenario(page, browser, {
      id: "step-03-ready",
      flowId: FLOW,
      module: MODULE,
      step: { number: 3, total: TOTAL, title: "Sẵn sàng mở ca" },
      setup: async (p) => {
        await p.goto(`/br/${String(ctx.branchId)}/pos`);
        await p.getByText("Mở ca bán hàng").waitFor({ state: "visible" });
        await p.locator("#opening-cash").fill("500000");
        // Defocus to settle button state
        await p.locator("body").click({ position: { x: 5, y: 5 } });
      },
      annotations: [
        {
          type: "tap",
          selector: 'button:has-text("Mở ca POS")',
          label: "Chạm để mở ca",
        },
      ],
    });
  });

  test("step-04-pos-main", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await closeAllOpenSessions(ctx);
    await ensureMinTerminals(ctx, 1);

    await captureScenario(page, browser, {
      id: "step-04-pos-main",
      flowId: FLOW,
      module: MODULE,
      step: { number: 4, total: TOTAL, title: "Vào màn POS bán hàng" },
      setup: async (p) => {
        await p.goto(`/br/${String(ctx.branchId)}/pos`);
        await p.getByText("Mở ca bán hàng").waitFor({ state: "visible" });
        await p.locator("#opening-cash").fill("500000");
        await p.locator("body").click({ position: { x: 5, y: 5 } });
        await p.locator('button:has-text("Mở ca POS")').click();
        // Wait for redirect to POS main shell — header has "Chốt ca" button
        await p
          .getByRole("button", { name: /Chốt ca/i })
          .waitFor({ state: "visible", timeout: 15000 });
      },
      annotations: [
        {
          type: "callout",
          selector: 'button[aria-label*="Chốt ca POS"]',
          placement: "below",
          text: "Header POS chính:\nnút Chốt ca",
        },
      ],
    });
  });
});
