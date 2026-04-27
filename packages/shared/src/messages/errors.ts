// Generic user-facing error messages (Vietnamese). Domain errors (e.g.,
// "Vượt cap waste ngày") stay in their module dictionaries.
export const ERRORS_VI = {
  fallback: "Có lỗi xảy ra, vui lòng thử lại",
  unknown: "Lỗi không xác định",
  networkError: "Mất kết nối, vui lòng thử lại",
  sessionExpired: "Phiên đăng nhập hết hạn",
  forbidden: "Bạn không có quyền thực hiện thao tác này",
  notFound: "Không tìm thấy",
  validationFailed: "Dữ liệu không hợp lệ",
  serverError: "Lỗi máy chủ, vui lòng thử lại sau",
  rateLimited: "Quá nhiều yêu cầu, vui lòng đợi",
  saveFailed: "Không thể lưu, vui lòng thử lại",
  loadFailed: "Không thể tải dữ liệu",
} as const;

export type ErrorKey = keyof typeof ERRORS_VI;
