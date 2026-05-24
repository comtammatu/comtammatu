export const STATUS_CONFIG = {
  pending: { label: "Chờ", variant: "warning" as const },
  preparing: { label: "Đang làm", variant: "warning" as const },
  ready: { label: "Xong", variant: "success" as const },
  cancelled: { label: "Đã hủy", variant: "destructive" as const },
} as const;

export type StatusVariant = "warning" | "success" | "destructive";

export function getStatusLabel(status: string): string {
  return STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]?.label ?? status;
}

export function getStatusVariant(status: string): StatusVariant {
  return (
    STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]?.variant ?? "warning"
  );
}

export const ORDER_TYPE_CONFIG: Record<string, { label: string }> = {
  dine_in: { label: "Tại bàn" },
  takeaway: { label: "Mang về" },
};

export function getOrderTypeLabel(orderType: string): string {
  return ORDER_TYPE_CONFIG[orderType]?.label ?? orderType;
}
