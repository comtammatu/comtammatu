export function getItemRowStatusClass(status: string): string | false {
  if (status === "ready") {
    return "bg-success/10 ring-1 ring-inset ring-success/30";
  }
  return false;
}

export function getQuantityStatusClass(status: string): string {
  if (status === "ready") {
    return "bg-success/15 text-success ring-success/30";
  }
  if (status === "cancelled") {
    return "bg-muted text-muted-foreground ring-border";
  }
  return "bg-warning/10 text-warning ring-warning/30";
}
