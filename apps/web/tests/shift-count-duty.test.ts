import assert from "node:assert/strict";
import { test } from "node:test";
import { isShiftCountDutyItem } from "../lib/staff-runtime/_lib/count-duty";

test("shift count duty matches catalog drink-count and clock-in titles", () => {
  assert.equal(
    isShiftCountDutyItem({ taskKind: "inventory_count", title: "Khác" }),
    true,
  );
  assert.equal(
    isShiftCountDutyItem({ taskKind: "standard", title: "Đếm tồn nước" }),
    true,
  );
  assert.equal(
    isShiftCountDutyItem({ taskKind: "standard", title: "Kiểm kê tồn" }),
    true,
  );
  assert.equal(
    isShiftCountDutyItem({ taskKind: "standard", title: "Đếm tồn" }),
    true,
  );
  assert.equal(
    isShiftCountDutyItem({ taskKind: "standard", title: "Lau bàn" }),
    false,
  );
});
