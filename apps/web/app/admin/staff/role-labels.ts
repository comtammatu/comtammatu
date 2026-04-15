import {
  MANAGEABLE_STAFF_ROLES,
  ROLE_LABEL_VI,
  TENANT_LEVEL_ROLES,
  type StaffRole,
} from "@comtammatu/shared/auth";

/** All role labels (for display) */
export const ROLE_LABELS: Record<StaffRole, string> = ROLE_LABEL_VI;

/** Roles manageable via staff page (excludes owner/super_manager) */
export const MANAGEABLE_ROLES: Partial<Record<StaffRole, string>> =
  Object.fromEntries(
    MANAGEABLE_STAFF_ROLES.map((role) => [role, ROLE_LABELS[role]]),
  ) as Partial<Record<StaffRole, string>>;

export { TENANT_LEVEL_ROLES };
