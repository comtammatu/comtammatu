export function calculateAttendanceWorkHours(
  checkIn: string | null,
  checkOut: string | null,
): number {
  if (!checkIn || !checkOut) return 0;

  const durationMs = Date.parse(checkOut) - Date.parse(checkIn);
  return Number.isFinite(durationMs) && durationMs > 0
    ? durationMs / (60 * 60 * 1000)
    : 0;
}
