/**
 * Auth v2 permission keys — canonical TypeScript mirror of `permission_keys` table.
 *
 * These strings are the single source of truth for authz checks. They MUST
 * match the `key` column in the database exactly. When adding a new permission:
 *   1. Add a row to the `permission_keys` catalog via migration
 *   2. Add the key here
 *   3. Wire it into the relevant module/policy
 */

export const PERMISSION_KEYS = {
  // dashboard
  DASHBOARD_VIEW: "dashboard:view",

  // menu
  MENU_READ: "menu:read",
  MENU_WRITE: "menu:write",
  MENU_PUBLISH: "menu:publish",
  MENU_MANAGE_CATEGORY: "menu:manage_category",

  // inventory
  INVENTORY_READ: "inventory:read",
  INVENTORY_WRITE: "inventory:write",
  INVENTORY_STOCKTAKE_CREATE: "inventory:stocktake_create",
  INVENTORY_STOCKTAKE_COMPLETE: "inventory:stocktake_complete",
  INVENTORY_TRANSFER_CREATE: "inventory:transfer_create",
  INVENTORY_TRANSFER_SHIP: "inventory:transfer_ship",
  INVENTORY_TRANSFER_RECEIVE: "inventory:transfer_receive",
  INVENTORY_WRITEOFF: "inventory:writeoff",
  INVENTORY_PRODUCTION_CREATE: "inventory:production_create",
  INVENTORY_PRODUCTION_CONFIRM: "inventory:production_confirm",
  // inventory — redesign S0 (waste tier-2, stocktake blind/recount, adjust, GRN express, catalog review)
  INVENTORY_WASTE_APPROVE: "inventory:waste_approve",
  INVENTORY_WASTE_BYPASS_PHOTO: "inventory:waste_bypass_photo",
  INVENTORY_STOCKTAKE_RECOUNT: "inventory:stocktake_recount",
  INVENTORY_STOCKTAKE_UNBLIND: "inventory:stocktake_unblind",
  INVENTORY_ADJUST_APPROVE: "inventory:adjust_approve",
  INVENTORY_GRN_EXPRESS_CONFIGURE: "inventory:grn_express_configure",
  INVENTORY_GRN_EXPRESS_EXTEND: "inventory:grn_express_extend",
  INVENTORY_GRN_HARDBLOCK_OVERRIDE: "inventory:grn_hardblock_override",
  INVENTORY_CATALOG_REVIEW_POLICY_SET: "inventory:catalog_review_policy_set",
  INVENTORY_ITEM_REVIEW_OVERRIDE_SET: "inventory:item_review_override_set",

  // procurement
  PROCUREMENT_READ: "procurement:read",
  PROCUREMENT_PO_CREATE: "procurement:po_create",
  PROCUREMENT_PO_APPROVE: "procurement:po_approve",
  PROCUREMENT_GRN_CREATE: "procurement:grn_create",
  PROCUREMENT_GRN_CONFIRM: "procurement:grn_confirm",
  PROCUREMENT_INVOICE_CREATE: "procurement:invoice_create",
  PROCUREMENT_INVOICE_MATCH: "procurement:invoice_match",
  PROCUREMENT_SUPPLIER_MANAGE: "procurement:supplier_manage",
  // procurement — redesign S0 (price list + override code)
  PROCUREMENT_PRICE_LIST_READ: "procurement:price_list_read",
  PROCUREMENT_PRICE_LIST_WRITE: "procurement:price_list_write",
  PROCUREMENT_OVERRIDE_CODE_ROTATE: "procurement:override_code_rotate",

  // accounting
  ACCOUNTING_PERIOD_REOPEN: "accounting:period_reopen",

  // supplier returns (QC at receiving + post-receipt returns)
  SUPPLIER_RETURN_READ: "supplier_return:read",
  SUPPLIER_RETURN_CREATE: "supplier_return:create",
  SUPPLIER_RETURN_CONFIRM: "supplier_return:confirm",

  // orders
  ORDERS_READ: "orders:read",
  ORDERS_WRITE: "orders:write",
  ORDERS_VOID: "orders:void",
  ORDERS_REFUND: "orders:refund",

  // staff
  STAFF_VIEW: "staff:view",
  STAFF_MANAGE: "staff:manage",
  STAFF_ASSIGN_PERMISSION: "staff:assign_permission",
  STAFF_ASSIGN_POSITION: "staff:assign_position",

  // hr
  HR_VIEW_EMPLOYEE: "hr:view_employee",
  HR_MANAGE_EMPLOYEE: "hr:manage_employee",
  HR_CONTRACT_CREATE: "hr:contract_create",
  HR_CONTRACT_SIGN: "hr:contract_sign",
  HR_TERMINATE: "hr:terminate",
  HR_DEPENDENT_MANAGE: "hr:dependent_manage",

  // crm
  CRM_READ: "crm:read",
  CRM_WRITE: "crm:write",
  CRM_CAMPAIGN_SEND: "crm:campaign_send",

  // finance
  FINANCE_VIEW: "finance:view",
  FINANCE_EXPENSE_CREATE: "finance:expense_create",
  FINANCE_EXPENSE_APPROVE: "finance:expense_approve",
  FINANCE_PAYROLL_CALCULATE: "finance:payroll_calculate",
  FINANCE_PAYROLL_APPROVE: "finance:payroll_approve",
  FINANCE_AP_PAY: "finance:ap_pay",

  // reports
  REPORTS_VIEW_BRANCH: "reports:view_branch",
  REPORTS_VIEW_TENANT: "reports:view_tenant",
  REPORTS_EXPORT: "reports:export",
  REPORTS_PIT_EXPORT: "reports:pit_export",

  // settings
  SETTINGS_BRANCH: "settings:branch",
  SETTINGS_TENANT: "settings:tenant",
  SETTINGS_INTEGRATIONS: "settings:integrations",

  // pos
  POS_USE: "pos:use",
  POS_VOID_ORDER: "pos:void_order",
  POS_APPLY_DISCOUNT: "pos:apply_discount",
  POS_OPEN_CASHBOX: "pos:open_cashbox",
  POS_CLOSE_SHIFT: "pos:close_shift",
  POS_REPRINT_RECEIPT: "pos:reprint_receipt",
  POS_SEND_KITCHEN: "pos:send_kitchen",
  POS_PRINT: "pos:print",
  POS_CONFIRM_PAYMENT: "pos:confirm_payment",
  POS_CLOSE_SHIFT_VARIANCE_OVERRIDE: "pos:close_shift_variance_override",

  // kds
  KDS_USE: "kds:use",
  KDS_MARK_READY: "kds:mark_ready",
  KDS_RECALL: "kds:recall",

  // printer
  PRINTER_MANAGE: "printer:manage",
} as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[keyof typeof PERMISSION_KEYS];

/** Total count (static assertion — update when adding keys) */
export const PERMISSION_KEY_COUNT = 84;

/**
 * Pure function: check if a permission set contains a given key.
 * Use this in shared/server code. For React components, prefer `usePermissions()`.
 */
export function hasPermission(
  permissions: ReadonlySet<string> | readonly string[] | null | undefined,
  key: PermissionKey | string,
): boolean {
  if (!permissions) return false;
  if (Array.isArray(permissions)) return permissions.includes(key);
  return (permissions as ReadonlySet<string>).has(key);
}

/**
 * Check that ALL required keys are present.
 */
export function hasAllPermissions(
  permissions: ReadonlySet<string> | readonly string[] | null | undefined,
  keys: readonly (PermissionKey | string)[],
): boolean {
  if (!permissions) return false;
  const set: ReadonlySet<string> = Array.isArray(permissions)
    ? new Set(permissions)
    : (permissions as ReadonlySet<string>);
  return keys.every((k) => set.has(k));
}

/**
 * Check that at least ONE of the keys is present.
 */
export function hasAnyPermission(
  permissions: ReadonlySet<string> | readonly string[] | null | undefined,
  keys: readonly (PermissionKey | string)[],
): boolean {
  if (!permissions) return false;
  const set: ReadonlySet<string> = Array.isArray(permissions)
    ? new Set(permissions)
    : (permissions as ReadonlySet<string>);
  return keys.some((k) => set.has(k));
}
