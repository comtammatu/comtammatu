import { formatCount, formatDecimal } from "@comtammatu/shared/format";
import { LEAVE_TYPE_LABELS_VI } from "@comtammatu/shared/labels";

export const hr = {
  workspace: {
    eyebrow: "Nhân sự",
    ownerTitle: "Hồ sơ nhân sự",
    branchManagerTitle: "Ngày công",
    ownerDescription:
      "Quản lý hồ sơ nhân viên, HĐLĐ và lương; phân quyền truy cập được tách riêng.",
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
    attendanceDescription: "Theo dõi vào/ra ca, checklist bắt buộc và ca treo.",
    setupTitle: "Thiết lập ca làm và việc trong ca",
    setupDescription: "Khung ca và việc trong ca theo từng vị trí.",
    setupSteps: {
      leavePolicy: {
        title: "Ngày công & phép",
        description:
          "Thiết lập ngày công chuẩn và phép tháng dùng chung cho toàn bộ nhân viên.",
        hint: "Chính sách lương",
      },
      shifts: {
        title: "Bước 1: Ca làm",
        description:
          "Tạo khung ca để checklist và bảng công bám đúng thời điểm.",
        hint: "Nền vận hành",
      },
    },
    leavePolicy: {
      standardWorkdaysLabel: "Ngày công chuẩn",
      standardWorkdaysDescription:
        "Số ngày dùng làm mẫu số khi tính lương tháng.",
      monthlyLeaveDaysLabel: "Phép tháng",
      monthlyLeaveDaysDescription:
        "Mỗi tháng, số ngày nghỉ có lương được phân bổ trước từ quota này.",
      allocationHint: "Ví dụ: nghỉ 3 ngày = 2 phép tháng + 1 phép năm.",
      save: "Lưu chính sách",
      saved: "Đã lưu ngày công và phép tháng.",
      saveFailed: "Không thể lưu ngày công và phép tháng.",
      loadFailed: "Không thể tải ngày công và phép tháng.",
      invalid: "Kiểm tra lại ngày công và phép tháng.",
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
    allBranches: "Tất cả chi nhánh",
    unassignedBranch: "Không thuộc chi nhánh",
    allPositions: "Tất cả chức vụ",
    unassignedPosition: "Chưa gán chức vụ",
    salary: "Lương",
    allSalaries: "Tất cả mức lương",
    salaryRecorded: "Có lương",
    salaryMissing: "Chưa có lương",
    contractType: "Loại HĐ",
    allContractTypes: "Tất cả loại HĐ",
    showInactiveEmployees: "Hiện nhân viên tạm ngưng",
    hideInactiveEmployees: "Ẩn nhân viên tạm ngưng",
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
    loadFailed: "Không thể tải danh sách nghỉ phép",
    quotaLoadFailed: "Không thể tải hạn mức nghỉ phép.",
    table: {
      dateRange: "Khoảng nghỉ",
      employee: "Nhân viên",
      type: "Loại",
      monthlyQuota: "Phép tháng",
      annualQuota: "Phép năm",
      reason: "Lý do",
      actions: "Hành động",
      status: "Trạng thái",
    },
    annualBalance: (remaining: number, entitlement: number, year: number) =>
      `Còn ${formatDecimal(remaining, 1)}/${formatDecimal(entitlement, 1)} ngày (${year})`,
    monthlyBalance: (remaining: number, entitlement: number) =>
      `Còn ${formatDecimal(remaining, 1)}/${formatDecimal(entitlement, 1)} ngày`,
    approveAria: "Duyệt nghỉ",
    rejectAria: "Từ chối nghỉ",
    rejectDialogTitle: "Từ chối yêu cầu nghỉ?",
    rejectReasonLabel: "Lý do (không bắt buộc)",
    rejectReasonPlaceholder: "Ví dụ: ngày đó thiếu người trực ca",
    rejectSubmit: "Từ chối",
    approvalsTitle: "Duyệt nghỉ phép",
    approvalsDescription:
      "Duyệt hoặc từ chối yêu cầu nghỉ phép của nhân viên chi nhánh.",
    approvedMonthTitle: "Nghỉ phép đã duyệt trong tháng",
    approvedMonthTab: "Đã duyệt trong tháng",
    approvedMonthMonthLabel: "Tháng nghỉ phép đã duyệt",
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
      leavePolicyLoadFailed:
        "Không thể tải ngày công và quota nghỉ phép để tính lương.",
      leaveEntitlementsLoadFailed:
        "Không thể tải hạn mức phép năm của nhân viên.",
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
        "Bảng lương tháng này đã chốt, không thể sửa dữ liệu dùng để tính lương.",
      snapshotMissingSalary:
        "Còn nhân viên chưa có mức lương trong hồ sơ hoặc HĐLĐ; bổ sung trước khi chốt.",
      snapshotPreflightBlocked:
        "Còn dữ liệu cần xử lý trước khi chốt bảng lương.",
      snapshotUnavailable: "Chưa đủ dữ liệu để chốt bảng lương.",
      snapshotPaymentOwnedByFinance:
        "Bảng lương tháng này đã chốt. Thanh toán và chứng từ được xử lý tại phân hệ Tài chính.",
      adjustmentSaveFailed: "Không thể lưu điều chỉnh lương.",
      adjustmentDeleteFailed: "Không thể xóa điều chỉnh lương.",
      snapshotFailed: "Không thể chốt bảng lương.",
    },
    live: {
      title: "Lương",
      description:
        "Tạm tính theo ngày công, nghỉ phép, mức lương và điều chỉnh trong tháng.",
      loadFailedTitle: "Không thể tải bảng lương",
      loadFailedDescription:
        "Không tải được dữ liệu để tính lương. Hãy tải lại hoặc kiểm tra quyền truy cập.",
      retry: "Tải lại bảng lương",
      periodName: (month: number, year: number) => `Tháng ${month}/${year}`,
      month: "Tháng lương",
      branch: "Chi nhánh",
      allBranches: "Tất cả chi nhánh",
      standardDays: "Ngày công chuẩn",
      search: "Tìm nhân viên",
      calendar: "Lịch",
      calendarAllTitle: "Lịch công toàn bộ",
      calendarEmployeeTitle: (employeeName: string) =>
        `Lịch công · ${employeeName}`,
      calendarDescription:
        "Ngày công, giờ công và nghỉ phép trong kỳ lương đang chọn.",
      calendarOpenRow: (employeeName: string) =>
        `Mở lịch công của ${employeeName}`,
      workdays: "Số ngày công",
      estimatedSalary: "Lương ước tính",
      monthlyLeave: "Phép tháng",
      annualLeave: "Phép năm",
      compactPosition: (positionLabel: string | null) =>
        positionLabel === "Thu ngân (kiêm phục vụ)"
          ? "Thu ngân"
          : positionLabel,
      salaryStatus: "Tình trạng tính lương",
      salaryStatusAll: "Tất cả",
      salaryStatusCalculable: "Đủ thông tin tính lương",
      salaryStatusMissing: "Chưa có mức lương",
      snapshot: "Chốt bảng lương",
      snapshotting: "Đang chốt",
      snapshotConfirmDescription:
        "Bảng lương tháng này sẽ bị khóa. Thanh toán xử lý tại Tài chính.",
      cancel: "Hủy",
      snapshotDescription:
        "Sau khi chốt, bảng lương bị khóa. Thanh toán xử lý tại Tài chính.",
      snapshotAllBranchesRequired:
        "Chỉ chốt được khi đang xem tất cả chi nhánh.",
      snapshotLocked: "Đã chốt",
      snapshotOpen: "Chưa chốt",
      preflight: {
        title: "Kiểm tra trước chốt lương",
        blockedBadge: "Cần xử lý",
        readyBadge: "Sẵn sàng chốt",
        blockedDescription: "Xử lý hết các điểm dưới đây trước khi chốt.",
        readyDescription:
          "Không có dữ liệu đang chặn việc chốt bảng lương cho kỳ đã chọn.",
        allBranches: "toàn hệ thống",
        missingSalaryTitle: "Thiếu mức lương",
        missingSalaryDescription: (count: number, branchName: string) =>
          `${formatCount(count)} nhân viên tại ${branchName} chưa có mức lương hợp lệ để tính.`,
        missingSalaryAction: "Xem trong bảng",
        staleAttendanceTitle: "Ca chưa kết",
        staleAttendanceDescription: (count: number, branchName: string) =>
          `${formatCount(count)} ca tại ${branchName} đã quá giờ nhưng chưa có giờ ra.`,
        pendingLeaveTitle: "Nghỉ phép chờ duyệt",
        pendingLeaveDescription: (count: number, branchName: string) =>
          `${formatCount(count)} yêu cầu nghỉ tại ${branchName} còn chờ duyệt trong kỳ lương.`,
        attendanceAction: "Mở Lịch công",
        leaveAction: "Mở duyệt phép",
      },
      missingSalaryTitle: "Còn nhân viên chưa có mức lương",
      missingSalaryDescription: (count: number) =>
        `${formatCount(count)} nhân viên chưa có mức lương trong hồ sơ hoặc HĐLĐ; bổ sung trước khi chốt.`,
      missingSalaryAction: "Mở hồ sơ nhân sự",
      missingSalaryListAction: "Xem trong bảng",
      adjustment: "Điều chỉnh",
      adjustmentTitle: (employeeName: string) =>
        `Điều chỉnh lương · ${employeeName}`,
      adjustmentDescription:
        "Tính ngay vào bảng lương tháng đang chọn; khóa sau khi chốt.",
      adjustmentSave: "Lưu điều chỉnh",
      adjustmentSaved: "Đã lưu điều chỉnh lương",
      adjustmentDeleted: "Đã xoá điều chỉnh lương",
      adjustmentDeleteTitle: "Xóa khoản điều chỉnh?",
      adjustmentDeleteDescription:
        "Khoản này sẽ không còn được tính trong bảng lương tạm tính.",
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
        note: "Lý do điều chỉnh",
        notePlaceholder: "Ví dụ: thưởng hiệu suất tháng",
        noteRequired: "Lý do điều chỉnh phải có ít nhất 5 ký tự",
      },
      adjustmentTargetMissing: "Không tìm thấy nhân viên cần điều chỉnh.",
      table: {
        index: "#",
        employee: "Họ tên",
        workingDays: "Công",
        workHours: "Giờ công",
        leaveDays: "Nghỉ phép",
        bonus: "Thưởng",
        bhxh: "BHXH",
        net: "Lương dự kiến",
        finalizedNet: "Thực lĩnh đã chốt",
        calculable: "Đủ thông tin tính lương",
        missingSalary: "Chưa có mức lương",
        finalized: "Đã chốt",
        edit: "Chỉnh sửa",
        total: (count: number) => `Tổng ${formatCount(count)} nhân viên`,
        empty: "Không có nhân viên phù hợp bộ lọc.",
      },
      mobile: {
        work: (working: number, workHours: number, leaveDays: number) =>
          `Công ${formatDecimal(working, 1)} · ${formatDecimal(workHours, 1)} giờ · nghỉ phép ${formatDecimal(leaveDays, 1)}`,
      },
    },
  },
} as const;
