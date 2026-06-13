import { staffRoleFromPositionCode } from "@comtammatu/shared/auth";

/**
 * `notifications.target_roles` mang access BUCKET (RLS `notifications_select`
 * so bằng `auth_role()`), không phải position code. Push targeting phải quy
 * position code về bucket trước khi so — so code thô từng làm Quản lý chi
 * nhánh (position `quan_ly_CN` cũ) không bao giờ nhận push dù in-app vẫn thấy.
 */

export interface PushTargetNotification {
  tenant_id: number;
  target_branch_id: number | null;
  target_roles: string[];
}

export interface PushTargetSubscription {
  tenant_id: number;
}

export interface PushTargetProfile {
  tenant_id: number;
  branch_id: number | null;
  is_active: boolean | null;
}

export interface PushTargetPosition {
  tenant_id: number;
  code: string;
}

const TENANT_WIDE_ROLES = new Set(["owner"]);

export function canReceiveNotification(
  notification: PushTargetNotification,
  subscription: PushTargetSubscription,
  profile: PushTargetProfile | undefined,
  position: PushTargetPosition | undefined,
): boolean {
  if (!profile || !position) return false;
  if (profile.is_active === false) return false;
  if (profile.tenant_id !== notification.tenant_id) return false;
  if (subscription.tenant_id !== notification.tenant_id) return false;
  if (position.tenant_id !== notification.tenant_id) return false;

  const bucket = staffRoleFromPositionCode(position.code);
  if (bucket === "unassigned") return false;
  if (!notification.target_roles.includes(bucket)) return false;
  if (notification.target_branch_id === null) return true;
  if (profile.branch_id === notification.target_branch_id) return true;
  return TENANT_WIDE_ROLES.has(bucket);
}
