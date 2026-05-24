/**
 * Safe Vietnamese error messages for employee self-service actions.
 * Maps common error scenarios to user-friendly Vietnamese text.
 * Never expose raw Supabase/Postgres error messages.
 */

export const EMPLOYEE_ERRORS = {
  notLoggedIn: "Chưa đăng nhập",
  noEmployee: "Tài khoản chưa được liên kết hồ sơ nhân viên. Liên hệ quản lý.",
  noBranch: "Chưa gắn chi nhánh. Liên hệ quản lý.",
  noGpsConfig: "Chi nhánh chưa cài đặt tọa độ GPS. Liên hệ quản lý.",
  noAttendanceConfig: "Chi nhánh chưa cài đặt mã chấm công. Liên hệ quản lý.",
  alreadyClockedIn: "Bạn đã chấm công vào hôm nay rồi",
  alreadyClockedOut: "Bạn đã chấm công vào và ra hôm nay rồi",
  noOpenRecord: "Không tìm thấy bản ghi chấm công vào hôm nay",
  tooFar: "Bạn đang ở quá xa chi nhánh. Phải ở trong phạm vi 200m.",
  wrongCode: "Mã chấm công không đúng",
  invalidBranch: "Chi nhánh không tồn tại",
  gpsDenied: "Bạn đã từ chối quyền GPS. Vui lòng bật GPS và thử lại.",
  gpsUnavailable: "Không xác định được vị trí. Vui lòng thử lại.",
  gpsTimeout: "GPS quá chậm. Vui lòng thử lại.",
  clockInFailed: "Không thể chấm công. Vui lòng thử lại.",
  clockOutFailed: "Không thể chấm công ra. Vui lòng thử lại.",
  generic: "Đã có lỗi xảy ra. Vui lòng thử lại.",
  loadFailed: "Không tải được dữ liệu. Vui lòng thử lại.",
} as const;

/**
 * Map a Supabase error or unknown error to a safe Vietnamese message.
 * If the error is already a known safe message (starts with a Vietnamese
 * character), pass it through. Otherwise return the generic message.
 */
export function safeEmployeeError(error: unknown): string {
  if (typeof error === "string") {
    // Check if it's already a mapped Vietnamese message
    const known = Object.values(EMPLOYEE_ERRORS) as readonly string[];
    if (known.includes(error)) return error;
  }
  return EMPLOYEE_ERRORS.generic;
}
