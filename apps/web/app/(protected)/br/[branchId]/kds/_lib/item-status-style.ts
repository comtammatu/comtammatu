export function getItemRowStatusClass(status: string): string | false {
  if (status === "ready") {
    return "bg-success/10";
  }
  return false;
}

export function getQuantityStatusClass(status: string): string {
  if (status === "ready") {
    return "bg-success/15 text-success ring-success/20";
  }
  if (status === "cancelled") {
    return "bg-muted text-muted-foreground ring-border";
  }
  return "bg-muted text-foreground ring-border";
}
