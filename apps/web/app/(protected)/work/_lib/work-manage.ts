import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { getAuthContext, probePermission } from "@/_lib/auth";
import type { ActionContext } from "@/_lib/with-action";
import { WORK_ROUTE_ROLES } from "./work-roles";

export async function resolveWorkManageContext(): Promise<ActionContext | null> {
  const ctx = await getAuthContext(WORK_ROUTE_ROLES);
  if (!ctx) return null;
  if (ctx.claims.user_role === "owner") return ctx;
  const allowed = await probePermission(ctx, PERMISSION_KEYS.WORK_MANAGE);
  return allowed ? ctx : null;
}

export async function canManageWorkTeam(
  ctx: Pick<ActionContext, "supabase" | "claims">,
): Promise<boolean> {
  if (ctx.claims.user_role === "owner") return true;
  return probePermission(ctx, PERMISSION_KEYS.WORK_MANAGE);
}
