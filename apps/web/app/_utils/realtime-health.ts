export const REALTIME_DEGRADED_POLL_MS = 60_000;
export const REALTIME_SAFETY_POLL_MS = 300_000;

export type RealtimeChannelHealth = "connecting" | "degraded" | "healthy";

export function realtimeHealthFromStatus(
  status: string,
): RealtimeChannelHealth | null {
  if (status === "SUBSCRIBED") return "healthy";
  if (status === "CONNECTING") return "connecting";
  if (
    status === "CHANNEL_ERROR" ||
    status === "TIMED_OUT" ||
    status === "CLOSED"
  ) {
    return "degraded";
  }
  return null;
}

export function shouldRunRealtimeFallback(
  health: RealtimeChannelHealth,
  elapsedMs: number,
  thresholds: {
    degradedPollMs?: number;
    safetyPollMs?: number;
  } = {},
): boolean {
  const threshold =
    health === "healthy"
      ? (thresholds.safetyPollMs ?? REALTIME_SAFETY_POLL_MS)
      : (thresholds.degradedPollMs ?? REALTIME_DEGRADED_POLL_MS);
  return elapsedMs >= threshold;
}
