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
 * Phiếu trả NCC + credit notes — chi nhánh có thể đề xuất phiếu trả,
 * còn cấp tenant/kho/bếp trung tâm xử lý phần quản trị.
 */
export const SUPPLIER_RETURN_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "branch_manager",
  "warehouse_manager",
  "production_manager",
];
