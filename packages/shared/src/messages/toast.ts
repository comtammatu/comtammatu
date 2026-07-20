// Shared toast/notify Vietnamese messages.
export const TOAST_VI = {
  enterValidQuantity: "Nhập số lượng hợp lệ",
  writeOffFailed: "Không thể xóa sổ.",
  exported: "Đã xuất file",
  exportedBom: "Đã xuất file công thức sản xuất",
  imageUploaded: "Đã tải ảnh lên.",
  imageUploadFailed: "Không thể tải ảnh lên. Vui lòng thử lại.",
  productionOrderCreated: "Đã tạo lệnh sản xuất",
} as const;

export type ToastKey = keyof typeof TOAST_VI;
