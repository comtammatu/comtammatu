import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveDefaultShiftId,
  type BranchShiftWindow,
} from "../lib/employee/_lib/default-shift";

// Real prod shift schedules: Đất Đỏ (morning 05–13, evening 15–22, with a
// 13–15 gap) and Phước Hải (morning 05–13, evening 13–21, contiguous).
const DAT_DO: BranchShiftWindow[] = [
  { id: 1, start_time: "05:00:00", end_time: "13:00:00" },
  { id: 2, start_time: "15:00:00", end_time: "22:00:00" },
];

const PHUOC_HAI: BranchShiftWindow[] = [
  { id: 3, start_time: "05:00:00", end_time: "13:00:00" },
  { id: 4, start_time: "13:00:00", end_time: "21:00:00" },
];

function minutes(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

test("đang trong ca → chọn ca đang diễn ra", () => {
  assert.equal(resolveDefaultShiftId(DAT_DO, minutes("06:30")), 1);
  assert.equal(resolveDefaultShiftId(DAT_DO, minutes("18:00")), 2);
  assert.equal(resolveDefaultShiftId(PHUOC_HAI, minutes("14:00")), 4);
});

test("biên giờ chuyển ca liền nhau → ưu tiên ca bắt đầu sớm hơn khi cả hai đều khớp", () => {
  // 13:00 is both the morning end and the evening start (windows closed on both ends)
  assert.equal(resolveDefaultShiftId(PHUOC_HAI, minutes("13:00")), 3);
});

test("khoảng trống giữa hai ca → chọn ca gần khung giờ nhất", () => {
  // 13:30: 30' past the morning end < 90' before the evening start
  assert.equal(resolveDefaultShiftId(DAT_DO, minutes("13:30")), 1);
  // 14:30: 30' before the evening start < 90' past the morning end
  assert.equal(resolveDefaultShiftId(DAT_DO, minutes("14:30")), 2);
});

test("ca đã kết trong ngày không chặn ca tiếp theo", () => {
  assert.equal(resolveDefaultShiftId(DAT_DO, minutes("13:30"), new Set([1])), 2);
  assert.equal(
    resolveDefaultShiftId(PHUOC_HAI, minutes("13:00"), new Set([3])),
    4,
  );
});

test("khi mọi ca gần giờ hiện tại đã kết → giữ ca gần nhất", () => {
  assert.equal(
    resolveDefaultShiftId(DAT_DO, minutes("22:30"), new Set([1, 2])),
    2,
  );
});

test("đến sớm trước ca sáng → chọn ca sáng", () => {
  assert.equal(resolveDefaultShiftId(DAT_DO, minutes("04:30")), 1);
});

test("khuya sau ca tối → chọn ca tối vừa kết thúc, không nhảy sang ca sáng hôm sau", () => {
  // 22:30: 30' past the evening end < 390' before tomorrow's morning start
  assert.equal(resolveDefaultShiftId(DAT_DO, minutes("22:30")), 2);
});

test("ca qua đêm → rạng sáng vẫn khớp ca bắt đầu tối hôm trước", () => {
  const overnight: BranchShiftWindow[] = [
    { id: 9, start_time: "18:00:00", end_time: "02:00:00" },
    { id: 10, start_time: "06:00:00", end_time: "14:00:00" },
  ];
  assert.equal(resolveDefaultShiftId(overnight, minutes("01:00")), 9);
  assert.equal(resolveDefaultShiftId(overnight, minutes("07:00")), 10);
});

test("chi nhánh chưa khai báo ca hoặc giờ ca hỏng → null", () => {
  assert.equal(resolveDefaultShiftId([], minutes("08:00")), null);
  assert.equal(
    resolveDefaultShiftId(
      [{ id: 5, start_time: "xx", end_time: "13:00:00" }],
      minutes("08:00"),
    ),
    null,
  );
});

test("giờ ca hỏng bị bỏ qua, ca hợp lệ vẫn được chọn", () => {
  const mixed: BranchShiftWindow[] = [
    { id: 6, start_time: "bad", end_time: "13:00:00" },
    { id: 7, start_time: "05:00:00", end_time: "13:00:00" },
  ];
  assert.equal(resolveDefaultShiftId(mixed, minutes("08:00")), 7);
});
