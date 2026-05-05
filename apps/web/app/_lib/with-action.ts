import type { z } from "zod";
import type { PermissionKey, StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  getAuthContext,
  getAuthContextWithAnyPermission,
  getAuthContextWithPermission,
} from "./auth";

/** Context provided to action handlers after auth succeeds. */
export type ActionContext = NonNullable<
  Awaited<ReturnType<typeof getAuthContext>>
>;

type PermissionLike = PermissionKey | string;

type BaseActionOptions<TSchema extends z.ZodType> = {
  roles: readonly StaffRole[];
  schema: TSchema;
  permission?: PermissionLike;
  anyPermission?: readonly PermissionLike[];
  permissionBranchId?: (
    data: z.infer<TSchema>,
  ) => number | null | undefined;
};

type DirectActionOptions<TSchema extends z.ZodType> =
  BaseActionOptions<TSchema> & {
    /**
     * When true and the authenticated role is `branch_manager` or `cashier`
     * with `claims.branch_id == null`, reject with `branch_scope_unset`
     * instead of allowing tenant-wide writes. Per m4-payments-fix P1-E:
     * a branch-restricted role with no branch grant must NOT widen to
     * tenant scope. Apply to refund, payment, and any branch-scoped
     * mutating action.
     */
    requireBranchScope?: boolean;
  };

type FormActionOptions<TSchema extends z.ZodType> =
  BaseActionOptions<TSchema> & {
    extract: (fd: FormData) => unknown;
  };

const DEFAULT_VALIDATION_ERROR = "Dữ liệu không hợp lệ";
const FORBIDDEN_ERROR = "Không có quyền";
const BRANCH_SCOPE_UNSET_ERROR = "Tài khoản chưa được gán chi nhánh";

async function resolveActionContext(
  opts: Pick<
    BaseActionOptions<z.ZodType>,
    "roles" | "permission" | "anyPermission"
  >,
  branchId?: number | null,
): Promise<ActionContext | null> {
  if (opts.anyPermission) {
    return getAuthContextWithAnyPermission(
      opts.roles,
      opts.anyPermission,
      branchId,
    );
  }

  if (opts.permission) {
    return getAuthContextWithPermission(opts.roles, opts.permission, branchId);
  }

  return getAuthContext(opts.roles);
}

function actionFailure(error: string): ActionResult {
  return { success: false, error };
}

function validationFailure(message: string | undefined): ActionResult {
  return actionFailure(message ?? DEFAULT_VALIDATION_ERROR);
}

function lacksRequiredBranchScope(ctx: ActionContext): boolean {
  return (
    (ctx.claims.user_role === "branch_manager" ||
      ctx.claims.user_role === "cashier") &&
    ctx.claims.branch_id == null
  );
}

/**
 * Auth + Zod validation wrapper for direct-input server actions.
 *
 * Eliminates repeated boilerplate: schema.safeParse → getAuthContext → null check.
 * Handler receives parsed data + authenticated context.
 *
 * @example
 * export const createArea = withAction(
 *   { roles: AREA_ADMIN_ROLES, schema: createAreaSchema },
 *   async (data, { supabase, claims }) => {
 *     const { error } = await supabase.from("areas").insert({...});
 *     if (error) return { success: false, error: "Không thể tạo khu vực." };
 *     return { success: true };
 *   },
 * );
 */
export function withAction<TSchema extends z.ZodType>(
  opts: DirectActionOptions<TSchema>,
  handler: (
    data: z.infer<TSchema>,
    ctx: ActionContext,
  ) => Promise<ActionResult>,
): (input: z.infer<TSchema>) => Promise<ActionResult> {
  return async (input) => {
    const result = opts.schema.safeParse(input);
    if (!result.success) {
      return validationFailure(result.error.issues[0]?.message);
    }

    const permissionBranchId = opts.permissionBranchId?.(result.data);
    const ctx = await resolveActionContext(opts, permissionBranchId);
    if (!ctx) return actionFailure(FORBIDDEN_ERROR);

    if (opts.requireBranchScope && lacksRequiredBranchScope(ctx)) {
      return actionFailure(BRANCH_SCOPE_UNSET_ERROR);
    }

    return handler(result.data, ctx);
  };
}

/**
 * Auth + Zod validation wrapper for FormData server actions (useActionState).
 *
 * Preserves the `(_prev, formData)` signature required by React's useActionState.
 * The `extract` function converts FormData to a plain object for Zod parsing.
 *
 * @example
 * export const createCategory = withFormAction(
 *   {
 *     roles: MENU_MANAGER_ROLES,
 *     schema: createCategorySchema,
 *     extract: (fd) => ({
 *       name: fd.get("name"),
 *       type: fd.get("type"),
 *       sort_order: fd.get("sort_order") || 0,
 *     }),
 *   },
 *   async (data, { supabase, claims }) => {
 *     const { error } = await supabase.from("menu_categories").insert({...});
 *     if (error) return { success: false, error: mapDbError(error.code) };
 *     revalidatePath("/menu");
 *     return { success: true };
 *   },
 * );
 */
export function withFormAction<TSchema extends z.ZodType>(
  opts: FormActionOptions<TSchema>,
  handler: (
    data: z.infer<TSchema>,
    ctx: ActionContext,
  ) => Promise<ActionResult>,
): (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult> {
  return async (_prev, formData) => {
    const raw = opts.extract(formData);
    const result = opts.schema.safeParse(raw);
    if (!result.success) {
      return validationFailure(result.error.issues[0]?.message);
    }

    const permissionBranchId = opts.permissionBranchId?.(result.data);
    const ctx = await resolveActionContext(opts, permissionBranchId);
    if (!ctx) return actionFailure(FORBIDDEN_ERROR);

    return handler(result.data, ctx);
  };
}
