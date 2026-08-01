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
    inputUnit: "Đơn vị nhập",
    outputUnit: "Đơn vị xuất",
    baseUnit: "Đơn vị tồn chuẩn",
    baseUnitDescription:
      "Tồn kho lưu theo đơn vị này; phải là một trong các vai trò đã chọn.",
    conversionAria: (fromUnit: string, toUnit: string) =>
      `Số ${toUnit} trong 1 ${fromUnit}`,
    unitPending: "…",
    roleSectionLabel: "Vai trò đơn vị",
    conversionSection: (baseUnit: string) => `Quy đổi về ${baseUnit}`,
    inputRole: "Nhập",
    outputRole: "Xuất",
    selectBase: "Chọn đơn vị tồn chuẩn",
    baseMustBeRole: "Đơn vị tồn chuẩn phải thuộc ít nhất một vai trò",
    chooseBaseBeforeRoleChange:
      "Hãy chọn đơn vị tồn chuẩn khác trước khi đổi vai trò này",
    invalidBaseFactor:
      "Chưa thể đổi tồn chuẩn vì đơn vị mới chưa có hệ số hợp lệ",
    dimensionMismatch:
      "Các đơn vị chuẩn phải cùng loại đo lường (khối lượng hoặc thể tích)",
    add: "Thêm đơn vị",
    empty: "Chưa có đơn vị nào.",
    hint: "Đơn vị nhập và xuất là các vai trò độc lập. Mỗi đơn vị quy đổi trực tiếp về tồn chuẩn.",
    colUnit: "Đơn vị",
    colFactor: "Quy đổi về tồn chuẩn",
    colAnchor: "Quy đổi theo",
    colBase: "Tồn chuẩn",
    selectUnit: "Chọn đơn vị",
    anchorPlaceholder: "Chọn đơn vị",
    autoStandard: "Tự động",
    previewPrefix: (unit: string) => `1 ${unit} =`,
    previewValue: (factor: string, base: string) => `${factor} ${base}`,
    previewCanonical: (unit: string, factor: string, base: string) =>
      `Quy đổi về tồn chuẩn: 1 ${unit} = ${factor} ${base}`,
    previewInvalid: "Chưa cấu hình quy đổi",
    minOne: "Cần ít nhất 1 đơn vị",
    exactlyOneBase: "Phải có đúng 1 đơn vị tồn chuẩn",
    baseFactorOne: "Đơn vị tồn chuẩn phải có hệ số = 1",
    factorPositive: "Quy đổi phải lớn hơn 0",
    distinctUnits: "Đơn vị không được trùng nhau",
    baseTag: "Tồn chuẩn",
  },
} as const;
