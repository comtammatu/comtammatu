/**
 * POS-01 Mở ca POS — capture spec.
 *
 * 5 main steps + 2 variants:
 *   step-01-form-empty       — vào màn mở ca trống
 *   step-02-pick-terminal    — danh sách máy POS đang xổ
 *   step-03-enter-cash       — đã chọn máy, focus vào ô tiền
 *   step-04-ready            — form hợp lệ, button active
 *   step-05-pos-main         — vào màn POS chính sau khi mở
 *   variant-all-occupied     — toàn bộ máy POS đã có ca mở
 *   variant-no-terminal      — chi nhánh chưa có máy POS (skip - destructive)
 *
 * Chạy: pnpm --filter @comtammatu/web guides:capture --grep="POS-01"
 */

import { test } from "@playwright/test";
import { captureScenario } from "./_lib/capture";
import {
  closeAllOpenSessions,
  ensureMinTerminals,
  getCashierContext,
  openSessionsOnAllTerminals,
} from "./_lib/fixtures";

const FLOW = "pos-01";
const MODULE = "pos";
const TOTAL = 5;

test.describe("POS-01 Mở ca POS", () => {
  test.describe.configure({ mode: "serial" });

  test("step-01-form-empty", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await closeAllOpenSessions(ctx);
    await ensureMinTerminals(ctx, 2);

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
        { type: "highlight", selector: "#terminal" },
        { type: "highlight", selector: "#opening-cash" },
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 130,
          placement: "below",
          text: "Card mở ca\ngồm 2 ô bắt buộc",
        },
      ],
    });
  });

  test("step-02-pick-terminal", async ({ page, browser }) => {
    // Note: Radix Select render listbox qua portal ở body level — khi
    // screenshot viewport mobile, portal hay bị clipped/dismiss do focus
    // shift. Capture trigger + callout giải thích thao tác là đủ; danh
    // sách máy POS được mô tả bằng text trong markdown.
    const ctx = await getCashierContext();
    await closeAllOpenSessions(ctx);
    await ensureMinTerminals(ctx, 2);

    await captureScenario(page, browser, {
      id: "step-02-pick-terminal",
      flowId: FLOW,
      module: MODULE,
      step: { number: 2, total: TOTAL, title: "Chọn máy POS" },
      setup: async (p) => {
        await p.goto(`/br/${String(ctx.branchId)}/pos`);
        await p.getByText("Mở ca bán hàng").waitFor({ state: "visible" });
      },
      annotations: [
        {
          type: "tap",
          selector: "#terminal",
          label: "Chạm để mở danh sách",
        },
        {
          type: "callout",
          selector: "#terminal",
          placement: "below",
          text: "Chọn máy POS\nbạn đang ngồi",
        },
      ],
    });
  });

  test("step-03-enter-cash", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await closeAllOpenSessions(ctx);
    await ensureMinTerminals(ctx, 2);

    await captureScenario(page, browser, {
      id: "step-03-enter-cash",
      flowId: FLOW,
      module: MODULE,
      step: { number: 3, total: TOTAL, title: "Nhập tiền đầu ca" },
      setup: async (p) => {
        await p.goto(`/br/${String(ctx.branchId)}/pos`);
        await p.getByText("Mở ca bán hàng").waitFor({ state: "visible" });
        await p.locator("#terminal").click();
        // Click first non-disabled item
        await p.locator("[role='option']:not([data-disabled])").first().click();
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
          anchorY: 480,
          placement: "above",
          text: "Số này dùng để\nđối soát cuối ca",
        },
      ],
    });
  });

  test("step-04-ready", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await closeAllOpenSessions(ctx);
    await ensureMinTerminals(ctx, 2);

    await captureScenario(page, browser, {
      id: "step-04-ready",
      flowId: FLOW,
      module: MODULE,
      step: { number: 4, total: TOTAL, title: "Sẵn sàng mở ca" },
      setup: async (p) => {
        await p.goto(`/br/${String(ctx.branchId)}/pos`);
        await p.getByText("Mở ca bán hàng").waitFor({ state: "visible" });
        await p.locator("#terminal").click();
        await p.locator("[role='option']:not([data-disabled])").first().click();
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

  test("step-05-pos-main", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await closeAllOpenSessions(ctx);
    await ensureMinTerminals(ctx, 2);

    await captureScenario(page, browser, {
      id: "step-05-pos-main",
      flowId: FLOW,
      module: MODULE,
      step: { number: 5, total: TOTAL, title: "Vào màn POS bán hàng" },
      setup: async (p) => {
        await p.goto(`/br/${String(ctx.branchId)}/pos`);
        await p.getByText("Mở ca bán hàng").waitFor({ state: "visible" });
        await p.locator("#terminal").click();
        await p.locator("[role='option']:not([data-disabled])").first().click();
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
          type: "callout-coord",
          anchorX: 195,
          anchorY: 30,
          placement: "below",
          text: "Header: tên máy POS\n+ nút Chốt ca",
        },
      ],
    });
  });

  test("variant-multi-session-picker", async ({ page, browser }) => {
    // Khi branch có 2+ ca POS đang mở (mọi máy có ca), page route tới
    // MultiSessionPicker thay vì SessionGate. Đây là surface chính của
    // tình huống "không có máy POS trống để mở ca mới".
    //
    // (Alert "Tất cả máy đang có ca mở" trong SessionGate thực tế là dead
    // path: SessionGate chỉ render khi openSessions.length===0, mà điều
    // này nghĩa là không có máy nào occupied.)
    const ctx = await getCashierContext();
    await closeAllOpenSessions(ctx);
    await ensureMinTerminals(ctx, 2);
    await openSessionsOnAllTerminals(ctx);

    await captureScenario(page, browser, {
      id: "variant-multi-session-picker",
      flowId: FLOW,
      module: MODULE,
      step: {
        number: 1,
        total: 1,
        title: "Variant — chọn ca POS đang mở",
      },
      setup: async (p) => {
        await p.goto(`/br/${String(ctx.branchId)}/pos`);
        await p
          .getByText(/Chọn máy POS bạn đang dùng/i)
          .waitFor({ state: "visible", timeout: 8000 });
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 100,
          placement: "below",
          text: "Đã có ca mở trên\nmáy bạn → chạm\n\"Dùng máy này\"",
        },
      ],
    });
    // Cleanup so subsequent runs start fresh
    await closeAllOpenSessions(ctx);
  });
});
