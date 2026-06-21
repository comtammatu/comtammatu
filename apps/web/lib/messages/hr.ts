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
  shell: {
    navTitle: "Nhân sự",
    navMain: "Nhân viên, ca, công",
    brandSubLabel: "Hộ kinh doanh",
    defaultPageTitle: "Tổng quan",
    pageDescription:
      "Theo dõi nhân viên, ca làm, ngày công và nghỉ phép cho vận hành hằng ngày.",
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
    setupTitle: "Thiết lập ca, checklist và vị trí",
    setupDescription:
      "Ca làm là xương sống chấm công; nhân viên dùng checklist riêng hoặc mặc định theo vị trí khi vào ca.",
    setupSteps: {
      shifts: {
        title: "Bước 1: Ca làm",
        description:
          "Tạo các khung ca để checklist và bảng công bám đúng thời điểm vào ca, trong ca, kết ca.",
        hint: "Nền vận hành",
      },
      checklist: {
        title: "Bước 2: Mẫu checklist",
        description:
          "Tạo danh sách việc theo chi nhánh hoặc global. Checklist đã snapshot theo ca cũ sẽ không đổi.",
        hint: "Danh sách công việc",
      },
      consumption: {
        title: "Bước 3: Nguyên liệu tiêu hao",
        description:
          "Chỉ cấu hình nguyên liệu mặc định cho checklist có việc Tiêu hao bếp trong ngày.",
        hint: "Optional",
      },
      positions: {
        title: "Bước 4: Mặc định theo vị trí",
        description:
          "Gán checklist mặc định cho từng vị trí để nhân viên nhận đúng danh sách việc khi chấm công vào.",
        hint: "Điều phối nhân sự",
      },
    },
    coverage: {
      title: "Tình trạng áp checklist",
      description:
        "Đối chiếu vị trí, nhân viên, checklist tiêu hao và nguyên liệu mặc định trước khi nhân viên vào ca.",
      hint: "Điều phối",
      issueCount: (count: number) => `${count} cần kiểm tra`,
      none: "Không gán",
      noEmployee: "Nhân viên",
      noPosition: "Chưa có vị trí",
      noBranch: "Chưa có chi nhánh",
      hasConsumption: "Có tiêu hao",
      noConsumption: "Không tiêu hao",
      employeeCount: (count: number) => `${count} NV`,
      positionTitle: "Theo vị trí",
      positionDescription:
        "Kiểm tra checklist mặc định của từng vị trí và nguyên liệu tiêu hao đi kèm.",
      employeeTitle: "Nhân viên cần kiểm tra",
      employeeDescription:
        "Chỉ hiện nhân viên đang thiếu checklist, thiếu nguyên liệu tiêu hao, hoặc dùng checklist riêng khác mặc định vị trí.",
      emptyPositions: "Chưa có vị trí để kiểm tra",
      emptyEmployees: "Không có nhân viên cần kiểm tra",
      status: {
        missing_checklist: "Thiếu checklist",
        missing_consumption_defaults: "Thiếu nguyên liệu",
        custom_checklist: "Checklist riêng",
        ok: "Ổn",
      },
      positionTable: {
        position: "Vị trí",
        checklist: "Checklist mặc định",
        consumption: "Tiêu hao",
        employees: "Nhân viên",
        status: "Trạng thái",
      },
      employeeTable: {
        employee: "Nhân viên",
        scope: "Chi nhánh / vị trí",
        checklist: "Checklist đang áp",
        status: "Cần kiểm tra",
      },
    },
    payrollTitle: "Đối soát lương",
    payrollDescription:
      "Mở bảng lương để đối soát ngày công, lương gộp và thực lĩnh trước khi chốt.",
    openPayroll: "Mở đối soát lương",
    employeeCount: (count: number) => `${count} nhân viên`,
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
    pendingTab: (count: number) => `Chờ duyệt (${count})`,
    historyTab: (count: number) => `Lịch sử (${count})`,
    emptyBranchTitle: "Chưa có chi nhánh",
    emptyBranchDescription:
      "Cần có chi nhánh hợp lệ trước khi duyệt nghỉ phép.",
    emptyPendingTitle: "Không có yêu cầu nghỉ chờ duyệt",
    emptyPendingDescription: "Yêu cầu nghỉ mới của nhân viên sẽ hiện ở đây.",
    emptyHistoryTitle: "Chưa có lịch sử nghỉ phép",
    emptyHistoryDescription:
      "Yêu cầu đã duyệt, từ chối, hoặc đã huỷ sẽ hiện ở đây.",
    table: {
      dateRange: "Khoảng nghỉ",
      employee: "Nhân viên",
      type: "Loại",
      reason: "Lý do",
      actions: "Hành động",
      status: "Trạng thái",
    },
    approveAria: "Duyệt nghỉ",
    rejectAria: "Từ chối nghỉ",
    rejectDialogTitle: "Từ chối yêu cầu nghỉ?",
    rejectReasonLabel: "Lý do (không bắt buộc)",
    rejectReasonPlaceholder: "Ví dụ: ngày đó thiếu người trực ca",
    rejectSubmit: "Từ chối",
  },
  payroll: {
    eyebrow: "Nhân sự",
    supportBadge: "Hỗ trợ",
    backToHr: "Về nhân sự",
    list: {
      title: "Đối soát lương",
      description:
        "Theo dõi kỳ lương đã tính khi cần đối soát hoặc chốt dữ liệu.",
      count: (count: number) => `${count} kỳ lương`,
      createCurrentMonth: "Tạo kỳ lương tháng này",
      createdToast: "Đã tạo kỳ lương",
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
      tabs: {
        overview: "Tổng quan",
        entries: "Nhân viên",
        history: "Lịch sử",
      },
      actions: {
        calculate: "Tính lương",
        approve: "Duyệt",
        pay: "Thanh toán",
      },
      toast: {
        calculated: (employeeCount: number) =>
          `Đã tính lương cho ${employeeCount} nhân viên`,
        approved: "Đã duyệt bảng lương",
        paid: "Đã đánh dấu thanh toán",
      },
      summary: {
        gross: "Lương gộp",
        employeeInsurance: "BH NLĐ",
        pit: "Thuế TNCN",
        net: "Thực lĩnh",
        employerInsurance: "BH NSDLĐ",
        headcount: "Số NV tính lương",
      },
      table: {
        workingDays: "Ngày công",
        gross: "Lương gộp",
        employeeInsurance: "BH NLĐ",
        deductions: "Giảm trừ",
        taxableIncome: "TNTT",
        pit: "Thuế TNCN",
        net: "Thực lĩnh",
        empty: 'Chưa có dữ liệu. Nhấn "Tính lương" để bắt đầu.',
        total: (count: number) => `Tổng (${count} NV)`,
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
