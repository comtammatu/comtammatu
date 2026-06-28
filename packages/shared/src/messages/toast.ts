// Shared toast/notify Vietnamese messages.
export const TOAST_VI = {
  enterValidQuantity: "Nhập số lượng hợp lệ",
  writeOffFailed: "Không thể xóa sổ.",
  exported: "Đã xuất file",
  exportedBom: "Đã xuất file BOM sản xuất",
  imageUploaded: "Đã tải ảnh lên.",
  productionOrderCreated: "Đã tạo lệnh sản xuất",
  createGrnFromPoFailed: "Không thể tạo phiếu nhập từ PO.",
} as const;

export type ToastKey = keyof typeof TOAST_VI;
