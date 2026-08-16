/**
 * Pinned kitchen preparation SLA (Service Level Agreement) latency thresholds.
 * Synchronized across POS floor, KDS kitchen display, and Orders/Notifications.
 */
export const KITCHEN_SLA = {
  /** Normal preparation target: < 7 minutes. */
  TARGET_MINUTES: 7,
  /** Warning threshold (yellow): 7 - 12 minutes. */
  WARNING_MINUTES: 7,
  /** Critical / Urgent overdue threshold (red): >= 12 minutes. */
  URGENT_MINUTES: 12,
} as const;
