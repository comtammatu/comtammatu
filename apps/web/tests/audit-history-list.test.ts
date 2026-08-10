import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AUDIT_ACTION_LABELS_VI,
  INVENTORY_AUDIT_ACTION_CODES,
  formatAuditActionLabel,
} from "@comtammatu/shared/messages";

test("inventory audit action dictionary covers every catalogued writer code", () => {
  for (const code of INVENTORY_AUDIT_ACTION_CODES) {
    assert.ok(
      code in AUDIT_ACTION_LABELS_VI,
      `missing label for ${code}`,
    );
    const label = formatAuditActionLabel(code);
    assert.notEqual(label, code);
    assert.doesNotMatch(label, /^inventory\./);
    assert.notEqual(label, "Không xác định");
  }
});

test("formatAuditActionLabel never surfaces raw codes or Không xác định", () => {
  assert.equal(
    formatAuditActionLabel("inventory.grn.confirmed"),
    "Xác nhận phiếu nhập",
  );
  assert.equal(
    formatAuditActionLabel("inventory.request.saved_submitted"),
    "Lưu và gửi yêu cầu hàng",
  );
  assert.equal(
    formatAuditActionLabel("inventory.transfer.cancelled"),
    "Huỷ phiếu điều chuyển",
  );
  assert.equal(
    formatAuditActionLabel("inventory.grn.brand_new_future_action"),
    "Cập nhật phiếu nhập",
  );
  assert.equal(formatAuditActionLabel("totally.unknown"), "Cập nhật dữ liệu");
  assert.equal(
    formatAuditActionLabel("Đã cấp · Xem đơn · toàn quán"),
    "Đã cấp · Xem đơn · toàn quán",
  );
});

test("AuditHistoryList renders Vietnamese action and actor without UUIDs or raw codes", async () => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  const { AuditHistoryList } =
    await import("../app/components/audit-history-list");
  const userId = "50f3d810-a3a1-4013-8300-95af5223dee7";
  const html = renderToStaticMarkup(
    React.createElement(AuditHistoryList, {
      logs: [
        {
          id: 68,
          action: "inventory.grn.saved",
          entityType: "goods_received_note",
          entityId: "17",
          userId,
          actorName: "Thục",
          createdAt: "2026-07-30T02:53:23.389224Z",
        },
        {
          id: 69,
          action: "inventory.grn.confirmed",
          entityType: "goods_received_note",
          entityId: "17",
          userId,
          actorName: "Thục",
          createdAt: "2026-07-30T03:00:00.000000Z",
        },
        {
          id: 70,
          action: "inventory.request.cancelled",
          entityType: "stock_request",
          entityId: "9",
          userId,
          actorName: "Thục",
          createdAt: "2026-07-30T04:00:00.000000Z",
        },
        {
          id: 71,
          action: "inventory.transfer.cancelled",
          entityType: "stock_transfer",
          entityId: "3",
          userId,
          actorName: "Thục",
          createdAt: "2026-07-30T05:00:00.000000Z",
        },
      ],
    }),
  );

  assert.match(html, /Lưu phiếu nhập/);
  assert.match(html, /Xác nhận phiếu nhập/);
  assert.match(html, /Huỷ yêu cầu hàng/);
  assert.match(html, /Huỷ phiếu điều chuyển/);
  assert.match(html, /Thục/);
  assert.doesNotMatch(html, new RegExp(userId));
  assert.doesNotMatch(html, /inventory\.grn/);
  assert.doesNotMatch(html, /Không xác định/);
});
