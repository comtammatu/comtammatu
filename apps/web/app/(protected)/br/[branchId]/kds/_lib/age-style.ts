import { KITCHEN_SLA } from "@lib/operational-sla";

export function getAgeStyle(minutes: number, isComplete: boolean) {
  if (isComplete) return { text: "text-success", bg: "" };
  if (minutes < KITCHEN_SLA.WARNING_MINUTES) return { text: "text-success", bg: "" };
  if (minutes < KITCHEN_SLA.URGENT_MINUTES)
    return { text: "text-warning", bg: "bg-warning/10" };
  return { text: "text-destructive", bg: "bg-destructive/10" };
}

export function getCardLeftAccent(
  overallStatus: string,
  ageMinutes: number,
): string {
  if (overallStatus === "cancelled") return "border-l-destructive";
  if (overallStatus === "ready") return "border-l-success";
  if (ageMinutes >= KITCHEN_SLA.URGENT_MINUTES) return "border-l-destructive";
  if (ageMinutes >= KITCHEN_SLA.WARNING_MINUTES) return "border-l-warning";
  return "border-l-muted-foreground";
}
