// UI state labels (Vietnamese) — loading, empty, success copy. Short status
// strings shown to users; not generic actions.
export const STATES_VI = {
  loading: "Đang tải…",
  loadingMore: "Đang tải thêm…",
  processing: "Đang xử lý…",
  saving: "Đang lưu…",
  empty: "Chưa có dữ liệu",
  emptyHint: "Dữ liệu sẽ hiển thị ở đây khi có",
  noResults: "Không tìm thấy kết quả",
  noResultsHint: "Thử đổi từ khóa hoặc bộ lọc",
  saved: "Đã lưu thay đổi",
  created: "Tạo mới thành công",
  updated: "Cập nhật thành công",
  deleted: "Đã xóa",
  approved: "Đã duyệt",
  rejected: "Đã từ chối",
  cancelled: "Đã hủy",
  pending: "Đang chờ",
  required: "Bắt buộc",
  optional: "Tùy chọn",
} as const;

export type StateKey = keyof typeof STATES_VI;
