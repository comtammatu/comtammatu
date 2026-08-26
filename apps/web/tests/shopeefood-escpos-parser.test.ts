import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractTextFromEscPos,
  parseShopeeReceiptText,
  parseShopeeEscPosStream,
} from "../lib/shopeefood/escpos-parser";
import {
  transformShopeeOrderPayload,
  generateOrderUuid,
} from "../lib/shopeefood/mapping";

const MOCK_DB_ITEMS = [
  { id: 1, name: "Sườn Cốt Lết", base_price: 54000 },
  { id: 2, name: "Sườn Cọng", base_price: 78000 },
  { id: 3, name: "Sườn Một Gang", base_price: 120000 },
  { id: 4, name: "Canh Khổ Qua", base_price: 30000 },
  { id: 8, name: "Tóp Mỡ", base_price: 6000 },
  { id: 10, name: "Trứng", base_price: 10000 },
  { id: 29, name: "Dụng Cụ Mang Về", base_price: 3000 },
];

test("ESC/POS binary extractor: strips control sequences and preserves Vietnamese text", () => {
  // Construct a binary buffer containing ESC @ (init), ESC ! 16 (double height), text, GS V 65 0 (cut)
  const prefix = Buffer.from([0x1b, 0x40, 0x1b, 0x21, 0x10]);
  const text = Buffer.from("ShopeeFood\nMã đơn: SPF-892\n2x Sườn Cốt Lết  126.000đ\n", "utf-8");
  const suffix = Buffer.from([0x1d, 0x56, 0x41, 0x00]);

  const rawBytes = Buffer.concat([prefix, text, suffix]);
  const extracted = extractTextFromEscPos(rawBytes);

  assert.ok(extracted.includes("ShopeeFood"));
  assert.ok(extracted.includes("Mã đơn: SPF-892"));
  assert.ok(extracted.includes("2x Sườn Cốt Lết  126.000đ"));
});

test("ESC/POS parser: parses standard ShopeeFood receipt with toppings and cutlery accurately", () => {
  const sampleReceipt = `
========================================
              ShopeeFood
========================================
Mã đơn: SPF-892
Mã đặt món: 260825-9812401
Khách hàng: Nguyễn Văn Hùng
SĐT: 0901234567
Lấy dụng cụ ăn uống (Muỗng, nĩa)
Ghi chú đơn: Giao trước 12h giúp mình

----------------------------------------
2x Sườn Cốt Lết                 126.000
   + Hộp, Muỗng, Nĩa (3.000)
   + Tóp mỡ (6.000)
   Ghi chú: Miếng sườn nướng cháy cạnh

1x Canh Khổ Qua                  30.000
----------------------------------------
Tạm tính:                       156.000
Khuyến mãi:                           0
Tổng thanh toán:                156.000
Hình thức: ShopeePay
========================================
  `;

  const parsed = parseShopeeReceiptText(sampleReceipt);

  assert.equal(parsed.displayId, "SPF-892");
  assert.equal(parsed.orderId, "260825-9812401");
  assert.equal(parsed.customer?.name, "Nguyễn Văn Hùng");
  assert.equal(parsed.customer?.phone, "0901234567");
  assert.equal(parsed.needCutlery, true);
  assert.equal(parsed.customer?.note, "Giao trước 12h giúp mình");
  assert.equal(parsed.total, 156000);
  assert.equal(parsed.paymentMethod, "ShopeePay");

  assert.equal(parsed.items?.length, 2);
  const item1 = parsed.items?.[0];
  assert.equal(item1?.name, "Sườn Cốt Lết");
  assert.equal(item1?.quantity, 2);
  assert.equal(item1?.price, 63000);
  assert.equal(item1?.note, "Miếng sườn nướng cháy cạnh");
  assert.equal(item1?.options?.length, 2);
  assert.equal(item1?.options?.[0]?.name, "Hộp, Muỗng, Nĩa");
  assert.equal(item1?.options?.[0]?.price, 3000);
  assert.equal(item1?.options?.[1]?.name, "Tóp mỡ");
  assert.equal(item1?.options?.[1]?.price, 6000);

  const item2 = parsed.items?.[1];
  assert.equal(item2?.name, "Canh Khổ Qua");
  assert.equal(item2?.quantity, 1);
  assert.equal(item2?.price, 30000);

  // Transform for RPC
  const transformed = transformShopeeOrderPayload(parsed, MOCK_DB_ITEMS);
  assert.equal(transformed.displayId, "SPF-892");
  assert.equal(transformed.totalAmount, 156000);
  assert.equal(transformed.items.length, 2);
  assert.equal(transformed.items[0]?.menu_item_id, 1);
  assert.equal(transformed.items[0]?.quantity, 2);
  assert.equal(transformed.items[0]?.sides.length, 2);
  assert.ok(transformed.customerNote.includes("[ShopeeFood SPF-892]"));
  assert.ok(transformed.customerNote.includes("Lấy muỗng đũa"));
  assert.ok(transformed.customerNote.includes("Giao trước 12h giúp mình"));
});

test("ESC/POS parser: parses receipt with 'Không lấy dụng cụ' and cash payment", () => {
  const sampleReceipt = `
ShopeeFood - Cơm Tấm Má Tư
Đơn hàng: SPF-741
Tên khách: Trần Thị Mai (0918889999)
Không lấy dụng cụ

1x Sườn Cọng                     78.000
   + Trứng (10.000)

Tổng cộng:                       88.000
Hình thức: Tiền mặt
  `;

  const parsed = parseShopeeReceiptText(sampleReceipt);

  assert.equal(parsed.displayId, "SPF-741");
  assert.equal(parsed.customer?.name, "Trần Thị Mai");
  assert.equal(parsed.customer?.phone, "0918889999");
  assert.equal(parsed.needCutlery, false);
  assert.equal(parsed.paymentMethod, "Tiền mặt");
  assert.equal(parsed.total, 88000);
  assert.equal(parsed.items?.length, 1);
  assert.equal(parsed.items?.[0]?.name, "Sườn Cọng");
  assert.equal(parsed.items?.[0]?.options?.length, 1);
  assert.equal(parsed.items?.[0]?.options?.[0]?.name, "Trứng");

  const transformed = transformShopeeOrderPayload(parsed, MOCK_DB_ITEMS);
  assert.ok(transformed.customerNote.includes("Không lấy dụng cụ"));
});

test("ESC/POS parser: reprint deduplication guarantees identical idempotencyKey", () => {
  const rawReceiptOriginal = `
ShopeeFood
Mã đơn: SPF-999
Khách hàng: Lê Minh
1x Sườn Một Gang 120.000
Tổng: 120.000
  `;

  const rawReceiptReprint = `
[IN LẠI - REPRINT]
ShopeeFood
Mã đơn: SPF-999
Khách hàng: Lê Minh
1x Sườn Một Gang 120.000
Tổng: 120.000
  `;

  const order1 = parseShopeeEscPosStream(rawReceiptOriginal);
  const order2 = parseShopeeEscPosStream(rawReceiptReprint);

  assert.equal(order1.displayId, "SPF-999");
  assert.equal(order2.displayId, "SPF-999");

  const uuid1 = generateOrderUuid(order1.orderId as string);
  const uuid2 = generateOrderUuid(order2.orderId as string);

  assert.equal(uuid1, uuid2);
  assert.match(uuid1, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});
