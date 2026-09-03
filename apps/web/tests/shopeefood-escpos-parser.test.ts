import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractTextFromEscPos,
  parseShopeeReceiptText,
  parseShopeeEscPosStream,
  detectDeliveryPlatform,
  toDatabaseDeliveryPlatform,
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
  assert.equal(transformed.customerNote, null);
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
  assert.equal(transformed.customerNote, null);
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

test("ESC/POS parser: prose lines never masquerade as order codes", () => {
  // Prose such as "Tổng tiền đơn hàng: 156.000" or "Đơn hàng từ ShopeeFood"
  // must not be captured as an order code; only explicit code labels (Mã đơn /
  // Mã đặt món / Order ID), bare numeric codes, or SPF references qualify.
  const sampleReceipt = `
Đơn hàng từ ShopeeFood
Tổng tiền đơn hàng: 156.000
Mã đơn: SPF-101
Khách hàng: Phạm Văn Tài
1x Sườn Cốt Lết                 54.000
Tổng cộng:                      156.000
  `;

  const parsed = parseShopeeReceiptText(sampleReceipt);

  assert.equal(parsed.orderId, "SPF-101");
  assert.equal(parsed.displayId, "SPF-101");
  assert.equal(parsed.total, 156000);
});

test("ESC/POS parser: labeled code outranks bare numeric and SPF references", () => {
  // Real receipt layout: the display code (Mã đơn) precedes the internal code
  // (Mã đặt món). The last labeled code wins for orderId; SPF stays displayId.
  const receiptWithLabel = `
ShopeeFood
Mã đơn: SPF-205
Mã đặt món: 260826-1145230
1x Canh Khổ Qua 30.000
  `;
  // A timestamp-like bare numeric token must not displace a labeled code.
  const receiptBareNumeric = `
ShopeeFood
Mã đơn: SPF-206
Đơn tham chiếu 260826-1145231
1x Canh Khổ Qua 30.000
  `;

  const withLabel = parseShopeeReceiptText(receiptWithLabel);
  assert.equal(withLabel.orderId, "260826-1145230");
  assert.equal(withLabel.displayId, "SPF-205");

  const bareNumeric = parseShopeeReceiptText(receiptBareNumeric);
  assert.equal(bareNumeric.orderId, "SPF-206");
  assert.equal(bareNumeric.displayId, "SPF-206");
});

test("ESC/POS parser: parses OCR text from ShopeeFood raster receipts", () => {
  const ocrReceipt = `
ShopeeFood
Cơm Tấm Má Tư
Mã đơn hàng
12345-987654321
Khách hàng K***
Món Tổng tiền Giá
1. Cơm Sườn Cốt Lết
• 1xCanh theo ngày
• 1xDụng cụ ăn uống
x2 114.000đ
cắt sườn giúp em
Tổng món 2
Tổng tiền món (giá gốc) 114.000đ
Chiết khấu -20.000đ
Tổng tiền 94.000đ
  `;

  const parsed = parseShopeeReceiptText(ocrReceipt);

  assert.equal(parsed.orderId, "12345-987654321");
  assert.equal(parsed.displayId, "12345-987654321");
  assert.equal(parsed.items?.length, 1);
  assert.equal(parsed.items?.[0]?.name, "Cơm Sườn Cốt Lết");
  assert.equal(parsed.items?.[0]?.quantity, 2);
  assert.equal(parsed.items?.[0]?.price, 57000);
  assert.equal(parsed.items?.[0]?.options?.length, 2);
  assert.equal(parsed.items?.[0]?.options?.[0]?.name, "Canh theo ngày");
  assert.equal(parsed.items?.[0]?.options?.[1]?.name, "Dụng cụ ăn uống");
  assert.equal(parsed.total, 94000);
});

test("ESC/POS parser: keeps the customer kitchen note and ignores OCR settlement footer", () => {
  const parsed = parseShopeeReceiptText(`
ShopeeFood
Mã đơn hàng
27086-730200001
1. Cơm Sườn Cốt Lết
• IxDụng cụ ăn uống
x1 54.000đ
Tổng mớn 2
Tổng tiền món (giá gốc) 82.000d
Giảm giả mồn -27.000d
Chiết khấu -15.703d
Ghi chủ của khách hàng Nước mắm không cay giúp em
Tổng tiền 39.298d
  `);

  assert.equal(parsed.orderId, "27086-730200001");
  assert.equal(parsed.items?.length, 1);
  assert.equal(parsed.items?.[0]?.name, "Cơm Sườn Cốt Lết");
  assert.equal(parsed.items?.[0]?.options?.[0]?.name, "IxDụng cụ ăn uống");
  assert.equal(parsed.items?.[0]?.note, "Nước mắm không cay giúp em");
  assert.equal(parsed.customer?.note, "Nước mắm không cay giúp em");
  assert.equal(parsed.total, 39298);
});

test("ESC/POS platform detection: identifies all 4 platforms accurately from receipt signature", () => {
  const shopeeSample = "ShopeeFood\nMã đơn: SPF-123\nVí ShopeePay\n1x Cơm sườn 54.000";
  const grabSample = "GrabFood\nOrder: GF-789\nGrabPay\n1x Sườn Một Gang 120.000";
  const beSample = "beFood - beMerchant\nMã: BE-456\nThanh toán: bePay\n1x Cơm sườn 54.000";
  const greenSmSample = "Xanh SM Ngon (Green SM Food)\nĐơn: GSM-999\nVí Xanh SM\n1x Cơm sườn 54.000";

  assert.equal(detectDeliveryPlatform(shopeeSample), "shopee");
  assert.equal(detectDeliveryPlatform(grabSample), "grab");
  assert.equal(detectDeliveryPlatform(beSample), "be");
  assert.equal(detectDeliveryPlatform(greenSmSample), "greensm");
});

test("ESC/POS platform detection: recognizes Agent labels and fails closed for unknown receipts", () => {
  assert.equal(
    detectDeliveryPlatform("GreenSM Food\nMã đơn: GSM-100\n1x Cơm sườn 54.000"),
    "greensm",
  );
  assert.equal(
    detectDeliveryPlatform("Be Food\nMã đơn: BE-200\n1x Cơm sườn 54.000"),
    "be",
  );
  assert.equal(
    detectDeliveryPlatform("Phiếu giao hàng\nMã đơn: 123456\n1x Cơm sườn 54.000"),
    null,
  );
  assert.equal(
    detectDeliveryPlatform("ShopeeFood\nGreenSM Food\nMã đơn: SPF-GSM-300"),
    null,
  );
});

test("delivery platform mapping converts the Agent Green SM wire value for the POS RPC", () => {
  assert.equal(toDatabaseDeliveryPlatform("greensm"), "green_sm");
  assert.equal(toDatabaseDeliveryPlatform("shopee"), "shopee");
});
