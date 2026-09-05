/**
 * Predicates for idle POS postgres_changes that share `pos-branch-{id}`.
 * Date and session identity stay in the handler — Realtime filters only
 * support simple `eq`, so yesterday's limit rows and other-session closes
 * must be dropped client-side.
 */

export function isCurrentDailyLimitRealtimeEvent(
  eventType: string,
  payload: { old: unknown; new: unknown },
  todayYmd: string,
): boolean {
  const row = (eventType === "DELETE" ? payload.old : payload.new) as {
    limit_date?: unknown;
  } | null;
  if (row == null || typeof row !== "object") return true;
  if (typeof row.limit_date === "string" && row.limit_date !== todayYmd) {
    return false;
  }
  return true;
}

export function isClosedPosSessionUpdate(
  next: unknown,
  sessionId: number,
): boolean {
  return (
    next !== null &&
    typeof next === "object" &&
    "id" in next &&
    "status" in next &&
    (next as { id: number }).id === sessionId &&
    (next as { status: string }).status === "closed"
  );
}
