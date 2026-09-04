import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractCustomerNoteFromLine,
  isDeliveryToppingLine,
  isReceiptFooterLine,
  itemAcceptsOrphanToppings,
  sanitizeDeliveryItemNote,
  sanitizeDeliveryOptionName,
} from "../lib/delivery/receipt-text";

test("receipt footer detection covers production OCR misspellings", () => {
  assert.equal(isReceiptFooterLine("Tổng mớn 2"), true);
  assert.equal(isReceiptFooterLine("Tổng mớón"), true);
  assert.equal(isReceiptFooterLine("Tống tiền món (giá gốc) 82.000d"), true);
  assert.equal(isReceiptFooterLine("Giảm giả mồn -27.000d"), true);
  assert.equal(isReceiptFooterLine("Chiết khấu -15.703d"), true);
  assert.equal(
    isReceiptFooterLine("Ghi chủ của khách hàng Nước mắm không cay"),
    true,
  );
  assert.equal(isReceiptFooterLine("Không đồ chua"), false);
  assert.equal(isReceiptFooterLine("cắt sườn nhỏ giúp em"), false);
});

test("customer-note extraction keeps the kitchen request and drops totals", () => {
  assert.equal(
    extractCustomerNoteFromLine(
      "Ghi chủ của khách hàng Nước mắ m không cay giúp em a",
    ),
    "Nước mắ m không cay giúp em a",
  );
  assert.equal(extractCustomerNoteFromLine("Không đồ chua"), null);
  assert.equal(
    extractCustomerNoteFromLine(
      "Ghi chú: Không lấy đồ chua xin nhiều cà chu a mỡ hành Tổng mớón",
    ),
    null,
  );
});

test("item-note sanitizer reproduces production Shopee footer leaks", () => {
  assert.equal(
    sanitizeDeliveryItemNote(
      "Tổng mớn 2 Tổng tiền món (giá gốc) 82.000d Giảm giả mồn -27.000d Tổng tiền 55.000d Chiết khấu -15.703d Tổng tiền 39.298d Ghi chủ của khách hàng Nước mắ m không cay giúp em a",
    ),
    "Nước mắ m không cay giúp em a",
  );
  assert.equal(
    sanitizeDeliveryItemNote(
      "Tổng mớn Tống tiền món (giá gốc) 63.000d Giảm giả món Tổng tiền 63.000d Chiết khấu -15.467d Tổng tiền 47.534đ • Tùy chọn: Canh theo ngày",
    ),
    "Tùy chọn: Canh theo ngày",
  );
  assert.equal(sanitizeDeliveryItemNote("Không đồ chua"), "Không đồ chua");
  assert.equal(
    sanitizeDeliveryItemNote(
      "Ghi chú: Không lấy đồ chua xin nhiều cà chu a mỡ hành Tổng mớón",
    ),
    "Không lấy đồ chua xin nhiều cà chua mỡ hành",
  );
  assert.equal(sanitizeDeliveryItemNote("Tùy chọn: IxDụng cụ ăn uống"), "Tùy chọn: Dụng cụ ăn uống");
});

test("option-name sanitizer strips glued OCR quantity prefixes", () => {
  assert.equal(sanitizeDeliveryOptionName("IxDụng cụ ăn uống"), "Dụng cụ ăn uống");
  assert.equal(sanitizeDeliveryOptionName("1xCanh theo ngày"), "Canh theo ngày");
  assert.equal(sanitizeDeliveryOptionName("Dụng cụ ăn uống"), "Dụng cụ ăn uống");
});

test("topping-line detection treats 1x extra rice as an option, not a rice plate", () => {
  assert.equal(isDeliveryToppingLine("1xCơm Thêm"), true);
  assert.equal(isDeliveryToppingLine("• 1xCơm Thêm"), true);
  assert.equal(isDeliveryToppingLine("1x Cơm Tấm Bì"), false);
  assert.equal(isDeliveryToppingLine("2. Cơm Tấm Bì"), false);
  assert.equal(itemAcceptsOrphanToppings("Cơm Tấm Bì"), true);
  assert.equal(itemAcceptsOrphanToppings("Nước Sâm"), false);
});
