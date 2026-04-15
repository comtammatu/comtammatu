import type { StaffRole } from "./types";

/** CRUD danh mục nguyên liệu + allowlist chi nhánh — Trụ sở */
export const INVENTORY_CATALOG_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
];

/** Tồn kho, luân chuyển, điều chỉnh tồn theo chi nhánh */
export const INVENTORY_OPS_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
];

/** NCC, PO, GRN, HĐ NCC, công thức */
export const PROCUREMENT_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
];
