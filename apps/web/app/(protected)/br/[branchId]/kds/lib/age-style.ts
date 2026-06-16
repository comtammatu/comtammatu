export function getAgeStyle(minutes: number, isComplete: boolean) {
  if (isComplete) return { text: "text-success", bg: "" };
  if (minutes < 5) return { text: "text-success", bg: "" };
  if (minutes < 10) return { text: "text-warning", bg: "bg-warning/10" };
  return { text: "text-destructive", bg: "bg-destructive/10" };
}

export function getCardLeftAccent(
  overallStatus: string,
  ageMinutes: number,
): string {
  if (overallStatus === "cancelled") return "border-l-destructive";
  if (overallStatus === "ready") return "border-l-success";
  if (ageMinutes >= 10) return "border-l-destructive";
  if (ageMinutes >= 5) return "border-l-warning";
  return "border-l-muted-foreground";
}
