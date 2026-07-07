export const WORKDAY_PER_COMPLETED_SHIFT = 0.5;

export function countCompletedShiftWorkdays(completedShiftCount: number): number {
  return Math.max(0, completedShiftCount) * WORKDAY_PER_COMPLETED_SHIFT;
}
