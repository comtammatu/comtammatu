/**
 * Inventory phiếu RPC error vocabulary for `mapRpcError`.
 *
 * Stable `errorCode` values are for client branching; Vietnamese
 * `userMessage` is display-only and may drift.
 */

import type {
  RpcErrorFallback,
  RpcErrorMapping,
} from "@/_lib/rpc-error-map";
import { includesAny } from "@/_lib/rpc-error-map";

/** Stable inventory failure codes shared across Branch + Owner/Ops. */
export const INVENTORY_ERROR_CODES = {
  INSUFFICIENT_STOCK: "insufficient_stock",
  INSUFFICIENT_STOCK_MULTI: "insufficient_stock_multi",
  WASTE_EVIDENCE_REQUIRED: "waste_evidence_required",
  PRODUCTION_SHORTAGE: "PRODUCTION_SHORTAGE",
  PRODUCTION_RECIPE_NOT_ACTIVE: "PRODUCTION_RECIPE_NOT_ACTIVE",
  PRODUCTION_TRANSITION_INVALID: "PRODUCTION_TRANSITION_INVALID",
  PRODUCTION_ACTUAL_PAYLOAD_INVALID: "PRODUCTION_ACTUAL_PAYLOAD_INVALID",
  PRODUCTION_LOCATION_SCOPE_INVALID: "PRODUCTION_LOCATION_SCOPE_INVALID",
  FORBIDDEN: "inventory.forbidden",
  NOT_FOUND: "inventory.not_found",
  INVALID_STATUS: "inventory.invalid_status",
  INVALID_INPUT: "inventory.invalid_input",
  RPC_UNKNOWN: "rpc_unknown",
  TRANSFER_CREATE_FAILED: "inventory.transfer.create_failed",
  TRANSFER_SHIP_FAILED: "inventory.transfer.ship_failed",
  TRANSFER_RECEIVE_FAILED: "inventory.transfer.receive_failed",
  TRANSFER_IN_TRANSIT_FAILED: "inventory.transfer.in_transit_failed",
  TRANSFER_CANCEL_FAILED: "inventory.transfer.cancel_failed",
  WASTE_CREATE_FAILED: "inventory.waste.create_failed",
  WASTE_APPROVE_FAILED: "inventory.waste.approve_failed",
  STOCKTAKE_SUBMIT_FAILED: "inventory.stocktake.submit_failed",
  STOCKTAKE_CLOSED: "inventory.stocktake.closed",
  ISSUE_LINE_FAILED: "inventory.issue.line_failed",
  ISSUE_CONFIRM_FAILED: "inventory.issue.confirm_failed",
  GRN_LINE_FAILED: "inventory.grn.line_failed",
  GRN_CONFIRM_FAILED: "inventory.grn.confirm_failed",
  STOCK_REQUEST_FAILED: "inventory.stock_request.failed",
  PROCUREMENT_FAILED: "inventory.procurement.failed",
} as const;

export type InventoryErrorCode =
  (typeof INVENTORY_ERROR_CODES)[keyof typeof INVENTORY_ERROR_CODES];

const privilege: RpcErrorMapping = {
  match: (_msg, code) => code === "42501",
  errorCode: INVENTORY_ERROR_CODES.FORBIDDEN,
  userMessage: "Bạn không có quyền thực hiện thao tác này.",
};

const notFound: RpcErrorMapping = {
  match: (msg, code) =>
    code === "P0002" || includesAny("not found", "not_found")(msg),
  errorCode: INVENTORY_ERROR_CODES.NOT_FOUND,
  userMessage: "Không tìm thấy chứng từ.",
};

/* ─── Transfer ─── */

export const transferCreateRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("insufficient_stock"),
    errorCode: INVENTORY_ERROR_CODES.INSUFFICIENT_STOCK,
    userMessage: "Tồn kho gửi không đủ cho số lượng xuất.",
  },
  {
    match: (_msg, code) => code === "23514" || code === "22023",
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Thông tin kho luân chuyển không hợp lệ.",
  },
  privilege,
];

export const transferCreateRpcFallback: RpcErrorFallback = {
  userMessage: "Không thể tạo phiếu chuyển.",
  errorCode: INVENTORY_ERROR_CODES.TRANSFER_CREATE_FAILED,
};

export const transferShipRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("insufficient_stock"),
    errorCode: INVENTORY_ERROR_CODES.INSUFFICIENT_STOCK,
    userMessage: "Tồn kho gửi không đủ. Kiểm tra lại số lượng xuất.",
  },
  {
    match: includesAny("invalid_status", "not draft", "not_shippable"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage: "Phiếu không còn ở trạng thái cho phép xuất.",
  },
  privilege,
  notFound,
];

export const transferShipRpcFallback: RpcErrorFallback = {
  userMessage: "Không thể xác nhận xuất. Kiểm tra tồn kho gửi và trạng thái phiếu.",
  errorCode: INVENTORY_ERROR_CODES.TRANSFER_SHIP_FAILED,
};

export const transferInTransitRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("invalid_status"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage: "Phiếu không còn ở trạng thái cho phép chuyển vận chuyển.",
  },
  privilege,
  notFound,
];

export const transferInTransitRpcFallback: RpcErrorFallback = {
  userMessage: "Không thể chuyển trạng thái vận chuyển.",
  errorCode: INVENTORY_ERROR_CODES.TRANSFER_IN_TRANSIT_FAILED,
};

export const transferConfirmReceiveRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny(
      "invalid_status",
      "in_transit",
      "must be",
      "not in transit",
    ),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage: "Phiếu phải đang vận chuyển trước khi bắt đầu kiểm nhận.",
  },
  privilege,
  notFound,
];

export const transferConfirmReceiveRpcFallback: RpcErrorFallback = {
  userMessage: "Không thể bắt đầu kiểm nhận (phiếu phải đang vận chuyển).",
  errorCode: INVENTORY_ERROR_CODES.TRANSFER_RECEIVE_FAILED,
};

export const transferReceiveRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("invalid_status", "confirmed_receive"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage: "Hãy bắt đầu kiểm nhận trước khi xác nhận số lượng.",
  },
  {
    match: includesAny(
      "short_receive_classification_required",
      "shortfall_class",
    ),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Chọn phân loại thiếu hụt trước khi xác nhận.",
  },
  {
    match: includesAny("short_receive_reason_required"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Ghi chú thiếu hụt cần ít nhất 5 ký tự.",
  },
  {
    match: includesAny("receive_qty", "quantity"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Số lượng nhận không hợp lệ.",
  },
  privilege,
  notFound,
];

export const transferReceiveRpcFallback: RpcErrorFallback = {
  userMessage: "Không thể xác nhận nhập kho đích.",
  errorCode: INVENTORY_ERROR_CODES.TRANSFER_RECEIVE_FAILED,
};

export const transferCancelRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("reason_required"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Vui lòng nhập lý do ít nhất 5 ký tự.",
  },
  {
    match: includesAny("draft", "invalid_status", "not cancellable"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage: "Chỉ có thể hủy phiếu điều chuyển đang ở trạng thái nháp.",
  },
  privilege,
  notFound,
];

export const transferCancelRpcFallback: RpcErrorFallback = {
  userMessage: "Chỉ có thể hủy phiếu điều chuyển đang ở trạng thái nháp.",
  errorCode: INVENTORY_ERROR_CODES.TRANSFER_CANCEL_FAILED,
};

/* ─── Waste ─── */

export const wasteCreateRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("insufficient_stock"),
    errorCode: INVENTORY_ERROR_CODES.INSUFFICIENT_STOCK,
    userMessage: "Số lượng vượt tồn hiện tại.",
  },
  {
    match: (_msg, code) => code === "42501",
    errorCode: INVENTORY_ERROR_CODES.WASTE_EVIDENCE_REQUIRED,
    userMessage: "Cần ảnh bằng chứng trước khi ghi nhận hao hụt.",
  },
  {
    match: (_msg, code) => code === "22023",
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Dữ liệu hủy hàng không hợp lệ hoặc thiếu bằng chứng bắt buộc.",
  },
  {
    match: (_msg, code) => code === "23503",
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Đơn vị không thuộc nguyên liệu.",
  },
];

export const wasteCreateRpcFallback: RpcErrorFallback = {
  userMessage: "Không tạo được phiếu hủy.",
  errorCode: INVENTORY_ERROR_CODES.WASTE_CREATE_FAILED,
};

export const wasteApproveRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("self-approval", "self_approval"),
    errorCode: INVENTORY_ERROR_CODES.FORBIDDEN,
    userMessage: "Không thể tự duyệt phiếu của mình (4-eye principle).",
  },
  privilege,
  notFound,
];

export const wasteApproveRpcFallback: RpcErrorFallback = {
  userMessage: "Không duyệt được phiếu hủy.",
  errorCode: INVENTORY_ERROR_CODES.WASTE_APPROVE_FAILED,
};

/* ─── Stocktake ─── */

export const stocktakeSubmitRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: (_msg, code) => code === "42501",
    errorCode: INVENTORY_ERROR_CODES.STOCKTAKE_CLOSED,
    userMessage: "Không có quyền hoặc kỳ kiểm kê đã đóng.",
  },
  {
    match: includesAny("closed", "period", "invalid_status", "not open"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage: "Phiên kiểm kê không còn cho phép gửi số đếm.",
  },
  {
    match: includesAny("invalid", "quantity", "count"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Số đếm không hợp lệ. Kiểm tra lại từng dòng.",
  },
  notFound,
];

export const stocktakeSubmitRpcFallback: RpcErrorFallback = {
  userMessage: "Không gửi được vòng đếm. Kiểm tra quyền và trạng thái phiên.",
  errorCode: INVENTORY_ERROR_CODES.STOCKTAKE_SUBMIT_FAILED,
};

/* ─── Issue ─── */

export const issueLineRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("insufficient_stock"),
    errorCode: INVENTORY_ERROR_CODES.INSUFFICIENT_STOCK,
    userMessage: "Số lượng vượt tồn hiện tại.",
  },
  {
    match: includesAny("not draft", "invalid_status"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage: "Chỉ có thể lưu dòng khi phiếu còn ở trạng thái nháp.",
  },
  {
    match: (_msg, code) => code === "23503",
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Đơn vị không thuộc nguyên liệu.",
  },
  {
    match: (_msg, code) => code === "22023" || code === "P0002",
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage: "Phiếu đã thay đổi. Tải lại trang rồi thử lại.",
  },
  privilege,
];

export const issueLineRpcFallback: RpcErrorFallback = {
  userMessage: "Không thể lưu dòng phiếu xuất.",
  errorCode: INVENTORY_ERROR_CODES.ISSUE_LINE_FAILED,
};

export const issueConfirmRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("insufficient_stock"),
    errorCode: INVENTORY_ERROR_CODES.INSUFFICIENT_STOCK,
    userMessage: "Tồn kho không đủ để xuất. Kiểm tra lại số lượng.",
  },
  {
    match: includesAny("invalid_status", "not draft"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage: "Phiếu xuất không còn ở trạng thái cho phép xác nhận.",
  },
  privilege,
  notFound,
];

export const issueConfirmRpcFallback: RpcErrorFallback = {
  userMessage: "Không thể xác nhận phiếu xuất.",
  errorCode: INVENTORY_ERROR_CODES.ISSUE_CONFIRM_FAILED,
};

/* ─── GRN ─── */

export const grnLineRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("finished_good_not_purchased"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Thành phẩm không mua từ nhà cung cấp.",
  },
  {
    match: includesAny("supplier_item_mapping_required"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Nguyên liệu chưa được gán cho nhà cung cấp.",
  },
  {
    match: includesAny("not draft", "invalid_status"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage: "Chỉ sửa được dòng khi phiếu nhập còn nháp.",
  },
  privilege,
  notFound,
];

export const grnLineRpcFallback: RpcErrorFallback = {
  userMessage: "Không thể lưu dòng phiếu nhập.",
  errorCode: INVENTORY_ERROR_CODES.GRN_LINE_FAILED,
};

export const grnConfirmRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("grn_qc_quantity_mismatch"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage:
      "Kết quả kiểm nhận chưa khớp số lượng từ chối. Kiểm tra lại từng mặt hàng.",
  },
  {
    match: includesAny("grn_qc_reason_required"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Hàng nhận một phần hoặc từ chối phải có lý do.",
  },
  {
    match: includesAny("grn_qc_photo_required"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Hàng nhận một phần hoặc từ chối phải có ảnh chứng từ.",
  },
  {
    match: includesAny("grn_rejection_evidence_required"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Hàng từ chối phải có đủ lý do và ảnh chứng từ.",
  },
  {
    match: includesAny("grn_has_no_accepted_quantity"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Chưa có số lượng nhận hợp lệ để chốt nhập kho.",
  },
  {
    match: includesAny("grn_confirm_requires_approved_po"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage:
      "Chưa thể chốt nhập kho. Cần đơn đặt hàng đã duyệt gắn với phiếu nhập này.",
  },
  {
    match: includesAny("grn_not_draft"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage: "Chỉ chốt được phiếu nhập ở trạng thái nháp.",
  },
  privilege,
  notFound,
];

/* ─── Stock request ─── */

export const stockRequestRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("ingredient_fulfill_site_required"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Nguyên liệu chưa gán nguồn Kho Tổng / Bếp TT.",
  },
  {
    match: includesAny("stock_request_empty"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Phiếu yêu cầu cần ít nhất một dòng.",
  },
  {
    match: includesAny("stock_request_line_invalid"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Nguyên liệu hoặc đơn vị không còn hợp lệ.",
  },
  {
    match: includesAny("insufficient_stock"),
    errorCode: INVENTORY_ERROR_CODES.INSUFFICIENT_STOCK,
    userMessage: "Tồn kho không đủ cho các dòng đã chọn.",
  },
  {
    match: includesAny("reason_required"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Vui lòng nhập lý do ít nhất 5 ký tự.",
  },
  privilege,
  notFound,
];

export const stockRequestRpcFallback: RpcErrorFallback = {
  userMessage: "Không thể hoàn tất yêu cầu hàng.",
  errorCode: INVENTORY_ERROR_CODES.STOCK_REQUEST_FAILED,
};

/* ─── Procurement (PR / PO / demand) ─── */

export const procurementRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("finished_good_not_purchased"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Thành phẩm không mua từ nhà cung cấp.",
  },
  {
    match: includesAny("purchase_request_central_site_required"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Yêu cầu mua phải thuộc Kho Tổng hoặc Bếp Trung Tâm.",
  },
  {
    match: includesAny("purchase_request_line_invalid"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Có dòng yêu cầu mua không hợp lệ.",
  },
  {
    match: includesAny("purchase_request_not_editable"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage: "Yêu cầu mua đã có đơn đặt hàng hoặc không còn được phép sửa.",
  },
  {
    match: includesAny("purchase_request_not_cancellable"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage: "Yêu cầu mua đã có đơn đặt hàng hoặc không còn được phép hủy.",
  },
  {
    match: includesAny("purchase_request_not_closable"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage: "Chỉ đóng được yêu cầu mua đã xử lý một phần.",
  },
  {
    match: includesAny("purchase_request_not_orderable"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage: "Yêu cầu mua chưa sẵn sàng tạo đơn đặt hàng.",
  },
  {
    match: includesAny("purchase_demand_not_editable"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage: "Nhu cầu mua không còn được phép sửa.",
  },
  {
    match: includesAny("purchase_demand_allocation_started"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage:
      "Kế toán đã lưu phân bổ NCC. Cần gửi lại Kho trước khi sửa.",
  },
  {
    match: includesAny("purchase_demand_not_allocatable"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage: "Nhu cầu mua không còn chờ phân bổ nhà cung cấp.",
  },
  {
    match: includesAny("purchase_demand_not_reviewable"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage: "Nhu cầu mua không còn chờ Kế toán xử lý.",
  },
  {
    match: includesAny("purchase_demand_allocation_incomplete"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage:
      "Phải phân bổ đủ số lượng của mọi nguyên liệu trước khi duyệt.",
  },
  {
    match: includesAny("purchase_demand_allocations_invalid"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Phân bổ nhà cung cấp hoặc số lượng không hợp lệ.",
  },
  {
    match: includesAny("purchase_demand_idempotency_required"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Không thể chống gửi trùng cho thao tác này.",
  },
  {
    match: includesAny("purchase_order_line_invalid"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Số lượng hoặc đơn vị trên phiếu mua không hợp lệ.",
  },
  {
    match: includesAny("purchase_order_group_not_editable"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage: "Nhóm phiếu mua không còn được phép sửa.",
  },
  {
    match: includesAny("purchase_order_not_reviewable"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage: "Phiếu mua không còn chờ duyệt.",
  },
  {
    match: includesAny("purchase_order_not_sendable"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage: "Đơn đặt hàng chưa đủ dữ liệu hoặc không còn được phép gửi.",
  },
  {
    match: includesAny("purchase_order_not_editable"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage:
      "Đơn đặt hàng đã phát sinh nhập kho hoặc không còn được phép sửa.",
  },
  {
    match: includesAny("purchase_order_lines_locked"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage:
      "Đơn đặt hàng đã có phiếu nhập nháp nên các dòng hàng đang bị khóa.",
  },
  {
    match: includesAny("purchase_order_not_cancellable"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage:
      "Đơn đặt hàng đã có phiếu nhập xác nhận hoặc không còn được phép hủy.",
  },
  {
    match: includesAny("purchase_order_not_closable"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_STATUS,
    userMessage: "Chỉ đóng được đơn đặt hàng đã nhận một phần.",
  },
  {
    match: includesAny("reason_required"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Vui lòng nhập lý do tối thiểu 5 ký tự.",
  },
  {
    match: includesAny("supplier_item_mapping_required"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Có nguyên liệu chưa được gán cho nhà cung cấp.",
  },
  {
    match: includesAny("receiving_warehouse_required"),
    errorCode: INVENTORY_ERROR_CODES.INVALID_INPUT,
    userMessage: "Chưa cấu hình kho nhận hàng.",
  },
  privilege,
  notFound,
];

/* ─── Production ─── */

export const productionRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("recipe_not_active"),
    errorCode: INVENTORY_ERROR_CODES.PRODUCTION_RECIPE_NOT_ACTIVE,
    userMessage: "Công thức cần được duyệt trước khi tạo lệnh.",
  },
  {
    match: includesAny("production_transition_invalid"),
    errorCode: INVENTORY_ERROR_CODES.PRODUCTION_TRANSITION_INVALID,
    userMessage: "Trạng thái lệnh không cho phép thao tác này.",
  },
  {
    match: includesAny("actual_payload_invalid"),
    errorCode: INVENTORY_ERROR_CODES.PRODUCTION_ACTUAL_PAYLOAD_INVALID,
    userMessage: "Số liệu nguyên liệu thực tế không khớp lệnh đã tạo.",
  },
  {
    match: includesAny("insufficient_stock_for_production"),
    errorCode: INVENTORY_ERROR_CODES.PRODUCTION_SHORTAGE,
    userMessage: "Kho không đủ nguyên liệu.",
  },
  {
    match: includesAny(
      "production_site_invalid",
      "production_source_location_invalid",
      "production_target_location_invalid",
    ),
    errorCode: INVENTORY_ERROR_CODES.PRODUCTION_LOCATION_SCOPE_INVALID,
    userMessage: "Vị trí sản xuất không thuộc Bếp Trung Tâm đã chọn.",
  },
  {
    match: (msg, code) =>
      code === "42501" || includesAny("branch_scope_violation")(msg),
    errorCode: INVENTORY_ERROR_CODES.FORBIDDEN,
    userMessage: "Không có quyền thực hiện.",
  },
];

export const productionRpcFallback: RpcErrorFallback = {
  userMessage: "Không thể cập nhật Lệnh sản xuất.",
  errorCode: INVENTORY_ERROR_CODES.RPC_UNKNOWN,
};
