export const UNITS_VI = {
  page: {
    eyebrow: "Quản lý nguyên liệu",
    title: "Đơn vị đo",
    description:
      "Danh mục đơn vị đo dùng chung cho nguyên liệu: đơn vị nhập, đơn vị tính và quy đổi.",
  },
  add: "Thêm đơn vị",
  empty: "Chưa có đơn vị nào. Thêm đơn vị đầu tiên để bắt đầu.",
  emptyPackaging: "Chưa có đơn vị đóng gói nào. Thêm đơn vị đầu tiên để bắt đầu.",
  showInactive: "Hiện đơn vị đã ngừng dùng",
  standard: {
    title: "Đơn vị chuẩn",
    description:
      "Đơn vị đo hệ thống (khối lượng và thể tích). Hệ số quy đổi cố định, không thể chỉnh sửa.",
    mass: "Khối lượng",
    volume: "Thể tích",
    factor: (unit: string) => `1 = ${unit}`,
  },
  packaging: {
    title: "Đơn vị đóng gói",
    description:
      "Đơn vị nhập và đóng gói do cửa hàng tự khai báo. Có thể thêm, sửa, ngừng dùng hoặc xoá.",
  },
  cols: {
    code: "Mã",
    name: "Tên hiển thị",
    status: "Trạng thái",
  },
  status: {
    active: "Đang dùng",
    inactive: "Ngừng dùng",
    inUse: "Đang gán nguyên liệu",
  },
  deactivate: {
    action: "Ngừng dùng",
    success: "Đã ngừng dùng đơn vị",
    failed: "Không thể ngừng dùng đơn vị",
  },
  form: {
    addTitle: "Thêm đơn vị",
    editTitle: "Sửa đơn vị",
    code: "Mã đơn vị",
    codePlaceholder: "Ví dụ: bottle, case, portion",
    name: "Tên hiển thị",
    namePlaceholder: "Ví dụ: chai, thùng, phần",
    isActive: "Đang dùng",
    save: "Lưu",
    cancel: "Huỷ",
    addSuccess: "Đã thêm đơn vị",
    editSuccess: "Đã cập nhật đơn vị",
  },
  edit: "Sửa đơn vị",
  delete: {
    action: "Xoá",
    title: "Xoá đơn vị?",
    description: (name: string) =>
      `Xoá đơn vị "${name}"? Không thể hoàn tác.`,
    confirm: "Xoá",
    cancel: "Không",
    success: "Đã xoá đơn vị",
    inUse: "Đơn vị đang được dùng, không thể xoá",
    failed: "Không thể xoá đơn vị",
  },
} as const;

export const CATEGORIES_VI = {
  page: {
    eyebrow: "Quản lý nguyên liệu",
    title: "Nhóm nguyên liệu",
    description:
      "Phân nhóm nguyên liệu để lọc, báo cáo và gán màu hiển thị trong danh mục.",
  },
  add: "Thêm nhóm",
  empty: "Chưa có nhóm nào. Thêm nhóm đầu tiên để bắt đầu.",
  cols: {
    name: "Tên",
    sortOrder: "Thứ tự",
    status: "Trạng thái",
  },
  status: {
    active: "Đang dùng",
    inactive: "Ngừng dùng",
  },
  form: {
    addTitle: "Thêm nhóm",
    editTitle: "Sửa nhóm",
    name: "Tên nhóm",
    namePlaceholder: "Ví dụ: Thịt, Rau củ, Gia vị",
    toneClass: "Lớp màu (tuỳ chọn)",
    toneClassPlaceholder: "Ví dụ: bg-primary/10 text-primary",
    sortOrder: "Thứ tự hiển thị",
    isActive: "Đang dùng",
    save: "Lưu",
    cancel: "Huỷ",
    addSuccess: "Đã thêm nhóm",
    editSuccess: "Đã cập nhật nhóm",
  },
  edit: "Sửa nhóm",
  delete: {
    action: "Xoá",
    title: "Xoá nhóm?",
    description: (name: string) =>
      `Xoá nhóm "${name}"? Nguyên liệu thuộc nhóm này sẽ trở về chưa phân nhóm.`,
    confirm: "Xoá",
    cancel: "Không",
    success: "Đã xoá nhóm",
    failed: "Không thể xoá nhóm",
  },
} as const;

export const INGREDIENT_FORM_VI = {
  category: {
    label: "Nhóm nguyên liệu",
    placeholder: "Chọn nhóm",
    none: "Chưa phân nhóm",
    all: "Tất cả nhóm",
  },
  units: {
    sectionLabel: "Đơn vị",
    add: "Thêm đơn vị",
    empty: "Chưa có đơn vị nào.",
    hint: "Đơn vị tồn chuẩn có hệ số = 1. Mỗi đơn vị nhập/đếm phải quy đổi được về tồn chuẩn (ví dụ: 1 thùng = 24 chai).",
    colUnit: "Đơn vị",
    colFactor: "Quy đổi về tồn chuẩn",
    colAnchor: "Quy đổi theo",
    colBase: "Tồn chuẩn",
    selectUnit: "Chọn đơn vị",
    anchorPlaceholder: "Chọn đơn vị",
    autoStandard: "Tự động (đơn vị chuẩn)",
    previewPrefix: (unit: string) => `1 ${unit} =`,
    previewValue: (factor: string, base: string) => `${factor} ${base}`,
    previewCanonical: (unit: string, factor: string, base: string) =>
      `Quy đổi về tồn chuẩn: 1 ${unit} = ${factor} ${base}`,
    previewInvalid: "Chưa cấu hình quy đổi",
    minOne: "Cần ít nhất 1 đơn vị",
    exactlyOneBase: "Phải có đúng 1 đơn vị tồn chuẩn",
    baseFactorOne: "Đơn vị tồn chuẩn phải có hệ số = 1",
    factorPositive: "Hệ số quy đổi phải lớn hơn 0",
    distinctUnits: "Đơn vị không được trùng nhau",
    baseTag: "tồn chuẩn",
  },
} as const;
