/**
 * POS-08 Xử lý ngoại lệ — mất mạng / máy in lỗi / HĐĐT lỗi.
 *
 * 3 main steps + 1 variant:
 *   step-01-printer-status   — badge máy in trên header (online/offline)
 *   step-02-offline-banner   — banner "Mất kết nối" khi mạng rớt
 *   step-03-offline-bill     — bill khi offline (nút thanh toán cảnh báo)
 *   variant-hddt-toast       — text mô tả 3 trạng thái HĐĐT toast
 *
 * Chạy: pnpm --filter @comtammatu/web guides:capture --grep="POS-08"
 *
 * Note: dùng `context.setOffline(true)` mô phỏng mất mạng.
 */

import { test, type Page } from "@playwright/test";
import { captureScenario } from "./_lib/capture";
import {
  ensureOccupiedTableWithOrder,
  ensureSingleOpenSession,
  getCashierContext,
} from "./_lib/fixtures";

const FLOW = "pos-08";
const MODULE = "pos";
const TOTAL = 3;

async function gotoPosMain(p: Page, branchId: number): Promise<void> {
  await p.goto(`/br/${String(branchId)}/pos`);
  await p
    .getByRole("button", { name: /Chốt ca/i })
    .first()
    .waitFor({ state: "visible", timeout: 10000 });
}

test.describe("POS-08 Xử lý ngoại lệ", () => {
  test.describe.configure({ mode: "serial" });

  test("step-01-printer-status", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);

    await captureScenario(page, browser, {
      id: "step-01-printer-status",
      flowId: FLOW,
      module: MODULE,
      step: { number: 1, total: TOTAL, title: "Trạng thái máy in trên header" },
      setup: async (p) => {
        await gotoPosMain(p, ctx.branchId);
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 100,
          placement: "below",
          text: "Badge \"Máy in: online/offline\"\nhiện ở header POS\n(nếu chưa setup printer agent\n→ không hiện)",
        },
      ],
    });
  });

  test("step-02-offline-banner", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);

    await captureScenario(page, browser, {
      id: "step-02-offline-banner",
      flowId: FLOW,
      module: MODULE,
      step: { number: 2, total: TOTAL, title: "Banner \"Mất kết nối\"" },
      setup: async (p) => {
        await gotoPosMain(p, ctx.branchId);
        // Mock offline KHÔNG cắt network thật (tránh Next dev chunk
        // ChunkLoadError overlay che màn hình). Chỉ override navigator.onLine
        // + dispatch event để OnlineStatusProvider re-render banner.
        await p.evaluate(() => {
          Object.defineProperty(navigator, "onLine", {
            value: false,
            configurable: true,
          });
          window.dispatchEvent(new Event("offline"));
        });
        await p
          .getByText(/Mất kết nối/i)
          .waitFor({ state: "visible", timeout: 5000 });
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 100,
          placement: "below",
          text: "Mất mạng:\nbanner đỏ hiện ngay\n→ không tạo/thu đơn được",
        },
      ],
    });
  });

  test("step-03-offline-bill", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureOccupiedTableWithOrder(ctx);

    await captureScenario(page, browser, {
      id: "step-03-offline-bill",
      flowId: FLOW,
      module: MODULE,
      step: {
        number: 3,
        total: TOTAL,
        title: "Bill khi mất mạng",
      },
      setup: async (p) => {
        // Vào bill TRƯỚC khi offline (cần network để fetch order detail)
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
        const orderCard = p.locator('button:has-text("GUIDE-")').first();
        await orderCard.click();
        const payBtn = p
          .getByRole("button", { name: /Thanh toán\s*-/i })
          .first();
        await payBtn.click();
        await p
          .getByText(/Phương thức thanh toán/i)
          .waitFor({ state: "visible", timeout: 8000 });
        // Mock offline (xem ghi chú step-02)
        await p.evaluate(() => {
          Object.defineProperty(navigator, "onLine", {
            value: false,
            configurable: true,
          });
          window.dispatchEvent(new Event("offline"));
        });
        await p.waitForTimeout(500);
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 100,
          placement: "below",
          text: "Bill vẫn xem được\nNHƯNG \"Đã thanh toán\"\nchặn vì offline",
        },
      ],
    });

    // Cleanup — restore online (page sẽ chết end-of-test, không cần)
  });

  test("variant-hddt-toast", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);

    // Capture 1 màn POS chính bình thường để minh họa text-mode về 3 toast
    await captureScenario(page, browser, {
      id: "variant-hddt-toast",
      flowId: FLOW,
      module: MODULE,
      step: {
        number: 1,
        total: 1,
        title: "Variant — 3 trạng thái toast HĐĐT",
      },
      setup: async (p) => {
        await gotoPosMain(p, ctx.branchId);
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 250,
          placement: "below",
          text: "3 toast sau \"Đã thanh toán\":\n✓ Đã thanh toán & xuất HĐĐT\n✓ Đã thanh toán — không HĐĐT\n⚠ Đã thu tiền — HĐĐT lỗi",
        },
      ],
    });
  });
});
