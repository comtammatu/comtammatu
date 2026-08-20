import { KITCHEN_SLA } from "@lib/operational-sla";

const ELAPSED_CLOCK_MAX_SECONDS = 99 * 60 + 59;

export function getElapsedMinutes(elapsedMs: number): number {
  return Math.max(0, Math.floor(elapsedMs / 60_000));
}

export function formatKdsElapsedClock(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const capped = Math.min(totalSeconds, ELAPSED_CLOCK_MAX_SECONDS);
  const minutes = Math.floor(capped / 60);
  const seconds = capped % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function getAgeStyle(minutes: number, isComplete: boolean) {
  if (isComplete) return { text: "text-success", bg: "bg-success/10" };
  if (minutes < KITCHEN_SLA.WARNING_MINUTES) return { text: "text-success", bg: "" };
  if (minutes < KITCHEN_SLA.URGENT_MINUTES)
    return { text: "text-warning", bg: "bg-warning/10" };
  return { text: "text-destructive", bg: "bg-destructive/10" };
}
