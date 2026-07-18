import { formatCount, formatDecimal } from "@comtammatu/shared/format";
import { LEAVE_TYPE_LABELS_VI } from "@comtammatu/shared/labels";

export const hr = {
  workspace: {
    eyebrow: "Nhân sự",
    ownerTitle: "Hồ sơ nhân sự",
    branchManagerTitle: "Ngày công",
    ownerDescription:
      "Quản lý hồ sơ nhân viên, HĐLĐ và nguồn tính lương; phân quyền truy cập được tách riêng.",
    branchManagerDescription:
      "Theo dõi ca, ngày công, kết ca và nghỉ phép của chi nhánh được gán.",
  },
  actions: {
    fetchEmployeesFailed: "Không thể tải danh sách nhân viên.",
    fetchShiftsFailed: "Không thể tải danh sách ca.",
    fetchAttendanceFailed: "Không thể tải bảng chấm công.",
    fetchAttendanceSummaryFailed: "Không thể tải tổng hợp chấm công.",
  },
  client: {
    tabs: {
      employees: "Người",
      attendance: "Ngày công",
      payroll: "Lương",
      setup: "Thiết lập",
    },
    attendanceTitle: "Chấm công và ngày công theo ca",
    attendanceDescription:
      "Theo dõi vào/ra ca, checklist bắt buộc, mục tiêu hao bếp khi được giao, ca treo và nghỉ phép trong cùng một nơi.",
    setupTitle: "Thiết lập ca làm và việc trong ca",
    setupDescription:
      "Ca làm là xương sống chấm công; mỗi vị trí có việc trong ca riêng để nhân viên nhận đúng danh sách khi vào ca.",
    setupSteps: {
      shifts: {
        title: "Bước 1: Ca làm",
        description:
          "Tạo các khung ca để checklist và bảng công bám đúng thời điểm vào ca, trong ca, kết ca.",
        hint: "Nền vận hành",
      },
    },
    shiftBoundaries: {
      opening: "Ca mở",
      closing: "Ca đóng",
      openingAria: "Đánh dấu ca mở",
      closingAria: "Đánh dấu ca đóng",
      saved: "Đã cập nhật ca mở/đóng",
      saveFailed: "Không thể cập nhật ca mở/đóng",
    },
    shiftsLoadFailed: "Không thể tải ca làm việc",
    shiftsLoading: "Đang tải...",
    shiftsSummary: (count: number) =>
      `${formatCount(count)} ca làm việc · dùng chung mọi chi nhánh`,
    shiftsEmptyTitle: "Chưa có ca làm việc nào",
    positionTasks: {
      title: "Việc trong ca",
      description: "Gán checklist nhân viên nhận khi chấm công vào.",
      hint: "Checklist",
      positionLabel: "Chọn vị trí",
      positionPlaceholder: "Chọn vị trí",
      emptyPosition: "Chọn vị trí để cấu hình việc trong ca.",
      taskListLabel: "Việc cần làm",
      addTask: "Thêm việc",
      removeTask: "Xóa việc",
      titleLabel: "Việc",
      titlePlaceholder: "Tên việc cần làm",
      kindLabel: "Loại việc",
      applicabilityLabel: "Áp dụng",
      phaseLabel: "Thời điểm",
      requiredLabel: "Bắt buộc",
      doneDefinitionLabel: "Tiêu chí xong",
      doneDefinitionPlaceholder:
        "Dấu hiệu để quản lý và nhân viên biết việc đã xong",
      ingredientsLabel: "Nguyên liệu tiêu hao mặc định",
      ingredientsHint:
        "Nhân viên vẫn có thể thêm dòng ngoài danh sách khi báo cáo ca.",
      addIngredients: "Chọn nguyên liệu",
      addIngredientsConfirm: (count: number) =>
        count > 0
          ? `Thêm ${formatCount(count)} nguyên liệu`
          : "Thêm nguyên liệu",
      ingredientSearch: "Tìm nguyên liệu...",
      removeIngredient: "Bỏ nguyên liệu",
      empty: "Chưa có việc nào cho vị trí này.",
      save: "Lưu việc trong ca",
      saved: "Đã lưu việc trong ca",
      saveFailed: "Không thể lưu việc trong ca",
      ingredientsSaveFailed: "Không thể lưu nguyên liệu tiêu hao",
      needTitle: "Nhập tên cho mọi việc trước khi lưu.",
      loadFailed: "Không thể tải việc trong ca",
      kindLabels: {
        standard: "Việc thường",
        consumption_report: "Tiêu hao bếp trong ngày",
      },
      applicabilityLabels: {
        every_shift: "Mỗi ca",
        opening: "Ca mở",
        closing: "Ca đóng",
      },
      phaseLabels: {
        start_of_shift: "Đầu ca",
        end_of_shift: "Cuối ca",
      },
      errors: {
        position_not_found: "Không tìm thấy vị trí.",
        too_many_tasks: "Vượt quá số việc cho phép (tối đa 40).",
        task_title_too_long: "Tên việc quá dài.",
        task_kind_invalid: "Loại việc không hợp lệ.",
        task_applicability_invalid: "Phạm vi áp dụng không hợp lệ.",
        task_phase_invalid: "Thời điểm không hợp lệ.",
        done_definition_too_long: "Tiêu chí xong quá dài.",
      },
    },
    payrollTitle: "Đối soát lương",
    payrollDescription:
      "Mở bảng lương để đối soát ngày công, lương gộp và thực lĩnh trước khi chốt.",
    openPayroll: "Mở đối soát lương",
    employeeSearch: "Tìm tên, mã, chi nhánh hoặc chức danh",
    employeeEmpty: "Chưa có hồ sơ nhân viên phù hợp.",
    employmentStatus: "Tình trạng làm việc",
    salarySource: {
      header: "Nguồn lương",
      contract: "HĐLĐ hiệu lực",
      employee: "Hồ sơ nhân sự",
      missing: "Thiếu nguồn lương",
    },
    staffAccounts: "Tài khoản & quyền",
    addEmployee: "Thêm nhân viên",
  },
  leave: {
    status: {
      pending: "Chờ duyệt",
      approved: "Đã duyệt",
      rejected: "Từ chối",
      cancelled: "Đã huỷ",
    },
    types: LEAVE_TYPE_LABELS_VI,
    dayUnit: "ngày",
    fallbackEmployee: "Nhân viên",
    summary: (pending: number, total: number) =>
      `${pending} chờ duyệt · tổng ${total}`,
    pendingTab: (count: number) => `Chờ duyệt (${formatCount(count)})`,
    historyTab: (count: number) => `Lịch sử (${formatCount(count)})`,
    emptyBranchTitle: "Chưa có chi nhánh",
    emptyBranchDescription:
      "Cần có chi nhánh hợp lệ trước khi duyệt nghỉ phép.",
    emptyPendingTitle: "Không có yêu cầu nghỉ chờ duyệt",
    emptyPendingDescription: "Yêu cầu nghỉ mới của nhân viên sẽ hiện ở đây.",
    emptyHistoryTitle: "Chưa có lịch sử nghỉ phép",
    emptyHistoryDescription:
      "Yêu cầu đã duyệt, từ chối, hoặc đã huỷ sẽ hiện ở đây.",
    monthLoadFailed: "Không thể tải nghỉ phép trong tháng.",
    loadFailed: "Không thể tải danh sách nghỉ phép",
    quotaLoadFailed: "Không thể tải hạn mức phép năm.",
    table: {
      dateRange: "Khoảng nghỉ",
      employee: "Nhân viên",
      type: "Loại",
      quota: "Phép năm",
      reason: "Lý do",
      actions: "Hành động",
      status: "Trạng thái",
    },
    annualBalance: (remaining: number, entitlement: number, year: number) =>
      `Còn ${formatDecimal(remaining, 1)}/${formatDecimal(entitlement, 1)} ngày (${year})`,
    approveAria: "Duyệt nghỉ",
    rejectAria: "Từ chối nghỉ",
    rejectDialogTitle: "Từ chối yêu cầu nghỉ?",
    rejectReasonLabel: "Lý do (không bắt buộc)",
    rejectReasonPlaceholder: "Ví dụ: ngày đó thiếu người trực ca",
    rejectSubmit: "Từ chối",
    approvalsTitle: "Duyệt nghỉ phép",
    approvalsDescription:
      "Duyệt hoặc từ chối yêu cầu nghỉ phép của nhân viên chi nhánh.",
    approvalsHomeLabel: "Nay",
    approvalsNoAccessTitle: "Không có quyền duyệt nghỉ phép",
    approvalsNoAccessDescription:
      "Chỉ tài khoản quản lý có quyền nhân sự mới duyệt yêu cầu nghỉ phép.",
  },
  payroll: {
    eyebrow: "Nhân sự",
    backToHr: "Về nhân sự",
    server: {
      forbidden: "Không có quyền",
      periodLoadFailed: "Không thể tải kỳ lương.",
      periodNotFound: "Kỳ lương không tồn tại.",
      calculate: {
        employeesLoadFailed: "Không thể tải danh sách nhân viên.",
        contractsLoadFailed:
          "Không thể tải hợp đồng lao động. Tính lương bị hủy.",
        attendanceLoadFailed:
          "Không thể tải dữ liệu chấm công. Tính lương bị hủy.",
        leaveLoadFailed: "Không thể tải dữ liệu nghỉ phép. Tính lương bị hủy.",
      },
      entriesLoadFailed: "Không thể tải bảng lương.",
      branchesLoadFailed: "Không thể tải danh sách chi nhánh.",
      adjustmentsLoadFailed: "Không thể tải các khoản điều chỉnh lương.",
      adjustmentNotFound: "Không tìm thấy dữ liệu lương cần thao tác.",
      snapshotLocked:
        "Bảng lương tháng này đã chốt, không thể sửa dữ liệu nguồn.",
      snapshotMissingSalary:
        "Còn nhân viên thiếu nguồn lương; bổ sung hồ sơ hoặc HĐLĐ trước khi chốt.",
      snapshotUnavailable: "Chưa có dữ liệu lương hợp lệ để chốt.",
      snapshotPaymentOwnedByFinance:
        "Bảng lương tháng này đã chốt. Thanh toán và chứng từ thuộc Finance.",
      adjustmentSaveFailed: "Không thể lưu điều chỉnh lương.",
      adjustmentDeleteFailed: "Không thể xóa điều chỉnh lương.",
      snapshotFailed: "Không thể chốt bảng lương.",
    },
    live: {
      title: "Lương",
      description:
        "Tính lương dự kiến theo ngày công, phép, điều chỉnh và dữ liệu hiện tại; chỉ snapshot khi chốt.",
      loadFailedTitle: "Không thể tải bảng lương",
      loadFailedDescription:
        "Dữ liệu lương chưa sẵn sàng. Hãy tải lại hoặc kiểm tra quyền truy cập.",
      retry: "Tải lại bảng lương",
      periodName: (month: number, year: number) => `Tháng ${month}/${year}`,
      month: "Tháng lương",
      branch: "Chi nhánh",
      allBranches: "Tất cả chi nhánh",
      standardDays: "Ngày công chuẩn",
      search: "Tìm nhân viên",
      salaryStatus: "Trạng thái dữ liệu",
      salaryStatusAll: "Tất cả",
      salaryStatusCalculable: "Tính được",
      salaryStatusMissing: "Thiếu nguồn lương",
      snapshot: "Chốt bảng lương",
      snapshotting: "Đang chốt",
      snapshotConfirmDescription:
        "Bảng lương sẽ được snapshot và khóa. Finance sẽ xử lý thanh toán, không thao tác tại đây.",
      cancel: "Hủy",
      snapshotDescription:
        "Sau khi chốt, bảng lương được khóa. Finance ghi nhận thanh toán và chứng từ riêng.",
      snapshotAllBranchesRequired:
        "Chỉ có thể chốt khi đang xem tất cả chi nhánh để snapshot đủ bảng lương của tenant.",
      snapshotLocked: "Đã chốt",
      snapshotOpen: "Đang tính live",
      missingSalaryTitle: "Còn nhân viên thiếu nguồn lương",
      missingSalaryDescription: (count: number) =>
        `${formatCount(count)} nhân viên chưa có lương ở hồ sơ hoặc HĐLĐ; bổ sung trước khi chốt.`,
      missingSalaryAction: "Mở hồ sơ nhân sự",
      missingSalaryListAction: "Xem trong bảng",
      adjustment: "Điều chỉnh",
      adjustmentTitle: (employeeName: string) =>
        `Điều chỉnh lương · ${employeeName}`,
      adjustmentDescription:
        "Khoản điều chỉnh được tính ngay vào bảng lương tháng đang chọn và không sửa được sau khi chốt.",
      adjustmentSave: "Lưu điều chỉnh",
      adjustmentSaved: "Đã lưu điều chỉnh lương",
      adjustmentDeleted: "Đã xoá điều chỉnh lương",
      adjustmentDeleteTitle: "Xóa khoản điều chỉnh?",
      adjustmentDeleteDescription:
        "Khoản này sẽ không còn được tính trong lương live.",
      adjustmentDelete: "Xóa khoản",
      adjustmentKinds: {
        bonus: "Thưởng bổ sung",
        taxable_allowance: "Phụ cấp chịu thuế",
        tax_exempt_allowance: "Phụ cấp miễn thuế",
        advance: "Tạm ứng",
        deduction: "Khấu trừ khác",
      },
      adjustmentFields: {
        kind: "Loại điều chỉnh",
        amount: "Số tiền",
        amountRequired: "Nhập số tiền",
        amountPositive: "Số tiền phải lớn hơn 0",
        note: "Ghi chú",
        notePlaceholder: "Ví dụ: thưởng hiệu suất tháng",
      },
      adjustmentTargetMissing: "Không tìm thấy nhân viên cần điều chỉnh.",
      table: {
        employee: "Nhân viên",
        workingDays: "Công",
        paidLeaveDays: "Phép",
        unpaidLeaveDays: "Không lương",
        adjustments: "Điều chỉnh",
        gross: "Lương gộp",
        deductions: "BHXH + TNCN",
        net: "Lương dự kiến",
        finalizedNet: "Thực lĩnh đã chốt",
        status: "Trạng thái",
        calculable: "Tính được",
        missingSalary: "Thiếu nguồn lương",
        finalized: "Đã chốt",
        actions: "Thao tác",
        total: (count: number) => `Tổng ${formatCount(count)} nhân viên`,
        empty: "Không có nhân viên phù hợp bộ lọc.",
      },
      mobile: {
        work: (working: number, paidLeave: number, unpaidLeave: number) =>
          `Công ${formatDecimal(working, 1)} · phép ${formatDecimal(paidLeave, 1)} · không lương ${formatDecimal(unpaidLeave, 1)}`,
        deductions: "Khấu trừ",
      },
    },
  },
} as const;
