// Canonical Vietnamese domain terms per docs/ref/glossary.md.
// Use these in any cross-module surface where a domain entity is named.
// Module-specific copy (apps/web/app/inventory/_lib/dictionary.ts,
// apps/web/lib/messages/pos.ts, etc.) may extend or specialize these but
// must not introduce synonyms for the canonical terms.

// POS sale order — distinct from procurement purchase order (PO).
// glossary §"Bán hàng": canonical "Đơn hàng bán" / short "Đơn bán".
export const ORDER_VI = {
  long: "Đơn hàng bán",
  short: "Đơn bán",
  inline: "Đơn", // POS toast template where {code} immediately follows
  code: "Mã đơn",
  number: "Số đơn",
} as const;
export type OrderKey = keyof typeof ORDER_VI;

// Branch entity — operational sales-floor site (branch_kind='branch').
// For umbrella across central_warehouse + central_kitchen + branch in admin
// selectors, use SITE_KIND_LABELS_VI from this package (each kind labeled
// separately).
// glossary §"Tổ chức": canonical "Chi nhánh" / acronym "CN".
export const BRANCH_VI = {
  long: "Chi nhánh",
  acronym: "CN",
  select: "Chọn chi nhánh",
  selectAll: "Tất cả chi nhánh",
  scope: "Phạm vi chi nhánh",
} as const;
export type BranchKey = keyof typeof BRANCH_VI;

// Staff (employee). Formal "nhân viên"; "NV" only acceptable in compact
// badges/columns where width ≤ 80px. For role display labels, use
// ROLE_LABEL_VI from the auth module of this package.
export const STAFF_VI = {
  long: "Nhân viên",
  shortBadge: "NV",
  role: "Chức vụ",
  position: "Vị trí",
} as const;
export type StaffKey = keyof typeof STAFF_VI;

// Dining table entity.
export const TABLE_VI = {
  long: "Bàn",
  number: "Số bàn",
  area: "Khu vực",
} as const;
export type TableKey = keyof typeof TABLE_VI;

// Product / item — context-bound. Pick the field matching the surface; do
// not mix terms across modules. Synonyms here are deliberate, each tied to a
// specific business context per glossary.
//   posItem ("Món")          — POS / KDS line item
//   inventoryItem ("Mặt hàng") — inventory SKU
//   catalogItem ("Sản phẩm")  — admin catalog
//   rawIngredient ("Nguyên liệu") — raw material movement
//   finishedGood ("Thành phẩm")    — central kitchen output
export const PRODUCT_VI = {
  posItem: "Món",
  inventoryItem: "Mặt hàng",
  catalogItem: "Sản phẩm",
  rawIngredient: "Nguyên liệu",
  finishedGood: "Thành phẩm",
} as const;
export type ProductKey = keyof typeof PRODUCT_VI;

// Customer — formal "khách hàng" for CRM/admin; "khách" for POS toast short
// form. HĐĐT buyer-name field is legally fixed; use LEGAL_FIXED_VI from the
// labels module for that surface, never CUSTOMER_VI.
export const CUSTOMER_VI = {
  long: "Khách hàng",
  short: "Khách",
  walkIn: "Khách lẻ",
} as const;
export type CustomerKey = keyof typeof CUSTOMER_VI;
