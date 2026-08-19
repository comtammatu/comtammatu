import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildReceivedAmountUtterance,
  formatVndAsVietnamese,
  roundVndForSpeech,
} from "../lib/vnd-vietnamese-speech";

test("formatVndAsVietnamese reads restaurant totals in words", () => {
  assert.equal(formatVndAsVietnamese(89_000), "tám mươi chín nghìn đồng");
  assert.equal(
    formatVndAsVietnamese(165_000),
    "một trăm sáu mươi lăm nghìn đồng",
  );
  assert.equal(
    formatVndAsVietnamese(1_250_000),
    "một triệu hai trăm năm mươi nghìn đồng",
  );
  assert.equal(formatVndAsVietnamese(1_000_000), "một triệu đồng");
  assert.equal(
    formatVndAsVietnamese(1_001_000),
    "một triệu không trăm linh một nghìn đồng",
  );
  assert.equal(formatVndAsVietnamese(21_000), "hai mươi mốt nghìn đồng");
  assert.equal(formatVndAsVietnamese(15_000), "mười lăm nghìn đồng");
});

test("roundVndForSpeech keeps a closed amount set", () => {
  assert.equal(roundVndForSpeech(165_400), 165_000);
  assert.equal(roundVndForSpeech(165_500), 166_000);
  assert.equal(roundVndForSpeech(0), null);
  assert.equal(roundVndForSpeech(21_000_000), null);
  assert.equal(
    buildReceivedAmountUtterance(165_000),
    "Đã nhận một trăm sáu mươi lăm nghìn thanh toán",
  );
  assert.equal(
    buildReceivedAmountUtterance(165_000, "12"),
    "Đã nhận một trăm sáu mươi lăm nghìn thanh toán bàn 12",
  );
});
