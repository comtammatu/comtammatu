import type { StaffRole } from "./types";

/** CRUD danh mục nguyên liệu + allowlist chi nhánh */
export const INVENTORY_CATALOG_ROLES: readonly StaffRole[] = [
  "owner",
  "manager",
  "staff",
];

/** Tồn kho, luân chuyển, điều chỉnh tồn theo chi nhánh */
export const INVENTORY_OPS_ROLES: readonly StaffRole[] = [
  "owner",
  "manager",
  "staff",
];

/** NCC, PO, GRN, HĐ NCC, công thức */
export const PROCUREMENT_ROLES: readonly StaffRole[] = [
  "owner",
  "manager",
  "staff",
];

/**
 * Phiếu trả NCC + credit notes — gồm cả quản lý chi nhánh
 * (chi nhánh phát hiện hàng hư trong kho mình cũng được đề xuất phiếu trả).
 */
export const SUPPLIER_RETURN_ROLES: readonly StaffRole[] = [
  "owner",
  "manager",
  "staff",
];

/** AP credit-note workspace — finance + procurement + senior ops. */
export const SUPPLIER_CREDIT_NOTE_ROLES: readonly StaffRole[] = [
  "owner",
  "manager",
  "staff",
];
