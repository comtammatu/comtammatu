import { formatCount, formatDecimal } from "@comtammatu/shared/format";
import { LEAVE_TYPE_LABELS_VI } from "@comtammatu/shared/labels";

export const hr = {
  workspace: {
    eyebrow: "Nhân sự",
    ownerTitle: "Nhân sự",
    branchManagerTitle: "Ngày công",
    ownerDescription:
      "Tách hồ sơ nhân sự, chấm công/ngày công, checklist theo vị trí và lương cho mô hình Hộ kinh doanh.",
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
        count > 0 ? `Thêm ${formatCount(count)} nguyên liệu` : "Thêm nguyên liệu",
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
    employeeCount: (count: number) => `${formatCount(count)} nhân viên`,
    readinessSummary: (params: {
      active: number;
      payrollReady: number;
      insured: number;
      contractMissing: number;
    }) =>
      `${params.active} đang làm · ${params.payrollReady} sẵn sàng tính lương · ${params.insured} đã BHXH · ${params.contractMissing} thiếu HĐ`,
    staffAccounts: "Tài khoản & quyền",
    addEmployee: "Thêm nhân viên",
    readiness: {
      activePeople: "Đang làm",
      totalPeople: (count: number) => `Tổng ${formatCount(count)} hồ sơ`,
      payrollReady: "Sẵn sàng tính lương",
      payrollReadyHint: "Có lương tháng để vào kỳ lương",
      insured: "Có mức đóng BH",
      insuredHint: "HĐLĐ/BHXH đã có căn cứ tính",
      contractMissing: "Thiếu HĐ active",
      contractMissingHint: "Cần bổ sung trước khi chốt payroll đầy đủ",
      branches: "Chi nhánh",
      branchScope: "Phạm vi quản lý hiện tại",
      shifts: "Ca làm",
      shiftHint: "Khung ca dùng chung mọi chi nhánh",
    },
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
    supportBadge: "Hỗ trợ",
    backToHr: "Về nhân sự",
    backToPayroll: "Về bảng lương",
    server: {
      forbidden: "Không có quyền",
      periodLoadFailed: "Không thể tải kỳ lương.",
      periodExists: (month: number, year: number) =>
        `Kỳ lương ${month}/${year} đã tồn tại.`,
      createPeriodFailed: "Không thể tạo kỳ lương.",
      periodNotFound: "Kỳ lương không tồn tại.",
      standardDaysEditableOnly:
        "Chỉ có thể sửa ngày công chuẩn cho kỳ nháp hoặc đã tính.",
      calculate: {
        forbidden: "Không có quyền tính lương.",
        periodNotFound: "Kỳ lương không tồn tại.",
        locked: "Chỉ có thể tính lương cho kỳ nháp hoặc đã tính.",
        invalidEntries: "Dữ liệu bảng lương không hợp lệ.",
        fallback: "Không thể tính lương. Vui lòng thử lại.",
        missingStandardDays: "Kỳ lương không có ngày công chuẩn.",
        employeesLoadFailed: "Không thể tải danh sách nhân viên.",
        noActiveEmployees: "Không có nhân viên đang làm việc trong kỳ này.",
        noEligibleEmployees:
          "Không có nhân viên đang làm việc có lương cơ bản hoặc hợp đồng trong kỳ này.",
        contractsLoadFailed:
          "Không thể tải hợp đồng lao động. Tính lương bị hủy.",
        attendanceLoadFailed:
          "Không thể tải dữ liệu chấm công. Tính lương bị hủy.",
        leaveLoadFailed:
          "Không thể tải dữ liệu nghỉ phép. Tính lương bị hủy.",
      },
      entriesLoadFailed: "Không thể tải bảng lương.",
      approveFailed: "Không thể duyệt bảng lương.",
      markPaidFailed: "Không thể đánh dấu đã thanh toán.",
    },
    list: {
      title: "Đối soát lương",
      description:
        "Theo dõi kỳ lương đã tính khi cần đối soát hoặc chốt dữ liệu.",
      count: (count: number) => `${formatCount(count)} kỳ lương`,
      summaryOpen: "Đang xử lý",
      summaryOpenHint: "Nháp hoặc đã tính, còn chỉnh được",
      summaryApproved: "Đã duyệt",
      summaryApprovedHint: "Chờ đánh dấu thanh toán",
      summaryPaid: "Đã trả",
      createCurrentMonth: "Tạo kỳ lương tháng này",
      createTitle: "Tạo kỳ lương",
      createDescription:
        "Owner nhập ngày công chuẩn trước khi tính lương; các khoản phép năm, BHXH và TNCN được snapshot khi bấm tính.",
      periodsTitle: "Lịch sử kỳ lương",
      periodsDescription:
        "Mở từng kỳ để đối soát công, phép năm, HĐLĐ/BHXH, thuế và thực lĩnh.",
      createdToast: "Đã tạo kỳ lương",
      standardDays: "Ngày công chuẩn",
      standardDaysShort: "Chuẩn",
      period: "Kỳ",
      status: "Trạng thái",
      approvedAt: "Duyệt lúc",
      paidAt: "Trả lúc",
      empty: "Chưa có kỳ lương nào",
      details: "Chi tiết",
      periodName: (month: number, year: number) => `Tháng ${month}/${year}`,
    },
    detail: {
      invalidTitle: "ID không hợp lệ",
      invalidDescription:
        "Không thể mở chi tiết bảng lương vì mã kỳ lương không đúng.",
      title: "Đối soát kỳ lương",
      description: (periodId: string) => `Kỳ lương #${periodId}`,
      standardDays: "Ngày công chuẩn",
      controlTitle: "Chốt kỳ lương",
      controlDescription:
        "Tính lại khi ngày công, phép năm, HĐLĐ hoặc mức đóng BH thay đổi trước lúc duyệt.",
      entriesTitle: "Bảng đối soát nhân viên",
      entriesDescription:
        "Mỗi dòng là snapshot lương, phép năm, BHXH, thuế và thực lĩnh của một nhân viên.",
      tabs: {
        overview: "Tổng quan",
        entries: "Nhân viên",
        history: "Lịch sử",
      },
      actions: {
        calculate: "Tính lương",
        approve: "Duyệt",
        pay: "Thanh toán",
        saveStandardDays: "Lưu ngày chuẩn",
      },
      toast: {
        calculated: (employeeCount: number) =>
          `Đã tính lương cho ${employeeCount} nhân viên`,
        approved: "Đã duyệt bảng lương",
        paid: "Đã đánh dấu thanh toán",
        standardDaysSaved: "Đã cập nhật ngày công chuẩn",
      },
      summary: {
        gross: "Lương gộp",
        employeeInsurance: "BH NLĐ",
        paidLeaveDays: "Phép năm có lương",
        payableDays: "Ngày tính lương",
        pit: "Thuế TNCN",
        net: "Thực lĩnh",
        employerInsurance: "BH NSDLĐ",
        headcount: "Số NV tính lương",
      },
      table: {
        workingDays: "Ngày công",
        paidLeaveDays: "Phép năm",
        unpaidLeaveDays: "Nghỉ không lương",
        payableDays: "Ngày tính lương",
        gross: "Lương gộp",
        insuranceBase: "Lương đóng BH",
        employeeInsurance: "BH NLĐ",
        employerInsurance: "BH NSDLĐ",
        deductions: "Giảm trừ",
        taxableIncome: "TNTT",
        pit: "Thuế TNCN",
        net: "Thực lĩnh",
        empty: 'Chưa có dữ liệu. Nhấn "Tính lương" để bắt đầu.',
        total: (count: number) => `Tổng (${formatCount(count)} NV)`,
      },
      csv: {
        export: "Xuất CSV",
        filename: (month: number, year: number) =>
          `bang-luong-${year}-${String(month).padStart(2, "0")}.csv`,
        columns: {
          employeeCode: "Mã nhân viên",
          employeeName: "Họ tên",
          period: "Kỳ lương",
          gross: "Lương gộp",
          insuranceBase: "Lương đóng BH",
          bhxh: "BHXH (8%)",
          bhyt: "BHYT (1,5%)",
          bhtn: "BHTN (1%)",
          taxableIncome: "Thu nhập tính thuế",
          pit: "Thuế TNCN",
          net: "Thực lĩnh",
        },
      },
    },
    statusLabels: {
      draft: "Nháp",
      calculated: "Đã tính",
      approved: "Đã duyệt",
      paid: "Đã trả",
    },
  },
} as const;
