import {
  getVNMinutesOfDay,
  isWithinShiftWindow,
  parseClockTimeToMinutes,
} from "@comtammatu/shared/time";

export interface BranchShiftWindow {
  id: number;
  start_time: string;
  end_time: string;
}

interface ParsedShiftWindow {
  id: number;
  startMin: number;
  endMin: number;
}

/**
 * Khoảng cách (phút) từ `nowMin` tới khung giờ ca. Ca qua đêm được duỗi qua
 * nửa đêm như `isWithinShiftWindow`; thử thêm `nowMin + 1440` để rạng sáng
 * vẫn so được với ca bắt đầu tối hôm trước. Trả về 0 khi đang trong ca.
 */
function distanceToShiftWindow(nowMin: number, shift: ParsedShiftWindow): number {
  const effectiveEnd =
    shift.endMin > shift.startMin ? shift.endMin : shift.endMin + 1440;
  let best = Number.POSITIVE_INFINITY;
  for (const candidate of [nowMin, nowMin + 1440]) {
    if (candidate < shift.startMin) {
      best = Math.min(best, shift.startMin - candidate);
    } else if (candidate > effectiveEnd) {
      best = Math.min(best, candidate - effectiveEnd);
    } else {
      return 0;
    }
  }
  return best;
}

/**
 * Mặc định mỗi ngày đều có ca làm: nhân viên không cần được phân ca trước.
 * Khi chấm công vào mà không có phân ca, gắn bản ghi vào ca đang diễn ra của
 * chi nhánh theo giờ VN; nếu đang ở khoảng trống giữa hai ca thì chọn ca gần
 * khung giờ hiện tại nhất (sắp bắt đầu hoặc vừa kết thúc). Tie-break theo giờ
 * bắt đầu rồi id để kết quả ổn định. Trả về null khi chi nhánh chưa khai báo ca.
 */
export function resolveDefaultShiftId(
  shifts: readonly BranchShiftWindow[],
  nowMinutes: number = getVNMinutesOfDay(),
): number | null {
  const parsed: ParsedShiftWindow[] = [];
  for (const shift of shifts) {
    const startMin = parseClockTimeToMinutes(shift.start_time);
    const endMin = parseClockTimeToMinutes(shift.end_time);
    if (startMin == null || endMin == null) continue;
    parsed.push({ id: shift.id, startMin, endMin });
  }
  if (parsed.length === 0) return null;

  const ranked = parsed
    .map((shift) => ({
      shift,
      inWindow: isWithinShiftWindow(
        nowMinutes,
        shift.startMin,
        shift.endMin,
        0,
      ),
      distance: distanceToShiftWindow(nowMinutes, shift),
    }))
    .sort((a, b) => {
      if (a.inWindow !== b.inWindow) return a.inWindow ? -1 : 1;
      if (a.distance !== b.distance) return a.distance - b.distance;
      if (a.shift.startMin !== b.shift.startMin) {
        return a.shift.startMin - b.shift.startMin;
      }
      return a.shift.id - b.shift.id;
    });

  return ranked[0]?.shift.id ?? null;
}
