import type { StaffRole } from "./types";

/** CRUD danh mục nguyên liệu + allowlist chi nhánh */
export const INVENTORY_CATALOG_ROLES: readonly StaffRole[] = [
  "owner",
  "warehouse_manager",
  "production_manager",
];

/** Tồn kho, luân chuyển, điều chỉnh tồn theo chi nhánh */
export const INVENTORY_OPS_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
  "warehouse_manager",
  "production_manager",
];

/** NCC, PO, GRN, HĐ NCC, công thức */
export const PROCUREMENT_ROLES: readonly StaffRole[] = [
  "owner",
  "warehouse_manager",
  "production_manager",
];

/** Phiếu trả NCC + credit notes. */
export const SUPPLIER_RETURN_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
  "warehouse_manager",
  "production_manager",
];
