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
  opts: {
    roles: readonly StaffRole[];
    schema: TSchema;
    permission?: PermissionKey | string;
    anyPermission?: readonly (PermissionKey | string)[];
  },
  handler: (
    data: z.infer<TSchema>,
    ctx: ActionContext,
  ) => Promise<ActionResult>,
): (input: z.infer<TSchema>) => Promise<ActionResult> {
  return async (input) => {
    const result = opts.schema.safeParse(input);
    if (!result.success) {
      return {
        success: false,
        error: result.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
      };
    }
    const ctx = opts.anyPermission
      ? await getAuthContextWithAnyPermission(opts.roles, opts.anyPermission)
      : opts.permission
        ? await getAuthContextWithPermission(opts.roles, opts.permission)
        : await getAuthContext(opts.roles);
    if (!ctx) return { success: false, error: "Không có quyền" };
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
  opts: {
    roles: readonly StaffRole[];
    schema: TSchema;
    extract: (fd: FormData) => unknown;
    permission?: PermissionKey | string;
    anyPermission?: readonly (PermissionKey | string)[];
  },
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
      return {
        success: false,
        error: result.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
      };
    }
    const ctx = opts.anyPermission
      ? await getAuthContextWithAnyPermission(opts.roles, opts.anyPermission)
      : opts.permission
        ? await getAuthContextWithPermission(opts.roles, opts.permission)
        : await getAuthContext(opts.roles);
    if (!ctx) return { success: false, error: "Không có quyền" };
    return handler(result.data, ctx);
  };
}
