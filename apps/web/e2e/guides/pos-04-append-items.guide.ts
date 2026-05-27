/**
 * POS-04 Thêm món vào đơn đang phục vụ — capture spec.
 *
 * 5 main steps + 1 variant:
 *   step-01-open-order-detail  — chi tiết đơn (sheet) mở từ multi-order picker
 *   step-02-tap-add-items      — highlight nút "Thêm món"
 *   step-03-append-banner      — banner "Thêm món vào đơn #N" + menu
 *   step-04-draft-review       — pane "Món sẽ gửi thêm" với draft items
 *   step-05-submit-append      — highlight "Gửi món thêm"
 *   variant-cancel-append      — "Hủy thêm món" → quay về đơn không thêm
 *
 * Chạy: pnpm --filter @comtammatu/web guides:capture --grep="POS-04"
 *
 * Note: KHÔNG actually click submit — tránh tạo orphan order_items thật.
 */

import { test, type Page } from "@playwright/test";
import { captureScenario } from "./_lib/capture";
import {
  ensureOccupiedTableWithOrder,
  ensureSingleOpenSession,
  getCashierContext,
} from "./_lib/fixtures";

const FLOW = "pos-04";
const MODULE = "pos";
const TOTAL = 5;

/** Navigate POS → tap bàn occupied → tap order trong multi-order picker. */
async function gotoOrderDetail(p: Page, branchId: number): Promise<void> {
  await p.goto(`/br/${String(branchId)}/pos`);
  const occupiedBtn = p.locator('button[aria-label*="Đang dùng"]').first();
  await occupiedBtn.waitFor({ state: "visible", timeout: 10000 });
  await occupiedBtn.click();

  // Multi-order picker drawer opens — tap first order card
  await p
    .getByText(/Tạo đơn mới/i)
    .first()
    .waitFor({ state: "visible", timeout: 8000 });
  // Order card has order_number text matching GUIDE-{ts}
  const orderCard = p.locator('button:has-text("GUIDE-")').first();
  await orderCard.waitFor({ state: "visible", timeout: 5000 });
  await orderCard.click();

  // Order detail sheet opens — wait for "Thêm món" button visible
  await p
    .getByRole("button", { name: /Thêm món/i })
    .first()
    .waitFor({ state: "visible", timeout: 8000 });
}

async function enterAppendMode(p: Page): Promise<void> {
  const addBtn = p.getByRole("button", { name: /Thêm món/i }).first();
  await addBtn.click();
  // Banner / menu shows up — wait for "Thêm món vào đơn" heading or
  // Tìm món placeholder
  await p
    .getByPlaceholder(/Tìm món/i)
    .waitFor({ state: "visible", timeout: 8000 });
}

async function tapBasicMenuItem(p: Page): Promise<void> {
  const item = p
    .getByRole("button", { name: /Cơm Tấm Bì|Cơm Tấm Chả/i })
    .first();
  await item.waitFor({ state: "visible", timeout: 8000 });
  await item.click();
}

test.describe("POS-04 Thêm món vào đơn đang phục vụ", () => {
  test.describe.configure({ mode: "serial" });

  test("step-01-open-order-detail", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureOccupiedTableWithOrder(ctx);

    await captureScenario(page, browser, {
      id: "step-01-open-order-detail",
      flowId: FLOW,
      module: MODULE,
      step: { number: 1, total: TOTAL, title: "Mở chi tiết đơn" },
      setup: async (p) => {
        await gotoOrderDetail(p, ctx.branchId);
      },
      annotations: [
        {
          type: "callout",
          selector: 'button[aria-label*="Đóng chi tiết đơn"]',
          placement: "left",
          text: "Chi tiết đơn:\nmón, trạng thái,\ntổng tiền",
        },
      ],
    });
  });

  test("step-02-tap-add-items", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureOccupiedTableWithOrder(ctx);

    await captureScenario(page, browser, {
      id: "step-02-tap-add-items",
      flowId: FLOW,
      module: MODULE,
      step: { number: 2, total: TOTAL, title: 'Chạm "Thêm món"' },
      setup: async (p) => {
        await gotoOrderDetail(p, ctx.branchId);
        // Scroll to bottom of sheet to make sure "Thêm món" is visible
        await p
          .getByRole("button", { name: /Thêm món/i })
          .first()
          .scrollIntoViewIfNeeded();
      },
      annotations: [
        {
          type: "tap",
          selector: 'button:has-text("Thêm món")',
          label: "Thêm món",
        },
      ],
    });
  });

  test("step-03-append-banner", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureOccupiedTableWithOrder(ctx);

    await captureScenario(page, browser, {
      id: "step-03-append-banner",
      flowId: FLOW,
      module: MODULE,
      step: {
        number: 3,
        total: TOTAL,
        title: "Append mode — chọn món thêm",
      },
      setup: async (p) => {
        await gotoOrderDetail(p, ctx.branchId);
        await enterAppendMode(p);
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 80,
          placement: "below",
          text: "Banner xanh = đang\nthêm vào đơn cũ\n(không tạo đơn mới)",
        },
      ],
    });
  });

  test("step-04-draft-review", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureOccupiedTableWithOrder(ctx);

    await captureScenario(page, browser, {
      id: "step-04-draft-review",
      flowId: FLOW,
      module: MODULE,
      step: { number: 4, total: TOTAL, title: "Mở pane món thêm" },
      setup: async (p) => {
        await gotoOrderDetail(p, ctx.branchId);
        await enterAppendMode(p);
        await tapBasicMenuItem(p);
        // Mobile: action bar có button "Món thêm" thay vì "Giỏ đơn mới"
        const drawerBtn = p
          .getByRole("button", { name: /Món thêm|Mở món thêm/i })
          .first();
        await drawerBtn.waitFor({ state: "visible", timeout: 5000 });
        await drawerBtn.click();
        // Đợi pane "Món sẽ gửi thêm"
        await p
          .getByRole("button", { name: /Gửi món thêm/i })
          .waitFor({ state: "visible", timeout: 5000 });
      },
      annotations: [
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 280,
          placement: "below",
          text: "Danh sách món sẽ\nthêm vào đơn cũ\nKiểm tra trước khi gửi",
        },
      ],
    });
  });

  test("step-05-submit-append", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureOccupiedTableWithOrder(ctx);

    await captureScenario(page, browser, {
      id: "step-05-submit-append",
      flowId: FLOW,
      module: MODULE,
      step: { number: 5, total: TOTAL, title: "Gửi món thêm" },
      setup: async (p) => {
        await gotoOrderDetail(p, ctx.branchId);
        await enterAppendMode(p);
        await tapBasicMenuItem(p);
        const drawerBtn = p
          .getByRole("button", { name: /Món thêm|Mở món thêm/i })
          .first();
        await drawerBtn.click();
        await p
          .getByRole("button", { name: /Gửi món thêm/i })
          .waitFor({ state: "visible", timeout: 5000 });
      },
      annotations: [
        {
          type: "tap",
          selector: 'button:has-text("Gửi món thêm")',
          label: "Gửi món thêm",
        },
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 600,
          placement: "above",
          text: "Sau khi gửi:\n• KDS có ticket mới\n• Tổng đơn cập nhật",
        },
      ],
    });
  });

  test("variant-cancel-append", async ({ page, browser }) => {
    const ctx = await getCashierContext();
    await ensureSingleOpenSession(ctx);
    await ensureOccupiedTableWithOrder(ctx);

    await captureScenario(page, browser, {
      id: "variant-cancel-append",
      flowId: FLOW,
      module: MODULE,
      step: {
        number: 1,
        total: 1,
        title: "Variant — Hủy thêm món",
      },
      setup: async (p) => {
        await gotoOrderDetail(p, ctx.branchId);
        await enterAppendMode(p);
        await tapBasicMenuItem(p);
        const drawerBtn = p
          .getByRole("button", { name: /Món thêm|Mở món thêm/i })
          .first();
        await drawerBtn.click();
        await p
          .getByRole("button", { name: /Hủy thêm món/i })
          .waitFor({ state: "visible", timeout: 5000 });
      },
      annotations: [
        {
          type: "tap",
          selector: 'button:has-text("Hủy thêm món")',
          label: "Hủy thêm món",
        },
        {
          type: "callout-coord",
          anchorX: 195,
          anchorY: 600,
          placement: "above",
          text: "Hủy = bỏ toàn bộ\ndraft, đơn cũ giữ nguyên",
        },
      ],
    });
  });
});
