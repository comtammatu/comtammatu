import {
  formatVNDurationMinutes,
  parseClockTimeToMinutes,
} from "@comtammatu/shared/time";

export function getShiftDurationMinutes(
  startTime: string,
  endTime: string,
): number | null {
  const start = parseClockTimeToMinutes(startTime);
  const end = parseClockTimeToMinutes(endTime);
  if (start == null || end == null) return null;
  return end > start ? end - start : end + 24 * 60 - start;
}

export function formatShiftDuration(
  startTime: string,
  endTime: string,
): string {
  const minutes = getShiftDurationMinutes(startTime, endTime);
  return minutes == null ? "—" : formatVNDurationMinutes(minutes);
}

export function isUnusualShiftDuration(minutes: number | null): boolean {
  return minutes != null && (minutes < 120 || minutes > 720);
}
