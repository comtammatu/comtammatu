export const UNITS_VI = {
  page: {
    eyebrow: "Quản lý nguyên liệu",
    title: "Đơn vị đo",
    description:
      "Danh mục đơn vị đo dùng chung cho nguyên liệu: đơn vị nhập, đơn vị tính và quy đổi.",
  },
  add: "Thêm đơn vị",
  empty: "Chưa có đơn vị nào. Thêm đơn vị đầu tiên để bắt đầu.",
  cols: {
    code: "Mã",
    name: "Tên",
    status: "Trạng thái",
  },
  status: {
    active: "Đang dùng",
    inactive: "Ngừng dùng",
  },
  form: {
    addTitle: "Thêm đơn vị",
    editTitle: "Sửa đơn vị",
    code: "Mã đơn vị",
    codePlaceholder: "Ví dụ: kg, gói, thùng",
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
    hint: "Chọn 1 đơn vị gốc (hệ số quy đổi = 1). Các đơn vị khác quy đổi về đơn vị gốc.",
    colUnit: "Đơn vị",
    colFactor: "Hệ số quy đổi",
    colBase: "Gốc",
    colPurchase: "Nhập",
    colIssue: "Xuất",
    colProduction: "Sản xuất",
    selectUnit: "Chọn đơn vị",
    minOne: "Cần ít nhất 1 đơn vị",
    exactlyOneBase: "Phải có đúng 1 đơn vị gốc",
    baseFactorOne: "Đơn vị gốc phải có hệ số = 1",
    factorPositive: "Hệ số quy đổi phải lớn hơn 0",
    distinctUnits: "Đơn vị không được trùng nhau",
    baseTag: "gốc",
  },
} as const;
