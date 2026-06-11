/**
 * POS-01 Open POS shift — capture spec.
 *
 * Per-branch model (D7): a branch has at most one active POS session, and
 * opening a shift does not require picking a terminal. The UI is just one
 * opening-cash field + the "Mở ca POS" button.
 *
 * 3 main steps + 1 variant:
 *   step-01-form-empty   — empty open-shift screen
 *   step-02-enter-cash   — cash field focused, amount typed
 *   step-03-ready        — form valid, button active
 *   step-04-pos-main     — POS main screen after opening
 *   variant-no-terminal  — branch without a POS terminal (skip - destructive)
 *
 * Run: pnpm --filter @comtammatu/web guides:capture --grep="POS-01"
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
