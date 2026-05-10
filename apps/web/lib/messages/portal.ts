export const portal = {
  title: "Điểm làm việc",
  description: "Chọn đúng việc cho vai trò hiện tại. Cổng nhân viên là khu tự phục vụ cá nhân.",
  role: "Vai trò",
  branch: "Chi nhánh",
  noBranch: "Chưa gắn chi nhánh",
  primary: {
    title: "Việc nên mở trước",
    description: "Lối vào chính theo vai trò và phạm vi chi nhánh.",
  },
  groups: {
    system: "Hệ thống được phép",
    selfService: "Cá nhân",
  },
  blockedMissingBranch: "Cần gắn chi nhánh trước khi mở bề mặt vận hành.",
  open: "Mở",
  cards: {
    admin: {
      title: "Tổng quan vận hành",
      description: "Điều hành tenant, báo cáo và nền tảng quản trị.",
    },
    area: {
      title: "Điều phối vận hành",
      description: "Theo dõi tồn kho, đơn hàng và nhịp nhiều chi nhánh.",
    },
    branchManager: {
      title: "Đơn hàng chi nhánh",
      description: "Theo dõi ca bán, xử lý đơn và chuyển sang POS/KDS khi cần.",
    },
    inventory: {
      title: "Kho hàng",
      description: "Nhập, chuyển, tồn kho và vận hành bếp trung tâm.",
    },
    production: {
      title: "Sản xuất",
      description: "Theo dõi kế hoạch và thao tác sản xuất trong kho.",
    },
    pos: {
      title: "POS",
      description: "Mở màn hình bán hàng cho chi nhánh đang gắn.",
    },
    kds: {
      title: "KDS",
      description: "Mở hàng bếp cho chi nhánh đang gắn.",
    },
    employee: {
      title: "Cổng nhân viên",
      description: "Chấm công, lịch ca, ngày công, phiếu lương và hồ sơ cá nhân.",
    },
    notifications: {
      title: "Thông báo",
      description: "Xem thông báo công việc và các nhắc việc đang mở.",
    },
  },
} as const
