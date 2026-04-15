export interface BetaRouteItem {
  pattern: string;
  title: string;
  description: string;
  legacyHref: string;
  icon: string;
  section: string;
  availability: "live-data" | "transition";
}

export interface BetaRouteGroup {
  title: string;
  items: BetaRouteItem[];
}

export interface BetaNavItem {
  href: string;
  label: string;
  icon: string;
}

export interface BetaNavGroup {
  title: string;
  items: BetaNavItem[];
}

const ADMIN_ROUTE_GROUPS: BetaRouteGroup[] = [
  {
    title: "Điều hành",
    items: [
      {
        pattern: "",
        title: "Bảng điều hành",
        description: "Toàn cảnh điều phối và năng lượng vận hành theo vai trò quản trị.",
        legacyHref: "/admin/dashboard",
        icon: "LayoutDashboard",
        section: "Điều hành",
        availability: "live-data",
      },
      {
        pattern: "dashboard",
        title: "Bảng điều hành",
        description: "Theo dõi doanh thu, đơn hàng gần đây và các nhịp điều hành chính.",
        legacyHref: "/admin/dashboard",
        icon: "LayoutDashboard",
        section: "Điều hành",
        availability: "live-data",
      },
      {
        pattern: "reports",
        title: "Báo cáo",
        description: "Điểm vào của các lát cắt báo cáo điều hành dành cho cấp quản lý.",
        legacyHref: "/admin/reports",
        icon: "BarChart3",
        section: "Điều hành",
        availability: "live-data",
      },
      {
        pattern: "reports/revenue",
        title: "Báo cáo doanh thu",
        description: "Theo dõi biến động doanh thu theo ngày và nhịp vận hành gần nhất.",
        legacyHref: "/admin/reports/revenue",
        icon: "TrendingUp",
        section: "Điều hành",
        availability: "live-data",
      },
      {
        pattern: "reports/inventory-value",
        title: "Giá trị tồn kho",
        description: "Kết nối nhanh giữa lớp điều hành và dữ liệu giá trị tồn kho.",
        legacyHref: "/admin/reports/inventory-value",
        icon: "PackageSearch",
        section: "Điều hành",
        availability: "live-data",
      },
      {
        pattern: "reports/stock-movement",
        title: "Biến động kho",
        description: "Nhìn lại luồng nhập, xuất và điều chuyển từ góc nhìn điều hành.",
        legacyHref: "/admin/reports/stock-movement",
        icon: "ArrowLeftRight",
        section: "Điều hành",
        availability: "live-data",
      },
    ],
  },
  {
    title: "Nền tảng",
    items: [
      {
        pattern: "staff",
        title: "Nhân sự nền",
        description: "Quản lý nhân sự nền và phân quyền vận hành theo cấu trúc tổ chức hiện tại.",
        legacyHref: "/admin/staff",
        icon: "Users",
        section: "Nền tảng",
        availability: "transition",
      },
      {
        pattern: "menu",
        title: "Thực đơn",
        description: "Điểm vào để vận hành cấu trúc món, nhóm món và thiết lập menu.",
        legacyHref: "/admin/menu",
        icon: "UtensilsCrossed",
        section: "Nền tảng",
        availability: "transition",
      },
      {
        pattern: "orders",
        title: "Đơn hàng",
        description: "Xem lại đơn hàng ở bề mặt điều hành cũ trong khi beta tiếp tục được mở rộng.",
        legacyHref: "/admin/orders",
        icon: "Receipt",
        section: "Nền tảng",
        availability: "transition",
      },
      {
        pattern: "settings",
        title: "Cài đặt",
        description: "Trung tâm thiết lập hệ thống và nền tảng vận hành.",
        legacyHref: "/admin/settings",
        icon: "Settings",
        section: "Nền tảng",
        availability: "transition",
      },
      {
        pattern: "settings/branches",
        title: "Chi nhánh",
        description: "Quản lý chi nhánh, trạng thái và quy ước vận hành nền.",
        legacyHref: "/admin/settings/branches",
        icon: "Building2",
        section: "Nền tảng",
        availability: "transition",
      },
      {
        pattern: "settings/general",
        title: "Cài đặt chung",
        description: "Các thiết lập mức hệ thống dành cho vai trò quản trị cấp cao.",
        legacyHref: "/admin/settings/general",
        icon: "SlidersHorizontal",
        section: "Nền tảng",
        availability: "transition",
      },
      {
        pattern: "settings/areas",
        title: "Khu vực",
        description: "Điều phối phân vùng hoạt động và phạm vi quản lý theo khu vực.",
        legacyHref: "/admin/settings/areas",
        icon: "Map",
        section: "Nền tảng",
        availability: "transition",
      },
      {
        pattern: "settings/tables",
        title: "Bàn & Khu vực",
        description: "Thiết lập không gian phục vụ, bàn, khu và logic sử dụng mặt bằng.",
        legacyHref: "/admin/settings/tables",
        icon: "LayoutGrid",
        section: "Nền tảng",
        availability: "transition",
      },
      {
        pattern: "settings/pos",
        title: "POS",
        description: "Cấu hình thiết bị và tham số vận hành cho điểm bán.",
        legacyHref: "/admin/settings/pos",
        icon: "Monitor",
        section: "Nền tảng",
        availability: "transition",
      },
      {
        pattern: "settings/kds",
        title: "KDS",
        description: "Thiết lập line bếp và trạm chế biến cho màn hình bếp.",
        legacyHref: "/admin/settings/kds",
        icon: "ChefHat",
        section: "Nền tảng",
        availability: "transition",
      },
      {
        pattern: "settings/payments",
        title: "Thanh toán",
        description: "Cấu hình phương thức thanh toán đang chạy trong hệ thống.",
        legacyHref: "/admin/settings/payments",
        icon: "Wallet",
        section: "Nền tảng",
        availability: "transition",
      },
    ],
  },
  {
    title: "Tài chính & Nhân sự",
    items: [
      {
        pattern: "finance",
        title: "Tài chính",
        description: "Hub tài chính, sổ sách và các báo cáo chuẩn hoá cho cấp điều hành.",
        legacyHref: "/admin/finance",
        icon: "Wallet",
        section: "Tài chính & Nhân sự",
        availability: "transition",
      },
      {
        pattern: "finance/chart-of-accounts",
        title: "Hệ thống tài khoản",
        description: "Cây tài khoản chuẩn cho hệ thống kế toán nội bộ.",
        legacyHref: "/admin/finance/chart-of-accounts",
        icon: "BookCopy",
        section: "Tài chính & Nhân sự",
        availability: "transition",
      },
      {
        pattern: "finance/journal",
        title: "Sổ nhật ký",
        description: "Theo dõi bút toán và diễn biến ghi nhận nghiệp vụ.",
        legacyHref: "/admin/finance/journal",
        icon: "NotebookText",
        section: "Tài chính & Nhân sự",
        availability: "transition",
      },
      {
        pattern: "finance/food-cost",
        title: "Food cost",
        description: "Phân tích hiệu quả chi phí nguyên liệu theo bối cảnh vận hành.",
        legacyHref: "/admin/finance/food-cost",
        icon: "CookingPot",
        section: "Tài chính & Nhân sự",
        availability: "transition",
      },
      {
        pattern: "finance/statements",
        title: "Báo cáo tài chính",
        description: "Lối vào các biểu mẫu báo cáo tài chính đang có trong hệ thống.",
        legacyHref: "/admin/finance/statements",
        icon: "FileSpreadsheet",
        section: "Tài chính & Nhân sự",
        availability: "transition",
      },
      {
        pattern: "finance/periods",
        title: "Kỳ kế toán",
        description: "Quản lý kỳ, khoá kỳ và các mốc tài chính theo vận hành hiện tại.",
        legacyHref: "/admin/finance/periods",
        icon: "CalendarRange",
        section: "Tài chính & Nhân sự",
        availability: "transition",
      },
      {
        pattern: "finance/posting-rules",
        title: "Quy tắc hạch toán",
        description: "Theo dõi mapping nghiệp vụ và quy tắc ghi sổ tài chính.",
        legacyHref: "/admin/finance/posting-rules",
        icon: "Waypoints",
        section: "Tài chính & Nhân sự",
        availability: "transition",
      },
      {
        pattern: "hr",
        title: "Nhân sự",
        description: "Hub nhân sự quản lý và điều phối cho cấp quản trị.",
        legacyHref: "/admin/hr",
        icon: "BriefcaseBusiness",
        section: "Tài chính & Nhân sự",
        availability: "transition",
      },
      {
        pattern: "hr/payroll",
        title: "Bảng lương",
        description: "Điểm vào xử lý kỳ lương trong workspace nhân sự hiện tại.",
        legacyHref: "/admin/hr/payroll",
        icon: "BadgeDollarSign",
        section: "Tài chính & Nhân sự",
        availability: "transition",
      },
      {
        pattern: "hr/payroll/:periodId",
        title: "Chi tiết kỳ lương",
        description: "Theo dõi chi tiết một kỳ lương cụ thể trong bề mặt beta.",
        legacyHref: "/admin/hr/payroll",
        icon: "BadgeDollarSign",
        section: "Tài chính & Nhân sự",
        availability: "transition",
      },
      {
        pattern: "crm",
        title: "CRM",
        description: "Nơi giữ chỗ cho bề mặt CRM khi beta mở rộng thêm domain kế tiếp.",
        legacyHref: "/admin/crm",
        icon: "HeartHandshake",
        section: "Tài chính & Nhân sự",
        availability: "transition",
      },
    ],
  },
];

const INVENTORY_ROUTE_GROUPS: BetaRouteGroup[] = [
  {
    title: "Điều phối",
    items: [
      {
        pattern: "",
        title: "Tổng quan kho",
        description: "Nhịp điều hành nhập, xuất, tồn và cảnh báo vận hành ở bề mặt beta.",
        legacyHref: "/inventory",
        icon: "LayoutDashboard",
        section: "Điều phối",
        availability: "live-data",
      },
      {
        pattern: "stock",
        title: "Tồn kho",
        description: "Kiểm tra mức tồn và trạng thái kho hiện tại theo bối cảnh site.",
        legacyHref: "/inventory/stock",
        icon: "Boxes",
        section: "Điều phối",
        availability: "live-data",
      },
      {
        pattern: "receiving",
        title: "Nhập kho",
        description: "Điều phối lệnh nhập, phiếu nhập và trạng thái tiếp nhận gần đây.",
        legacyHref: "/inventory/receiving",
        icon: "ArrowDownToLine",
        section: "Điều phối",
        availability: "live-data",
      },
      {
        pattern: "reports",
        title: "Báo cáo",
        description: "Tổng hợp cảnh báo, biến động và giá trị tồn theo site.",
        legacyHref: "/inventory/reports",
        icon: "BarChart3",
        section: "Điều phối",
        availability: "live-data",
      },
    ],
  },
  {
    title: "Nghiệp vụ",
    items: [
      {
        pattern: "purchase-orders",
        title: "Đơn mua hàng",
        description: "Theo dõi danh sách đơn mua đang mở và các bước xử lý liên quan.",
        legacyHref: "/inventory/purchase-orders",
        icon: "ShoppingCart",
        section: "Nghiệp vụ",
        availability: "transition",
      },
      {
        pattern: "purchase-orders/new",
        title: "Tạo đơn mua",
        description: "Tạo mới đơn mua trong trải nghiệm beta và điều hướng lại đúng bề mặt cũ khi cần.",
        legacyHref: "/inventory/purchase-orders/new",
        icon: "SquarePen",
        section: "Nghiệp vụ",
        availability: "transition",
      },
      {
        pattern: "purchase-orders/:id",
        title: "Chi tiết đơn mua",
        description: "Theo dõi một đơn mua cụ thể và trạng thái hiện tại của nó.",
        legacyHref: "/inventory/purchase-orders",
        icon: "ShoppingCart",
        section: "Nghiệp vụ",
        availability: "transition",
      },
      {
        pattern: "grn",
        title: "Phiếu nhập",
        description: "Điểm vào danh sách phiếu nhập kho trong hệ thống.",
        legacyHref: "/inventory/grn",
        icon: "Receipt",
        section: "Nghiệp vụ",
        availability: "transition",
      },
      {
        pattern: "grn/:id",
        title: "Chi tiết phiếu nhập",
        description: "Theo dõi một phiếu nhập cụ thể với bối cảnh beta rõ ràng hơn.",
        legacyHref: "/inventory/grn",
        icon: "Receipt",
        section: "Nghiệp vụ",
        availability: "transition",
      },
      {
        pattern: "supplier-invoices",
        title: "Hóa đơn NCC",
        description: "Theo dõi đối soát hoá đơn nhà cung cấp trong bề mặt beta.",
        legacyHref: "/inventory/supplier-invoices",
        icon: "FileText",
        section: "Nghiệp vụ",
        availability: "transition",
      },
      {
        pattern: "transfers",
        title: "Điều chuyển",
        description: "Giám sát luồng hàng đi, hàng đến và các xác nhận liên quan.",
        legacyHref: "/inventory/transfers",
        icon: "ArrowLeftRight",
        section: "Nghiệp vụ",
        availability: "live-data",
      },
      {
        pattern: "transfers/:id",
        title: "Chi tiết điều chuyển",
        description: "Theo dõi chi tiết một lệnh điều chuyển đang xử lý.",
        legacyHref: "/inventory/transfers",
        icon: "ArrowLeftRight",
        section: "Nghiệp vụ",
        availability: "transition",
      },
      {
        pattern: "issues",
        title: "Phiếu xuất",
        description: "Xem nhanh các phiếu xuất và bước xử lý hiện có.",
        legacyHref: "/inventory/issues",
        icon: "PackageMinus",
        section: "Nghiệp vụ",
        availability: "transition",
      },
      {
        pattern: "issues/:id",
        title: "Chi tiết phiếu xuất",
        description: "Theo dõi trạng thái và bối cảnh của một phiếu xuất cụ thể.",
        legacyHref: "/inventory/issues",
        icon: "PackageMinus",
        section: "Nghiệp vụ",
        availability: "transition",
      },
      {
        pattern: "stocktake",
        title: "Kiểm kê",
        description: "Tập trung các phiên kiểm kê đang chạy và cảnh báo cần xử lý.",
        legacyHref: "/inventory/stocktake",
        icon: "ClipboardList",
        section: "Nghiệp vụ",
        availability: "live-data",
      },
      {
        pattern: "stocktake/:id",
        title: "Chi tiết kiểm kê",
        description: "Theo dõi một phiên kiểm kê cụ thể với bối cảnh beta rõ ràng.",
        legacyHref: "/inventory/stocktake",
        icon: "ClipboardList",
        section: "Nghiệp vụ",
        availability: "transition",
      },
      {
        pattern: "expiry",
        title: "Hạn dùng",
        description: "Cảnh báo lô hàng gần hết hạn và nhịp xử lý ưu tiên.",
        legacyHref: "/inventory/expiry",
        icon: "Hourglass",
        section: "Nghiệp vụ",
        availability: "live-data",
      },
      {
        pattern: "production",
        title: "Bếp trung tâm",
        description: "Điều phối lệnh sản xuất và trạng thái hoàn thành theo site.",
        legacyHref: "/inventory/production",
        icon: "Factory",
        section: "Nghiệp vụ",
        availability: "live-data",
      },
    ],
  },
  {
    title: "Danh mục & Thiết lập",
    items: [
      {
        pattern: "ingredients",
        title: "Nguyên liệu",
        description: "Điểm vào cấu trúc nguyên liệu và danh mục sử dụng trong kho.",
        legacyHref: "/inventory/ingredients",
        icon: "Carrot",
        section: "Danh mục & Thiết lập",
        availability: "transition",
      },
      {
        pattern: "suppliers",
        title: "Nhà cung cấp",
        description: "Theo dõi danh sách nhà cung cấp và trạng thái liên quan.",
        legacyHref: "/inventory/suppliers",
        icon: "Truck",
        section: "Danh mục & Thiết lập",
        availability: "transition",
      },
      {
        pattern: "recipes",
        title: "Công thức",
        description: "Điểm vào cấu trúc công thức và BOM của hệ thống.",
        legacyHref: "/inventory/recipes",
        icon: "BookOpenText",
        section: "Danh mục & Thiết lập",
        availability: "transition",
      },
      {
        pattern: "settings",
        title: "Thiết lập kho",
        description: "Trung tâm thiết lập dành riêng cho phân hệ kho.",
        legacyHref: "/inventory/settings",
        icon: "Settings",
        section: "Danh mục & Thiết lập",
        availability: "transition",
      },
      {
        pattern: "settings/ingredients",
        title: "Thiết lập nguyên liệu",
        description: "Cấu hình nhóm và quy ước cho nguyên liệu.",
        legacyHref: "/inventory/settings/ingredients",
        icon: "Carrot",
        section: "Danh mục & Thiết lập",
        availability: "transition",
      },
      {
        pattern: "settings/recipes",
        title: "Thiết lập công thức",
        description: "Cấu hình nhóm và phân loại công thức.",
        legacyHref: "/inventory/settings/recipes",
        icon: "BookOpenText",
        section: "Danh mục & Thiết lập",
        availability: "transition",
      },
      {
        pattern: "settings/suppliers",
        title: "Thiết lập nhà cung cấp",
        description: "Cấu hình phân nhóm và tham số cho nhà cung cấp.",
        legacyHref: "/inventory/settings/suppliers",
        icon: "Truck",
        section: "Danh mục & Thiết lập",
        availability: "transition",
      },
      {
        pattern: "settings/expiry",
        title: "Thiết lập hạn dùng",
        description: "Điều chỉnh ngưỡng cảnh báo cho các lô gần hết hạn.",
        legacyHref: "/inventory/settings/expiry",
        icon: "Hourglass",
        section: "Danh mục & Thiết lập",
        availability: "transition",
      },
    ],
  },
];

function splitPattern(pattern: string): string[] {
  return pattern.split("/").filter(Boolean);
}

function isDynamicSegment(segment: string): boolean {
  return segment.startsWith(":");
}

function matchPattern(pattern: string, slug: string[]): boolean {
  const patternSegments = splitPattern(pattern);

  if (patternSegments.length !== slug.length) {
    return false;
  }

  return patternSegments.every((segment, index) => {
    if (isDynamicSegment(segment)) {
      return Boolean(slug[index]);
    }

    return segment === slug[index];
  });
}

function findMatchingRoute(
  groups: BetaRouteGroup[],
  slug: string[],
): BetaRouteItem | null {
  for (const group of groups) {
    for (const item of group.items) {
      if (matchPattern(item.pattern, slug)) {
        return item;
      }
    }
  }

  return null;
}

function buildPath(basePath: "/beta/admin" | "/beta/inventory", pattern: string): string {
  if (!pattern) {
    return basePath;
  }

  return `${basePath}/${splitPattern(pattern).filter((segment) => !isDynamicSegment(segment)).join("/")}`;
}

function buildNavGroups(
  basePath: "/beta/admin" | "/beta/inventory",
  groups: BetaRouteGroup[],
): BetaNavGroup[] {
  return groups.map((group) => ({
    title: group.title,
    items: group.items
      .filter(
        (item) =>
          item.pattern.length > 0 &&
          !splitPattern(item.pattern).some(isDynamicSegment),
      )
      .map((item) => ({
        href: buildPath(basePath, item.pattern),
        label: item.title,
        icon: item.icon,
      })),
  }));
}

export function getAdminBetaRouteGroups(): BetaRouteGroup[] {
  return ADMIN_ROUTE_GROUPS;
}

export function getInventoryBetaRouteGroups(): BetaRouteGroup[] {
  return INVENTORY_ROUTE_GROUPS;
}

export function getAdminBetaNavGroups(): BetaNavGroup[] {
  return buildNavGroups("/beta/admin", ADMIN_ROUTE_GROUPS);
}

export function getInventoryBetaNavGroups(): BetaNavGroup[] {
  return buildNavGroups("/beta/inventory", INVENTORY_ROUTE_GROUPS);
}

export function findAdminBetaRoute(slug: string[]): BetaRouteItem | null {
  return findMatchingRoute(ADMIN_ROUTE_GROUPS, slug);
}

export function findInventoryBetaRoute(slug: string[]): BetaRouteItem | null {
  return findMatchingRoute(INVENTORY_ROUTE_GROUPS, slug);
}

export function getSiblingRoutes(
  groups: BetaRouteGroup[],
  currentSection: string,
  currentPattern: string,
  basePath: "/beta/admin" | "/beta/inventory",
): BetaNavItem[] {
  return groups
    .find((group) => group.title === currentSection)
    ?.items.filter(
      (item) =>
        item.pattern !== currentPattern &&
        !splitPattern(item.pattern).some(isDynamicSegment),
    )
    .slice(0, 4)
    .map((item) => ({
      href: buildPath(basePath, item.pattern),
      label: item.title,
      icon: item.icon,
    })) ?? [];
}

export function toLegacyFromBetaPath(pathname: string): string {
  if (pathname === "/beta") {
    return "/";
  }

  if (pathname.startsWith("/beta/")) {
    return pathname.slice("/beta".length) || "/";
  }

  return pathname;
}

export function getBetaNoticeLegacyHref(slug: string[]): string {
  return slug.length > 0 ? `/${slug.join("/")}` : "/";
}
