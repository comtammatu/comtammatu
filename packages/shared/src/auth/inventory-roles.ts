import type { StaffRole } from "./types";

/** CRUD danh mục nguyên liệu + allowlist chi nhánh */
export const INVENTORY_CATALOG_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "warehouse_manager",
  "production_manager",
];

/** Tồn kho, luân chuyển, điều chỉnh tồn theo chi nhánh */
export const INVENTORY_OPS_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
  "warehouse_manager",
  "production_manager",
];

/** NCC, PO, GRN, HĐ NCC, công thức */
export const PROCUREMENT_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "warehouse_manager",
  "production_manager",
];

/**
 * Phiếu trả NCC + credit notes — bao gồm cả branch_manager / area_manager
 * (chi nhánh phát hiện hàng hư trong kho mình cũng được đề xuất phiếu trả,
 * và quản lý vùng cần view để duyệt chéo).
 */
export const SUPPLIER_RETURN_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
  "warehouse_manager",
  "production_manager",
];

/** AP credit-note workspace — finance + procurement + senior ops. */
export const SUPPLIER_CREDIT_NOTE_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "warehouse_manager",
  "office",
];
