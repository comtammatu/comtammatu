import { TABLE_STATUS_LABELS_VI } from "@comtammatu/shared/labels";

export const TABLE_STATE_VALUES = [
  "available",
  "occupied",
  "reserved",
  "maintenance",
] as const;

export const TABLE_STATE_OPTIONS = TABLE_STATE_VALUES.map((value) => ({
  value,
  label: TABLE_STATUS_LABELS_VI[value],
}));
