import { STATES_VI } from "@comtammatu/shared/messages";
import { formatCount, formatPercent } from "@comtammatu/shared/format";
import { lineTotalFromUnitCost } from "@lib/inventory/grn-draft";
import { formatQty, formatVND } from "@lib/inventory/format";

export const GRN_CREATE_COPY = {
  changeSupplier: "Đổi nhà cung cấp",
  newReceiptEyebrow: "Phiếu nhập mới",
  newReceiptDescription:
    "Thêm nguyên liệu, kiểm tra kho nhận, rồi kiểm nhận trước khi chốt.",
  discardDraft: "Hủy nháp",
  addItemToContinue: "Thêm mặt hàng để tiếp tục",
  unitCostTitle: "Đơn giá nhập",
  priceRequired: "Nhập giá",
  editItem: "Sửa mặt hàng",
  addItem: "Thêm mặt hàng",
  editLineAria: "Sửa dòng",
  deleteLineAria: "Xóa dòng",
  searchPlaceholder: "Tìm theo tên hoặc mã SKU",
  emptyTitle: "Không thấy nguyên liệu",
  emptyDescription: "Thử từ khóa khác hoặc kiểm tra lại danh mục.",
  emptySupplierTitle: "NCC chưa được gán nguyên liệu",
  emptySupplierDescription:
    "Cấu hình tại Danh mục → Nhà cung cấp trước khi lập phiếu nhập.",
  panelEmptyTitle: "Chưa chọn mặt hàng",
  panelEmptyDescription: "Chọn một nguyên liệu ở danh sách để sửa thông tin.",
  optionalNote: "Ghi chú (tùy chọn)",
  notePlaceholder: "Tình trạng, nhiệt độ...",
  addedSummary: (lineCount: number) =>
    `Đã thêm ${formatCount(lineCount)} mặt hàng`,
  reviewBeforeConfirm: (lineCount: number, total: number) =>
    `Kiểm nhận trước khi chốt · ${formatCount(lineCount)} mặt hàng · ${formatVND(total)}`,
  lineUnitCost: (quantity: number, unit: string, unitCost: number) =>
    `${formatQty(quantity)} ${unit} · ${formatVND(lineTotalFromUnitCost(quantity, unitCost))} · Đơn giá ${formatVND(unitCost)} / ${unit} ·`,
  linePriceRequired: (quantity: number, unit: string) =>
    `${formatQty(quantity)} ${unit} · Nhập đơn giá`,
  unitLabel: (unit: string) => `Đơn vị nhập: ${unit}`,
  unitPriceUnit: (unit: string, unitCost: number) =>
    unitCost > 0
      ? `Đơn giá ${formatVND(unitCost)} / ${unit}`
      : `Đơn giá / ${unit}`,
  baseConversionPreview: (
    quantity: string,
    entryUnit: string,
    baseQuantity: string,
    baseUnit: string,
  ) =>
    `Quy đổi về tồn chuẩn: ${quantity} ${entryUnit} = ${baseQuantity} ${baseUnit}`,
  conversionMissing: "Chưa cấu hình quy đổi",
  moneyVnd: (value: number) => formatVND(value),
  lastCost: (value: number, unit: string) => `${formatVND(value)}/${unit}`,
  lastCostReference: (value: number, unit: string) =>
    `Giá lần trước: ${formatVND(value)}/${unit}`,
  varianceReference: (variance: number) =>
    `Chênh ${formatPercent(variance * 100, 0)} so với lần trước.`,
  varianceWarning: (variance: number) =>
    `Giá chênh ${formatPercent(variance * 100, 0)} so với lần trước — kiểm tra lại trước khi lưu.`,
  branchUnselected: "Chưa chọn kho nhận",
  locationUnselected: "Chưa chọn nơi nhập",
  receivingLocation: "Nơi nhập",
  receivingLocationSaving: STATES_VI.saving,
  toastChooseBranch: "Chưa có kho nhận hàng cho phiếu nhập.",
  toastChooseLocation: "Chưa chọn nơi nhập hàng cho phiếu nhập.",
  toastCreateDraftFailed: "Không thể tạo phiếu nháp.",
  toastSaveLineFailed: "Không lưu được dòng.",
  toastDeleteLineFailed: "Không xóa được dòng.",
  toastDiscardDraftTitle: "Xóa phiếu nháp này?",
  toastDiscardDraftDesc: "Các dòng đã nhập sẽ mất.",
  toastDiscardDraftFailed: "Không thể hủy phiếu nháp.",
  toastNoLines: "Phiếu chưa có dòng nào.",
  toastMissingPrices: "Nhập đơn giá cho tất cả mặt hàng trước khi tiếp tục.",
  flowErrorTitle: "Không thể tiếp tục phiếu nhập",
};
