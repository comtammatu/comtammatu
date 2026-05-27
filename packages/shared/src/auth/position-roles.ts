import { STAFF_ROLES, type StaffRole } from "./types";

const STAFF_ROLE_SET = new Set<string>(STAFF_ROLES);

export const POSITION_CODE_TO_STAFF_ROLE = {
  executive_assistant: "super_manager",
  chief_accountant: "office",
  accountant: "office",
  warehouse_head: "warehouse_manager",
  warehouse_keeper: "warehouse_manager",
  head_chef: "production_manager",
  kitchen_helper: "chef",
} as const satisfies Record<string, StaffRole>;

export function isStaffRole(
  value: string | null | undefined,
): value is StaffRole {
  return value != null && STAFF_ROLE_SET.has(value);
}

export function resolveStaffRoleFromPositionCode(
  code: string | null | undefined,
): StaffRole | null {
  if (!code) return null;

  const mappedRole =
    POSITION_CODE_TO_STAFF_ROLE[
      code as keyof typeof POSITION_CODE_TO_STAFF_ROLE
    ];
  return mappedRole ?? (isStaffRole(code) ? code : null);
}
