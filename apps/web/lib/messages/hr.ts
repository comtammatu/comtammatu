export const hr = {
  workspace: {
    eyebrow: "Nhân sự",
    ownerTitle: "Nhân sự",
    branchManagerTitle: "Ca và chấm công",
    ownerDescription:
      "Nhân viên, ca làm, ngày công và nghỉ phép cho mô hình Hộ kinh doanh.",
    branchManagerDescription:
      "Nhân viên, ca làm, ngày công và nghỉ phép của chi nhánh được gán.",
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
      shifts: "Ca",
      checklist: "Checklist",
      attendance: "Chấm công",
      leave: "Nghỉ phép",
    },
    employeeCount: (count: number) => `${count} nhân viên`,
    addEmployee: "Thêm nhân viên",
  },
  leave: {
    status: {
      pending: "Chờ duyệt",
      approved: "Đã duyệt",
      rejected: "Từ chối",
      cancelled: "Đã huỷ",
    },
    types: {
      annual: "Nghỉ phép",
      sick: "Nghỉ bệnh",
      unpaid: "Nghỉ không lương",
      personal: "Việc cá nhân",
      other: "Khác",
    },
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
