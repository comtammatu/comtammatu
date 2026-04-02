import type { StaffRole } from "@comtammatu/shared/auth";

export const ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Chủ sở hữu",
  super_manager: "Quản lý cấp cao",
  area_manager: "Quản lý khu vực",
  branch_manager: "Quản lý chi nhánh",
  cashier: "Thu ngân",
  waiter: "Phục vụ",
  chef: "Bếp",
  office: "Văn phòng",
};
