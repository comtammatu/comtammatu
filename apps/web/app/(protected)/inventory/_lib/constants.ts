/* ─── Ingredient domain constants ─── */

export const STORAGE_TYPE_VALUES = [
  "ambient",
  "refrigerated",
  "frozen",
] as const;

export type StorageType = (typeof STORAGE_TYPE_VALUES)[number];

export const STORAGE_OPTIONS = [
  { value: "ambient", label: "Thường" },
  { value: "refrigerated", label: "Lạnh" },
  { value: "frozen", label: "Đông lạnh" },
] as const;

export const STORAGE_LABELS: Record<string, string> = {
  ambient: "Thường",
  refrigerated: "Lạnh",
  frozen: "Đông lạnh",
};

export const STORAGE_TYPE_BY_LABEL: Record<
  string,
  StorageType
> = {
  thường: "ambient",
  thuong: "ambient",
  ambient: "ambient",
  lạnh: "refrigerated",
  lanh: "refrigerated",
  mát: "refrigerated",
  mat: "refrigerated",
  refrigerated: "refrigerated",
  "đông lạnh": "frozen",
  "dong lanh": "frozen",
  đông: "frozen",
  dong: "frozen",
  frozen: "frozen",
};

export const ITEM_KIND_VALUES = [
  "raw_material",
  "finished_good",
] as const;

export type ItemKind = (typeof ITEM_KIND_VALUES)[number];

export const ITEM_KIND_OPTIONS = [
  { value: "raw_material", label: "Nguyên liệu" },
  { value: "finished_good", label: "Thành phẩm" },
] as const;

export const ITEM_KIND_LABELS: Record<string, string> = {
  raw_material: "Nguyên liệu",
  finished_good: "Thành phẩm",
};

export const ITEM_KIND_BY_LABEL: Record<string, ItemKind> = {
  "nguyên liệu": "raw_material",
  "nguyen lieu": "raw_material",
  raw_material: "raw_material",
  "thành phẩm": "finished_good",
  "thanh pham": "finished_good",
  finished_good: "finished_good",
};

/* ─── Category tone map ─── */

export const CATEGORY_TONE_CLASS: Record<string, string> = {
  Thịt: "bg-destructive/10 text-destructive",
  Gạo: "bg-primary/10 text-primary",
  "Gia vị": "bg-warning/10 text-warning",
  "Rau củ": "bg-success/10 text-success",
  Trứng: "bg-primary/10 text-primary",
  "Chế biến": "bg-info/10 text-info",
  Dầu: "bg-muted text-muted-foreground",
};

/* ─── PostgreSQL error codes ─── */

export const PG_ERR = {
  UNIQUE_VIOLATION: "23505",
  FK_VIOLATION: "23503",
  CHECK_VIOLATION: "23514",
  INSUFFICIENT_PRIVILEGE: "42501",
  INVALID_TEXT_REPRESENTATION: "22023",
} as const;
