export const invoiceBuyer = {
  title: "Nhận HĐĐT",
  order: (branchName: string, orderNumber: string) =>
    `${branchName} · Đơn ${orderNumber}`,
  submittedTitle: "Đã nhận thông tin",
  submittedDescription: "HĐĐT đang được xử lý theo thông tin bạn đã gửi.",
  expiredTitle: "Mã QR đã hết hạn",
  expiredDescription:
    "Vui lòng liên hệ nhân viên nếu bạn vẫn cần điều chỉnh thông tin HĐĐT.",
  closedTitle: "HĐĐT đã được xử lý",
  closedDescription:
    "Thông tin người mua của đơn hàng này không còn có thể thay đổi.",
  success:
    "Đã nhận thông tin. HĐĐT sẽ được phát hành theo dữ liệu mã số thuế vừa xác nhận.",
  lookupLoading: "Đang tra cứu mã số thuế…",
  lookupFound: "Đã lấy tên đơn vị và địa chỉ từ dữ liệu tra cứu.",
  lookupNotFound: "Mã số thuế chưa hợp lệ hoặc không tìm thấy.",
  lookupUnavailable: "Chưa thể tra cứu. Vui lòng thử lại.",
  sectionTitle: "Thông tin xuất HĐĐT",
  sectionDescription: (expiresAt: string) =>
    `Nhập mã số thuế; tên đơn vị và địa chỉ sẽ được tự động điền. Xác nhận trước ${expiresAt}.`,
  taxCodeLabel: "Mã số thuế",
  lookupAction: "Tra cứu",
  taxCodeInvalid: "Mã số thuế gồm 10 số hoặc 10 số-3 số.",
  buyerNameLabel: "Họ tên / Tên đơn vị",
  autoFilledPlaceholder: "Tự động điền sau khi tra cứu",
  addressLabel: "Địa chỉ",
  emailLabel: "Email nhận hóa đơn",
  submitAction: "Xác nhận thông tin xuất HĐĐT",
  invalid: "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.",
  serverLookupUnavailable: "Chưa thể tra cứu mã số thuế. Vui lòng thử lại.",
  serverLookupNotFound: "Không tìm thấy thông tin cho mã số thuế này.",
  expired: "Mã QR đã hết hạn.",
  closed: "HĐĐT của đơn hàng đã được xử lý.",
  tooManyRequests: "Bạn thao tác quá nhanh. Vui lòng chờ một lát rồi thử lại.",
  saveFailed: "Chưa thể lưu thông tin. Vui lòng thử lại.",
} as const;
