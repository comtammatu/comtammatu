// Finance / HDDT invoice-list Vietnamese copy (extracted from finance JSX).
export const FINANCE_VI = {
  replaceFailed: "Không thể thay thế hóa đơn",
  cancelFailed: "Không thể hủy hóa đơn",
  cancelled: "Đã hủy hóa đơn",
  replaceInvoice: "Thay thế hóa đơn",
  replace: "Thay thế",
  cancelInvoice: "Hủy hóa đơn",
  invoiceNumberCol: "Số HĐ",
  buyer: "Người mua",
  timeCol: "Thời gian",
  emptyNoInvoices: "Chưa có hóa đơn nào",
  cancelConfirmTitle: "Xác nhận hủy hóa đơn",
  cancelIrreversibleHint:
    "Hành động này không thể hoàn tác. Lý do hủy được lưu vào hồ sơ HĐĐT theo yêu cầu của Nghị định 70/2025.",
  cancelReasonPlaceholder:
    "Ví dụ: Khách hàng yêu cầu xuất lại HĐĐT vì sai mã số thuế.",
  replaceReasonPlaceholder:
    "Ví dụ: Sửa sai MST người mua từ 0100109106 thành 0312891234.",
  agreementDocLabel: "Văn bản thỏa thuận",
  agreementDocPlaceholder: "Số biên bản / mô tả",
  agreementDateLabel: "Ngày văn bản",
  buyerNameLabel: "Tên người mua",
  buyerTaxCodeLabel: "MST người mua",
  buyerEmailLabel: "Email nhận hóa đơn",
  buyerEmailPlaceholder: "email@example.com",
  buyerTaxCodePlaceholder: "0312891234 hoặc 0312891234-001",
  taxCodeFormatError: "MST phải có dạng 10 số hoặc 10-3 số",
  emailFormatError: "Email không hợp lệ",
  replaceConfirmTitle: "Thay thế hóa đơn",
  createReplacementInvoice: "Tạo HĐ thay thế",
} as const;

export type FinanceKey = keyof typeof FINANCE_VI;
