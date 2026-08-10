import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import {
  publicSelfOrderSnapshotSchema,
  selfOrderPaymentActionResponseSchema,
  selfOrderSubmitActionResponseSchema,
} from "../lib/self-order/contracts";

const publicSnapshot = {
  ok: true as const,
  state: "unopened" as const,
  branch: { name: "Chi nhánh thử nghiệm", phone: null, googleReviewUrl: null },
  table: { id: 4, number: 4 },
  openOrderCount: 0,
  order: null,
  rounds: [],
  request: null,
  paymentRequest: null,
  menu: [
    {
      id: 1,
      name: "Món chính",
      type: "food",
      sort_order: 1,
      menu_items: [
        {
          id: 2,
          name: "Cơm tấm sườn",
          description: null,
          base_price: 65_000,
          image_url: null,
          sort_order: 1,
          menu_item_variants: [],
          menu_item_modifiers: [
            { id: 3, name: "Trứng", price: 12_000, sort_order: 1 },
          ],
          menu_item_available_sides: [],
        },
      ],
    },
  ],
};

test("public snapshot accepts every derived guest state", () => {
  for (const state of [
    "unopened",
    "awaiting_confirmation",
    "rejected",
    "open",
    "payment_pending",
    "multiple_open_orders",
  ] as const) {
    assert.equal(
      publicSelfOrderSnapshotSchema.safeParse({
        ...publicSnapshot,
        state,
      }).success,
      true,
      state,
    );
  }
});

test("public snapshot accepts the stored request and current order shapes", () => {
  assert.equal(
    publicSelfOrderSnapshotSchema.safeParse({
      ...publicSnapshot,
      state: "awaiting_confirmation",
      request: {
        id: 8,
        clientOpId: "0b8c51aa-1e3a-4c4d-a407-1e37128959ac",
        status: "pending",
        items: [
          {
          key: "stored-cart-key",
            menu_item_id: 2,
            item_name: "Cơm tấm sườn",
            quantity: 1,
            unit_price: 65_000,
            modifiers: [],
            sides: [],
          },
        ],
        customerNote: null,
        orderId: null,
        createdAt: "2026-07-10T05:00:00.000Z",
        decidedAt: null,
      },
    }).success,
    true,
  );

  assert.equal(
    publicSelfOrderSnapshotSchema.safeParse({
      ...publicSnapshot,
      state: "open",
      openOrderCount: 1,
      order: {
        id: 12,
        orderNumber: "MT-12",
        status: "preparing",
        paymentStatus: "unpaid",
        paymentMethod: null,
        subtotal: 65_000,
        serviceCharge: 0,
        discountAmount: 0,
        totalAmount: 65_000,
        itemCount: 1,
        items: [
          {
            id: 20,
            menuItemId: 2,
            itemName: "Cơm tấm sườn",
            variantId: null,
            variantName: null,
            quantity: 1,
            unitPrice: 65_000,
            lineTotal: 65_000,
            modifiers: [],
            sides: [],
            note: null,
          },
        ],
      },
    }).success,
    true,
  );
});

test("public snapshot rejects retired capability and private buyer fields", () => {
  for (const field of [
    "capabilityVersion",
    "access",
    "deviceAccess",
    "session",
    "batches",
    "pendingBatch",
  ]) {
    assert.equal(
      publicSelfOrderSnapshotSchema.safeParse({
        ...publicSnapshot,
        [field]: field === "batches" ? [] : null,
      }).success,
      false,
      field,
    );
  }

  assert.equal(
    publicSelfOrderSnapshotSchema.safeParse({
      ...publicSnapshot,
      paymentRequest: {
        status: "cash_call",
        method: "cash_call",
        amount: 65_000,
        createdAt: "2026-07-10T05:00:00.000Z",
        buyerEmail: "guest@example.com",
      },
    }).success,
    false,
  );
});

test("public action contracts reject accidental internal or buyer data", () => {
  assert.equal(
    selfOrderSubmitActionResponseSchema.safeParse({
      ok: true,
      requestId: 8,
      status: "pending",
      total_amount: 65_000,
    }).success,
    false,
  );
  assert.equal(
    selfOrderPaymentActionResponseSchema.safeParse({
      ok: true,
      status: "cash_call",
      method: "cash_call",
      amount: 65_000,
      buyerName: "Private buyer",
    }).success,
    false,
  );
});

test("S2 copy distinguishes CTA, unavailable causes, awaiting, and rejection", () => {
  assert.equal(SELF_ORDER_VI.submitFirstBatch, "Gửi món");
  assert.equal(SELF_ORDER_VI.submitAddMore, "Gửi thêm món");
  assert.match(SELF_ORDER_VI.unavailableInvalidTokenDescription, /không hợp lệ/);
  assert.match(SELF_ORDER_VI.unavailableDisabledDescription, /không nhận gọi món/);
  assert.match(SELF_ORDER_VI.unavailablePosClosedDescription, /chưa mở/);
  assert.match(SELF_ORDER_VI.awaitingCalloutTitle, /chờ/i);
  assert.match(SELF_ORDER_VI.rejectedCalloutTitle, /từ chối/i);
  assert.equal(SELF_ORDER_VI.resubmitRejected, "Gửi lại");
});

test("server classifies the transitional unavailable code before public display", () => {
  const server = readFileSync(
    new URL("../lib/self-order/server.ts", import.meta.url),
    "utf8",
  );

  assert.match(server, /snapshot\.code !== "invalid_or_disabled_token"/);
  assert.match(server, /table \? "self_order_disabled" : "invalid_token"/);
  assert.match(server, /await normalizeUnavailableSnapshot\(token, parsed\.data\)/);
});

test("contracts contain no retired state vocabulary", () => {
  const contracts = readFileSync(
    join(process.cwd(), "lib/self-order/contracts.ts"),
    "utf8",
  );
  assert.doesNotMatch(
    contracts,
    /capabilityVersion|deviceAccess|seatingAccess|pendingBatch|realtimeTopic/,
  );
  assert.doesNotMatch(
    contracts,
    /SelfOrderGuestBatch|SelfOrderDevice|SelfOrderAccess/,
  );
});
