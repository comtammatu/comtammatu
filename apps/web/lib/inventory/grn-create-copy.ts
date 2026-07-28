import { STATES_VI } from "@comtammatu/shared/messages";
import { formatCount, formatPercent } from "@comtammatu/shared/format";
import { formatQty, formatVND } from "@lib/inventory/format";

export const GRN_CREATE_COPY = {
  changeSupplier: "Đổi nhà cung cấp",
  newReceiptEyebrow: "Phiếu nhập mới",
  discardDraft: "Hủy nháp",
  addItemToContinue: "Thêm mặt hàng để tiếp tục",
  unitCostTitle: "Đơn giá nhập",
  editItem: "Sửa mặt hàng",
  addItem: "Thêm mặt hàng",
  addLineToReceipt: "Thêm vào phiếu",
  updateLineOnReceipt: "Cập nhật",
  editLineAria: "Sửa dòng",
  deleteLineAria: "Xóa dòng",
  lineActionsAria: "Thao tác dòng",
  searchPlaceholder: "Tìm theo tên hoặc mã SKU",
  emptyTitle: "Không thấy nguyên liệu",
  emptyDescription: "Thử từ khóa khác hoặc kiểm tra lại danh mục.",
  emptySupplierTitle: "NCC chưa được gán nguyên liệu",
  emptySupplierDescription:
    "Cấu hình tại Danh mục → Nhà cung cấp trước khi lập phiếu nhập.",
  draftLinesTitle: "Mặt hàng trên phiếu",
  draftEmptyTitle: "Chưa có mặt hàng",
  draftEmptyDescription: "Nhấn Thêm mặt hàng để chọn nguyên liệu.",
  /** Dialog title for the progressive catalog picker (not a page section). */
  catalogTitle: "Thêm mặt hàng",
  optionalNote: "Ghi chú (tùy chọn)",
  notePlaceholder: "Tình trạng, nhiệt độ...",
  addedSummary: (lineCount: number) =>
    `Đã thêm ${formatCount(lineCount)} mặt hàng`,
  /** Draft footer before PO price sync — count only, no warehouse money total. */
  footerLineSummary: (lineCount: number) =>
    `${formatCount(lineCount)} mặt hàng`,
  reviewBeforeConfirm: (lineCount: number) =>
    `Kiểm nhận · ${formatCount(lineCount)} mặt hàng`,
  lineUnitCost: (quantity: number, unit: string, unitCost: number) =>
    `${formatQty(quantity)} ${unit} · ${formatVND(unitCost)}/${unit}`,
  lineQtyOnly: (quantity: number, unit: string) =>
    `${formatQty(quantity)} ${unit}`,
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
    `Lần trước ${formatVND(value)}/${unit}`,
  /** Compact prior-price + variance under unit-price (create line editor). */
  priorPriceLine: (
    value: number,
    unit: string,
    variance: number | null,
  ) => {
    const prior = `Lần trước ${formatVND(value)}/${unit}`;
    if (variance == null) return prior;
    const pct = formatPercent(Math.abs(variance) * 100, 0);
    const signed =
      variance > 0 ? `+${pct}` : variance < 0 ? `-${pct}` : pct;
    return `${prior} · chênh ${signed}`;
  },
  varianceWarning: (variance: number) =>
    `Giá chênh ${formatPercent(variance * 100, 0)} so với lần trước — kiểm tra lại trước khi lưu.`,
  branchUnselected: "Chưa chọn kho nhận",
  locationUnselected: "Chưa chọn kho nhận",
  /** Site (branch) when both branch + stock location are choosable. */
  receivingBranch: "Chi nhánh",
  /**
   * Stock-bearing location within the site. Same product term as
   * `messages.inventory.grn.receivingWarehouse` ("Kho nhận").
   */
  receivingLocation: "Kho nhận",
  receivingLocationHint: "Vị trí tồn trong chi nhánh đã chọn.",
  receivingLocationSaving: STATES_VI.saving,
  toastChooseBranch: "Chưa có kho nhận hàng cho phiếu nhập.",
  toastChooseLocation: "Chưa chọn kho nhận hàng cho phiếu nhập.",
  toastCreateDraftFailed: "Không thể tạo phiếu nháp.",
  toastSaveLineFailed: "Không lưu được dòng.",
  toastDeleteLineFailed: "Không xóa được dòng.",
  toastDiscardDraftTitle: "Xóa phiếu nháp này?",
  toastDiscardDraftDesc: "Các dòng đã nhập sẽ mất.",
  toastDiscardDraftFailed: "Không thể hủy phiếu nháp.",
  toastNoLines: "Phiếu chưa có dòng nào.",
  flowErrorTitle: "Không thể tiếp tục phiếu nhập",
};
