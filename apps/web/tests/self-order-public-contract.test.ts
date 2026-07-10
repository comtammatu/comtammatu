import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  publicSelfOrderSnapshotSchema,
  selfOrderBatchActionResponseSchema,
  selfOrderDeviceActionResponseSchema,
  selfOrderPaymentActionResponseSchema,
} from "../lib/self-order/contracts";

const publicSnapshot = {
  ok: true as const,
  capabilityVersion: 2 as const,
  access: "public" as const,
  deviceAccess: "missing" as const,
  seatingAccess: "available" as const,
  branch: { name: "Chi nhánh thử nghiệm" },
  table: { number: 4 },
  session: null,
  order: null,
  batches: [],
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

test("public snapshot accepts the real public menu shape", () => {
  assert.equal(
    publicSelfOrderSnapshotSchema.safeParse(publicSnapshot).success,
    true,
  );
});

test("public snapshot rejects unknown top-level and nested private fields", () => {
  assert.equal(
    publicSelfOrderSnapshotSchema.safeParse({
      ...publicSnapshot,
      invoice_payload: { buyerTaxCode: "0123456789" },
    }).success,
    false,
  );
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
    selfOrderBatchActionResponseSchema.safeParse({
      ok: true,
      status: "pending_approval",
      orderId: null,
      total_amount: 65_000,
    }).success,
    false,
  );
  assert.equal(
    selfOrderDeviceActionResponseSchema.safeParse({
      ok: true,
      access: "join_pending",
      deviceRequest: {
        deviceId: 7,
        kind: "join",
        status: "join_pending",
      },
      pairing_code_hash: "private",
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

test("server projects batch RPC output through an explicit public allowlist", () => {
  const server = readFileSync(
    join(process.cwd(), "lib/self-order/server.ts"),
    "utf8",
  );
  const projection = server.slice(
    server.indexOf("function parseBatchActionPayload"),
    server.indexOf("function withCapabilityFlags"),
  );

  assert.match(projection, /batchId: record\.batchId \?\? record\.batch_id/);
  assert.match(projection, /orderId: record\.orderId \?\? record\.order_id/);
  assert.doesNotMatch(projection, /\.\.\.record|total_amount|invoice_payload/);
});
