// Generic primitive UI defaults (Vietnamese). Consumed by `@comtammatu/ui`
// for select/search/pagination a11y labels. Domain-specific placeholders stay
// in module dictionaries; route copy stays in `apps/web/lib/messages/*`.

export const UI_VI = {
  selectPlaceholder: "Chọn...",
  searchPlaceholder: "Tìm...",
  emptyMessage: "Không tìm thấy.",
  alreadyAppliedHint: "Đã có",
  pickHint: "Tích để chọn",
  pendingSelected: (count: number) => `${count} đang chọn`,
  paginationNav: "Phân trang",
} as const;

export type UiKey = Exclude<keyof typeof UI_VI, "pendingSelected">;
