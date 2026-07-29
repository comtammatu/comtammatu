import { formatCount } from "@comtammatu/shared/format";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";

export const owner = {
  dashboard: {
    eyebrow: "Toàn hệ thống",
    title: "Trung tâm quản trị",
    description: "Chọn mảng cần kiểm soát hoặc thiết lập.",
    operationsTitle: "Điều hành",
    operationsDescription: "Tài chính, bán hàng, kho, thực đơn và nhân sự.",
    foundationTitle: "Nền tảng",
    foundationDescription: "Chi nhánh và các thiết lập dùng chung.",
    financeDescription: "Dòng tiền, thu chi, đối soát và báo cáo tài chính.",
    ordersDescription: "Theo dõi đơn hàng và xử lý ngoại lệ bán hàng.",
    inventoryDescription: "Tồn kho, nhập hàng, kiểm kê và giá trị kho.",
    menuDescription: "Món bán, giá, nhóm món và cấu hình thực đơn.",
    hrDescription: "Nhân sự, ngày công, phân quyền và lương.",
    branchesDescription: "Danh sách và thông tin các chi nhánh.",
    settingsDescription: "Thanh toán, máy in và cấu hình toàn hệ thống.",
  },
  nav: {
    ariaLabel: "Điều hướng quản trị",
    overview: "Tổng quan",
    reports: "Báo cáo",
    orders: "Đơn hàng",
    menuItems: "Thực đơn",
    inventory: "Kho",
    finance: "Tài chính",
    modules: "Mô-đun",
  },
  printTemplates: {
    loadErrorTitle: "Không thể tải mẫu phiếu in",
    loadErrorTemplates:
      "Không tải được danh sách mẫu phiếu in. Vui lòng thử lại.",
    loadErrorBranches: "Không tải được danh sách chi nhánh. Vui lòng thử lại.",
  },
  staffForm: {
    accountSection: "Tài khoản đăng nhập",
    assignmentSection: "Hồ sơ & phân công",
    createTitle: "Tạo tài khoản",
    editTitle: "Chỉnh sửa tài khoản",
    createDescription:
      "Gán chức vụ và chi nhánh; thiết lập quyền ở bước sau.",
    editDescription: "Cập nhật hồ sơ, chức vụ và chi nhánh làm việc.",
    createSuccess: "Đã tạo tài khoản",
    createContinuePermissions: "Đã tạo tài khoản. Tiếp tục thiết lập quyền.",
    editSuccess: "Đã cập nhật tài khoản",
    passwordPlaceholder: "Tối thiểu 8 ký tự",
    fullNamePlaceholder: "Nguyễn Văn A",
    rolePlaceholder: "Chọn chức vụ",
    branchPlaceholder: "Chọn chi nhánh",
    branchNotApplicable: "Không áp dụng",
    branchDescription: "Bắt buộc cho vai trò vận hành tại chi nhánh.",
  },
  staffPage: {
    title: "Tài khoản & quyền",
    description:
      "Tài khoản, chức vụ và quyền theo chi nhánh. Hồ sơ và lương ở mục Nhân sự.",
    createAccount: "Tạo tài khoản",
    hrLink: "Nhân sự",
    moreActions: "Thao tác khác",
    searchPlaceholder: "Tìm nhân viên…",
    emptySearchTitle: "Không tìm thấy tài khoản phù hợp",
    resetFilters: "Xóa lọc",
    phoneShort: "SĐT",
    actions: "Tác vụ",
    actionEdit: "Chỉnh sửa",
    actionPermissions: "Quyền",
    actionDeactivate: "Vô hiệu hóa",
    actionActivate: "Kích hoạt",
  },
  staffAudit: {
    backToStaff: "Quay lại danh sách nhân viên",
    linkLabel: "Nhật ký quyền hạn",
    title: "Nhật ký quyền hạn",
    description:
      "Mọi thao tác gán, thu hồi và áp dụng mẫu quyền. Không sửa được.",
    recentItems: (count: number) => `${formatCount(count)} mục gần nhất`,
    empty: "Không có thay đổi nào.",
    time: "Thời gian",
    action: "Hành động",
    actionLabels: {
      grant: "Đã cấp",
      revoke: "Đã thu hồi",
      apply_template: "Đã áp dụng mẫu",
    } as Record<string, string>,
    actor: "Người thao tác",
    target: "Đối tượng",
    permission: "Quyền",
    expires: "Hạn",
    tenantWide: "toàn quán",
    forever: "vĩnh viễn",
    filterActionAll: "Tất cả hành động",
    filterTargetAll: "Tất cả đối tượng",
    filterSince: "Từ ngày",
    filterApply: "Áp dụng",
    filterReset: "Xóa lọc",
    emptyFiltered: "Không có kết quả phù hợp",
    emptyFilteredHint: "Thử đổi hành động, đối tượng hoặc mốc thời gian.",
  },
  staffPermissions: {
    backToList: "Quay lại danh sách",
    statusActive: "Đang hoạt động",
    statusInactive: "Ngưng hoạt động",
    tabPermissions: "Quyền",
    tabHistory: "Lịch sử",
    positionUnassigned: "Chưa gán",
    tenantWide: "toàn quán",
    headerDescription: (positionLabel: string, branchName: string) =>
      `Chức vụ: ${positionLabel} · Chi nhánh mặc định: ${branchName}`,
    templateTitle: "Quyền theo chức vụ",
    templateDescription:
      "Dùng bộ quyền công việc đã cấu hình sẵn cho chức vụ và nơi làm việc này.",
    templateScope: (scope: string) => `Áp dụng tại ${scope}`,
    templatePreview: (permissionCount: number, groupCount: number) =>
      `Xem ${formatCount(permissionCount)} quyền trong ${formatCount(groupCount)} nhóm công việc`,
    templateApply: (positionLabel: string) =>
      `Cấp quyền cho ${positionLabel}`,
    templateApplied: (count: number) =>
      count > 0
        ? `Đã cấp thêm ${formatCount(count)} quyền`
        : "Bộ quyền này đã được cấp đầy đủ",
    templateMissing: (positionLabel: string) =>
      `Chưa có bộ quyền mặc định cho ${positionLabel}.`,
    currentTitle: "Quyền đang có",
    currentDescription:
      "Theo dõi quyền theo phạm vi, nguồn cấp và thời hạn trước khi thay đổi.",
    exceptionTitle: "Quyền cấp riêng",
    exceptionDescription:
      "Chỉ dùng khi quyền theo chức vụ chưa đáp ứng yêu cầu công việc cụ thể.",
    addException: "Cấp thêm quyền riêng",
    grantExceptionTitle: "Cấp thêm quyền riêng",
    grantExceptionDescription:
      "Chọn phạm vi, quyền và hạn kết thúc nếu đây là ủy quyền tạm thời.",
    grantExceptionSuccess: "Đã cấp thêm quyền riêng",
    permission: "Quyền",
    scope: "Phạm vi",
    source: "Nguồn",
    expires: "Hạn",
    sourceTemplate: "Theo chức vụ",
    sourceException: "Cấp riêng",
    forever: "Vĩnh viễn",
    scopePlaceholder: "Chọn phạm vi",
    permissionPlaceholder: "Chọn quyền",
    validUntil: "Hạn kết thúc (tuỳ chọn)",
    validUntilDescription: "Để trống = vĩnh viễn.",
    historyTitle: (count: number) =>
      `Lịch sử thay đổi (${formatCount(count)} mục gần nhất)`,
    branchFallback: (branchId: number) => `Chi nhánh #${branchId}`,
    otherWorkArea: "Quyền khác",
    permissionModuleLabels: {
      dashboard: "Tổng quan vận hành",
      feedback: "Phản hồi khách hàng",
      finance: "Tài chính",
      hr: "Nhân sự",
      inventory: "Kho hàng",
      inventory_procurement: "Mua hàng & nhập kho",
      kds: "Bếp",
      menu: "Thực đơn",
      orders: "Đơn hàng",
      pos: "Bán hàng",
      procurement: "Giá mua hàng",
      reports: "Báo cáo",
      settings: "Thiết lập",
      staff: "Tài khoản nhân viên",
    } as Record<string, string>,
    permissionLabels: {
      "dashboard:view": "Xem tổng quan vận hành",
      "inventory:adjust_approve": "Duyệt điều chỉnh tồn kho",
      "inventory:grn_express_extend": "Gia hạn thời gian nhập kho nhanh",
      "inventory:item_review_override_set":
        "Đặt chế độ kiểm tra riêng cho nguyên liệu",
      "inventory:request_cancel": "Hủy yêu cầu hàng",
      "inventory:request_create": "Tạo yêu cầu hàng",
      "inventory:request_fulfill": "Xuất hàng đáp ứng yêu cầu",
      "inventory:request_submit": "Gửi yêu cầu hàng",
      "inventory:stocktake_recount": "Yêu cầu đếm lại kiểm kê",
      "inventory:waste_approve": "Duyệt hao hụt vượt ngưỡng",
      "kds:mark_ready": "Đánh dấu món đã làm xong",
      "kds:recall": "Chuyển món về đang làm",
      "procurement:override_code_rotate":
        "Đổi mã duyệt nhập kho ngoại lệ",
      "procurement:price_list_read": "Xem giá mua hàng",
    } as Record<string, string>,
  },
} as const;

export function getStaffPermissionLabelVi(
  key: string,
  description: string,
): string {
  return (
    owner.staffPermissions.permissionLabels[key] ??
    (/[À-ỹĐđ]/u.test(description) ? description : UNKNOWN_LABEL_VI)
  );
}
