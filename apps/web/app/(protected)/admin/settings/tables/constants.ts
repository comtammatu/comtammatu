import { TABLE_STATUS_LABELS_VI } from "@comtammatu/shared/labels";

export const TABLE_STATUSES = [
  "available",
  "occupied",
  "reserved",
  "maintenance",
] as const;

export type TableStatus = (typeof TABLE_STATUSES)[number];

export const STATUS_OPTIONS = TABLE_STATUSES.map((value) => ({
  value,
  label: TABLE_STATUS_LABELS_VI[value],
}));
