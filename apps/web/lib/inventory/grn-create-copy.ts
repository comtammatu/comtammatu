import { STATES_VI } from "@comtammatu/shared/messages";
import { formatCount } from "@comtammatu/shared/format";
import { formatQty } from "@lib/inventory/format";

export const GRN_CREATE_COPY = {
  backToList: "Quay lại danh sách",
  newReceiptEyebrow: "Phiếu nhập mới",
  newReceiptTitle: "Phiếu nhập mới",
  discardDraft: "Hủy nháp",
  addItemToContinue: "Thêm mặt hàng để tiếp tục",
  editItem: "Sửa mặt hàng",
  addItem: "Thêm mặt hàng",
  addLineToReceipt: "Thêm vào phiếu",
  updateLineOnReceipt: "Cập nhật",
  editLineAria: "Sửa dòng",
  deleteLineAria: "Xóa dòng",
  lineActionsAria: "Thao tác dòng",
  searchPlaceholder: "Tìm theo tên hoặc mã hàng",
  emptyTitle: "Không thấy nguyên liệu",
  emptyDescription: "Thử từ khóa khác hoặc kiểm tra lại danh mục.",
  emptySupplierTitle: "Chưa có nguyên liệu gắn NCC",
  emptySupplierDescription:
    "Cấu hình tại Danh mục → Nhà cung cấp trước khi lập phiếu nhập.",
  draftLinesTitle: "Mặt hàng trên phiếu",
  draftEmptyTitle: "Chưa có mặt hàng",
  draftEmptyDescription: "Nhấn Thêm mặt hàng để chọn nguyên liệu.",
  /** Dialog title for the progressive catalog picker (not a page section). */
  catalogTitle: "Thêm mặt hàng",
  supplierLabel: "Nhà cung cấp",
  supplierSelectPlaceholder: "Chọn nhà cung cấp",
  preferredSupplierSuffix: "ưu tiên",
  supplierSummaryFallback: "Theo dòng",
  lineSupplierHeader: "NCC",
  addedSummary: (lineCount: number) =>
    `Đã thêm ${formatCount(lineCount)} mặt hàng`,
  /** Draft footer before PO price sync — count only, no warehouse money total. */
  footerLineSummary: (lineCount: number) =>
    `${formatCount(lineCount)} mặt hàng`,
  reviewBeforeConfirm: (lineCount: number) =>
    `Lưu & kiểm nhận · ${formatCount(lineCount)} mặt hàng`,
  lineQtyOnly: (quantity: number, unit: string) =>
    `${formatQty(quantity)} ${unit}`,
  unitLabel: (unit: string) => `Đơn vị: ${unit}`,
  baseConversionPreview: (
    quantity: string,
    entryUnit: string,
    baseQuantity: string,
    baseUnit: string,
  ) =>
    `Quy đổi về đơn vị chuẩn: ${quantity} ${entryUnit} = ${baseQuantity} ${baseUnit}`,
  conversionMissing: "Chưa cấu hình quy đổi",
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
  toastChooseSupplier: "Chọn nhà cung cấp cho mặt hàng.",
  toastCreateDraftFailed: "Không thể tạo phiếu nháp.",
  toastSaveLineFailed: "Không lưu được dòng.",
  toastDeleteLineFailed: "Không xóa được dòng.",
  toastDiscardDraftTitle: "Xóa phiếu nháp này?",
  toastDiscardDraftDesc: "Các dòng đã nhập sẽ mất.",
  toastDiscardDraftFailed: "Không thể hủy phiếu nháp.",
  toastNoLines: "Phiếu chưa có dòng nào.",
  flowErrorTitle: "Không thể tiếp tục phiếu nhập",
};
