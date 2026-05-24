export const TABLE_STATUSES = [
  "available",
  "occupied",
  "reserved",
  "maintenance",
] as const;

export type TableStatus = (typeof TABLE_STATUSES)[number];

export const STATUS_LABELS: Record<TableStatus, string> = {
  available: "Trống",
  occupied: "Đang dùng",
  reserved: "Đã đặt",
  maintenance: "Bảo trì",
};

export const STATUS_VARIANTS: Record<
  TableStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  available: "default",
  occupied: "secondary",
  reserved: "outline",
  maintenance: "destructive",
};

export const STATUS_OPTIONS = TABLE_STATUSES.map((value) => ({
  value,
  label: STATUS_LABELS[value],
}));
