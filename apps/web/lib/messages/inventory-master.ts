export const UNITS_VI = {
  page: {
    eyebrow: "Quản lý nguyên liệu",
    title: "Đơn vị đo",
    description: "Đơn vị dùng chung. Quy đổi cấu hình theo từng nguyên liệu.",
  },
  add: "Thêm đơn vị",
  empty: "Chưa có đơn vị nào. Thêm đơn vị đầu tiên để bắt đầu.",
  emptyPackaging: "Chưa có đơn vị đóng gói. Thêm đơn vị đầu tiên.",
  showInactive: "Hiện đơn vị đã ngừng dùng",
  standard: {
    title: "Đơn vị chuẩn",
    description: "Đơn vị đo hệ thống. Hệ số quy đổi cố định, không sửa được.",
    mass: "Khối lượng",
    volume: "Thể tích",
    factor: (unit: string) => `1 = ${unit}`,
  },
  packaging: {
    title: "Đơn vị đóng gói",
    description:
      "Chỉ đổi mã trước khi gán nguyên liệu. Sau khi gán, chỉ được ngừng dùng.",
  },
  cols: {
    code: "Mã",
    name: "Tên",
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
    description: (name: string) => `Xoá đơn vị "${name}"? Không thể hoàn tác.`,
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
    description: "Phân nhóm nguyên liệu để lọc, báo cáo và gán màu hiển thị.",
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
    baseUnit: "Đơn vị chuẩn",
    baseUnitDescription: "Tồn kho và giá vốn được lưu theo đơn vị này.",
    unitPending: "…",
    sectionLabel: "Đơn vị và quy đổi",
    anchorAria: (unit: string) => `Quy đổi ${unit} sang đơn vị`,
    factorAria: (unit: string) => `Số lượng đơn vị đích trong 1 ${unit}`,
    anchorRequired: "Chọn đơn vị cần quy đổi sang",
    anchorSelf: "Một đơn vị không thể quy đổi sang chính nó",
    anchorCycle: "Quan hệ này tạo vòng lặp. Chọn đơn vị đích khác",
    reassignBeforeRemove: (dependent: string, target: string) =>
      `${dependent} đang quy đổi sang ${target}. Hãy đổi đơn vị đích trước`,
    removeBlocked: (target: string, dependents: string) =>
      `Không thể bỏ ${target} vì ${dependents} đang quy đổi theo đơn vị này. Hãy đổi đơn vị đích trước.`,
    chooseNewBaseBeforeRemove: (unit: string) =>
      `Hãy chọn đơn vị chuẩn khác trước khi bỏ ${unit}.`,
    selectBase: "Chọn đơn vị chuẩn",
    baseMustBeSelected: "Đơn vị chuẩn phải thuộc danh sách đã chọn",
    invalidBaseFactor:
      "Chưa thể đổi đơn vị chuẩn vì đơn vị mới chưa có hệ số hợp lệ",
    dimensionMismatch:
      "Các đơn vị chuẩn phải cùng loại đo lường (khối lượng hoặc thể tích)",
    add: "Thêm đơn vị",
    empty: "Chưa có đơn vị nào.",
    maxReached: "Mỗi nguyên liệu có tối đa 20 đơn vị",
    remove: "Bỏ đơn vị",
    selectUnit: "Chọn đơn vị",
    anchorPlaceholder: "Chọn đơn vị",
    actionsFor: "Thao tác đơn vị",
    doneEditing: "Xong",
    relationSummary: (unit: string, factor: string, anchor: string) =>
      `1 ${unit} = ${factor} ${anchor}`,
    effectiveSummary: (factor: string, base: string) =>
      `${factor} ${base} theo đơn vị chuẩn`,
    previewInvalid: "Hoàn tất hệ số và đơn vị đích để xem kết quả",
    minOne: "Cần ít nhất 1 đơn vị",
    exactlyOneBase: "Phải có đúng 1 đơn vị chuẩn",
    baseFactorOne: "Đơn vị chuẩn phải có hệ số = 1",
    factorPositive: "Quy đổi phải lớn hơn 0",
    factorPrecision: "Hệ số quy đổi có tối đa 9 số nguyên và 9 số thập phân",
    effectiveFactorPrecision:
      "Kết quả về đơn vị chuẩn phải nằm trong 6 số nguyên và 12 số thập phân",
    distinctUnits: "Đơn vị không được trùng nhau",
    baseTag: "Chuẩn",
  },
} as const;
