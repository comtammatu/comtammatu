import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isShiftEndedForBusinessDate,
  pickAssignedShiftInWindow,
  resolveClockInGate,
  resolveCurrentShiftContext,
  resolveDefaultShiftId,
  resolveShiftBusinessDate,
  type BranchShiftWindow,
} from "../lib/staff-runtime/_lib/default-shift";

// Representative schedules cover a split window and contiguous handoff.
const SPLIT_SHIFT: BranchShiftWindow[] = [
  { id: 1, start_time: "05:00:00", end_time: "13:00:00" },
  { id: 2, start_time: "15:00:00", end_time: "22:00:00" },
];

const CONTIGUOUS_SHIFT: BranchShiftWindow[] = [
  { id: 3, start_time: "05:00:00", end_time: "13:00:00" },
  { id: 4, start_time: "13:00:00", end_time: "21:00:00" },
];

function minutes(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

test("đang trong ca → chọn ca đang diễn ra", () => {
  assert.equal(resolveDefaultShiftId(SPLIT_SHIFT, minutes("06:30")), 1);
  assert.equal(resolveDefaultShiftId(SPLIT_SHIFT, minutes("18:00")), 2);
  assert.equal(resolveDefaultShiftId(CONTIGUOUS_SHIFT, minutes("14:00")), 4);
});

test("biên giờ chuyển ca liền nhau → ưu tiên ca bắt đầu sớm hơn khi cả hai đều khớp", () => {
  // 13:00 is both the morning end and the evening start (windows closed on both ends)
  assert.equal(resolveDefaultShiftId(CONTIGUOUS_SHIFT, minutes("13:00")), 3);
});

test("khoảng trống giữa hai ca → chọn ca gần khung giờ nhất", () => {
  // 13:30: 30' past the morning end < 90' before the evening start
  assert.equal(resolveDefaultShiftId(SPLIT_SHIFT, minutes("13:30")), 1);
  // 14:30: 30' before the evening start < 90' past the morning end
  assert.equal(resolveDefaultShiftId(SPLIT_SHIFT, minutes("14:30")), 2);
});

test("ca đã kết trong ngày không chặn ca tiếp theo", () => {
  assert.equal(
    resolveDefaultShiftId(SPLIT_SHIFT, minutes("13:30"), new Set([1])),
    2,
  );
  assert.equal(
    resolveDefaultShiftId(CONTIGUOUS_SHIFT, minutes("13:00"), new Set([3])),
    4,
  );
});

test("khi mọi ca gần giờ hiện tại đã kết → giữ ca gần nhất", () => {
  assert.equal(
    resolveDefaultShiftId(SPLIT_SHIFT, minutes("22:30"), new Set([1, 2])),
    2,
  );
});

test("đến sớm trước ca sáng → chọn ca sáng", () => {
  assert.equal(resolveDefaultShiftId(SPLIT_SHIFT, minutes("04:30")), 1);
});

test("khuya sau ca tối → chọn ca tối vừa kết thúc, không nhảy sang ca sáng hôm sau", () => {
  // 22:30: 30' past the evening end < 390' before tomorrow's morning start
  assert.equal(resolveDefaultShiftId(SPLIT_SHIFT, minutes("22:30")), 2);
});

test("ca qua đêm → rạng sáng vẫn khớp ca bắt đầu tối hôm trước", () => {
  const overnight: BranchShiftWindow[] = [
    { id: 9, start_time: "18:00:00", end_time: "02:00:00" },
    { id: 10, start_time: "06:00:00", end_time: "14:00:00" },
  ];
  assert.equal(resolveDefaultShiftId(overnight, minutes("01:00")), 9);
  assert.equal(resolveDefaultShiftId(overnight, minutes("07:00")), 10);
  assert.equal(
    resolveShiftBusinessDate(overnight[0]!, minutes("01:00"), "2026-07-11"),
    "2026-07-10",
  );
  assert.equal(
    resolveShiftBusinessDate(overnight[0]!, minutes("02:01"), "2026-07-11"),
    "2026-07-10",
  );
  assert.equal(
    resolveShiftBusinessDate(overnight[0]!, minutes("17:00"), "2026-07-11"),
    "2026-07-11",
  );
  assert.deepEqual(
    resolveCurrentShiftContext(
      overnight,
      [
        {
          date: "2026-07-10",
          shift_id: 9,
          check_out: null,
        },
      ],
      minutes("01:00"),
      "2026-07-11",
    ),
    { shiftId: 9, businessDate: "2026-07-10" },
  );
  assert.deepEqual(
    resolveCurrentShiftContext(
      overnight,
      [
        {
          date: "2026-07-10",
          shift_id: 9,
          check_out: null,
        },
      ],
      minutes("02:01"),
      "2026-07-11",
    ),
    { shiftId: 9, businessDate: "2026-07-10" },
  );
  assert.equal(
    isShiftEndedForBusinessDate(
      "2026-07-10",
      overnight[0]!,
      minutes("01:00"),
      "2026-07-11",
    ),
    false,
  );
  assert.equal(
    isShiftEndedForBusinessDate(
      "2026-07-10",
      overnight[0]!,
      minutes("02:01"),
      "2026-07-11",
    ),
    true,
  );
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

test("assigned shift rejects yesterday day-shift backdate", () => {
  const picked = pickAssignedShiftInWindow(
    [
      {
        workDate: "2026-07-10",
        shiftId: 1,
        shiftName: "Ca sáng",
        startTime: "08:00:00",
        endTime: "16:00:00",
      },
    ],
    "2026-07-11",
    12 * 60,
  );
  assert.equal(picked, null);
});

test("assigned shift rejects today assignment outside window", () => {
  const picked = pickAssignedShiftInWindow(
    [
      {
        workDate: "2026-07-11",
        shiftId: 2,
        shiftName: "Ca sáng",
        startTime: "08:00:00",
        endTime: "16:00:00",
      },
    ],
    "2026-07-11",
    6 * 60 + 59,
  );
  assert.equal(picked, null);
});

test("assigned shift accepts 60 minutes early clock-in", () => {
  const picked = pickAssignedShiftInWindow(
    [
      {
        workDate: "2026-07-11",
        shiftId: 2,
        shiftName: "Ca sáng",
        startTime: "08:00:00",
        endTime: "16:00:00",
      },
    ],
    "2026-07-11",
    7 * 60,
  );
  assert.deepEqual(picked, {
    shiftId: 2,
    businessDate: "2026-07-11",
    shiftName: "Ca sáng",
  });
});

test("assigned shift accepts overnight yesterday in window", () => {
  const picked = pickAssignedShiftInWindow(
    [
      {
        workDate: "2026-07-10",
        shiftId: 9,
        shiftName: "Ca đêm",
        startTime: "18:00:00",
        endTime: "02:00:00",
      },
    ],
    "2026-07-11",
    60,
  );
  assert.deepEqual(picked, {
    shiftId: 9,
    businessDate: "2026-07-10",
    shiftName: "Ca đêm",
  });
});

const MORNING = {
  workDate: "2026-07-11",
  shiftId: 2,
  shiftName: "Ca sáng",
  startTime: "08:00:00",
  endTime: "16:00:00",
};

test("clock-in gate is too early more than 60 minutes before start", () => {
  const gate = resolveClockInGate([MORNING], "2026-07-11", 6 * 60 + 59);
  assert.equal(gate.kind, "too_early");
  if (gate.kind !== "too_early") return;
  assert.equal(gate.shiftName, "Ca sáng");
  assert.equal(gate.clockInFromMinutes, 7 * 60);
});

test("clock-in gate opens at 60 minutes before start", () => {
  const gate = resolveClockInGate([MORNING], "2026-07-11", 7 * 60);
  assert.equal(gate.kind, "open");
  if (gate.kind !== "open") return;
  assert.equal(gate.shiftId, 2);
});

test("clock-in gate is too late after the last assigned shift ends", () => {
  const gate = resolveClockInGate([MORNING], "2026-07-11", 16 * 60);
  assert.equal(gate.kind, "too_late");
  if (gate.kind !== "too_late") return;
  assert.equal(gate.endTime, "16:00:00");
});

test("clock-in gate is unassigned when no roster row exists", () => {
  const gate = resolveClockInGate([], "2026-07-11", 8 * 60);
  assert.equal(gate.kind, "unassigned");
});

test("gap between today's shifts points at the next shift, not unassigned", () => {
  const gate = resolveClockInGate(
    [
      {
        workDate: "2026-07-11",
        shiftId: 1,
        shiftName: "Ca sáng",
        startTime: "05:00:00",
        endTime: "13:00:00",
      },
      {
        workDate: "2026-07-11",
        shiftId: 2,
        shiftName: "Ca chiều",
        startTime: "15:00:00",
        endTime: "22:00:00",
      },
    ],
    "2026-07-11",
    13 * 60 + 30,
  );
  assert.equal(gate.kind, "too_early");
  if (gate.kind !== "too_early") return;
  assert.equal(gate.shiftName, "Ca chiều");
  assert.equal(gate.clockInFromMinutes, 14 * 60);
});
