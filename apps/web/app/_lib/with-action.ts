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

/**
 * Optional escape hatch for actions whose authorization does not fit the
 * standard `roles + permission` shape — e.g. POS void/cancel paths that must
 * gate on `POS_VOID_ROLES × PERMISSION_KEYS.POS_VOID_ORDER`, or refund flows
 * that need a branch-scoped probe before the standard helpers. When supplied,
 * `customAuth` takes precedence over `roles` / `permission` / `anyPermission`
 * — those fields are ignored. `requireBranchScope` is also skipped; if the
 * custom resolver needs the same guard it must implement it itself
 * (canonical helper: `lacksRequiredBranchScope` is intentionally private to
 * this file; copy the predicate inline if needed).
 */
export type CustomAuthResolver<TInput> = (
  input: TInput,
) => Promise<ActionContext | null>;

/**
 * Post-success side-effect hook. Runs after the handler returns
 * `success: true`. Any returned `warning` is merged into `result.meta.warning`
 * — never flips `success` to false. Use for non-fatal downstream RPCs like
 * `enqueue_cancel_ticket_print`: the primary operation is already committed,
 * a print failure must surface as a toast warning, not an error.
 *
 * The hook receives the full `ActionResult` (narrowed to `success: true`)
 * — including `meta`. Handlers that need to pass internal state to their
 * `afterSuccess` hook (e.g. `wasSentToKitchen` so the hook knows whether
 * to enqueue a cancel-ticket print) should set it on `meta` and read it
 * back here. `meta` is typed as `Record<string, unknown>`, so hooks
 * narrow inline (`typeof result.meta?.wasSentToKitchen === "boolean"`).
 */
export type AfterSuccessHook<TInput, TData> = (
  input: TInput,
  result: ActionResult<TData> & { success: true },
  ctx: ActionContext,
) => Promise<{ warning?: string } | void>;

/**
 * Auth-resolver inputs — kept separate from `BaseActionOptions` so the
 * private `resolveActionContext` helper does not have to be generic in
 * `TData`. `TData` appears only inside `AfterSuccessHook`, which is invariant
 * in its second type parameter; threading it through every internal helper
 * caused TS2345 "TData could be instantiated with an arbitrary type" errors.
 */
type AuthOptions<TSchema extends z.ZodType> = {
  schema: TSchema;
  /**
   * Allowed roles for the standard auth path. Required unless `customAuth`
   * is supplied. When `customAuth` is present, `roles` (and the other
   * permission fields) are ignored.
   */
  roles?: readonly StaffRole[];
  permission?: PermissionLike;
  anyPermission?: readonly PermissionLike[];
  permissionBranchId?: (data: z.infer<TSchema>) => number | null | undefined;
  customAuth?: CustomAuthResolver<z.infer<TSchema>>;
};

type BaseActionOptions<
  TSchema extends z.ZodType,
  TData,
> = AuthOptions<TSchema> & {
  afterSuccess?: AfterSuccessHook<z.infer<TSchema>, TData>;
  /**
   * Stable `errorCode` applied to schema-validation failures. Defaults to
   * `undefined` (no code) for backward compatibility. Actions that surface
   * input failures in retry/branch logic (e.g. `submitOrder` using
   * `POS_ERROR_CODES.INPUT_INVALID_CART`) should opt in. The Zod-derived
   * Vietnamese message stays on `result.error`.
   */
  validationErrorCode?: string;
  /**
   * Stable `errorCode` applied when the auth resolver returns `null`
   * (forbidden). Defaults to `undefined`. Actions that need to distinguish
   * forbidden from other failures in retry/branch logic should opt in.
   * Note: the wrapper cannot distinguish "role mismatch" from "permission
   * missing" or "session expired" — they all collapse to this single code.
   * Actions needing finer granularity should bring those checks INTO the
   * handler (which can return its own typed code).
   */
  forbiddenErrorCode?: string;
  /**
   * Custom user-facing message applied when the auth resolver returns `null`
   * (forbidden). Defaults to the shared `FORBIDDEN_ERROR` ("Không có quyền").
   * Opt in only when an action needs denial copy more specific than the
   * generic default — e.g. `openPosSession` → "Không có quyền mở ca". Symmetric
   * with `forbiddenErrorCode`; leaving it unset is identical to prior behavior.
   */
  forbiddenError?: string;
};

type DirectActionOptions<TSchema extends z.ZodType, TData> = BaseActionOptions<
  TSchema,
  TData
> & {
  /**
   * When true and the authenticated role is `branch_manager` or `cashier`
   * with `claims.branch_id == null`, reject with `branch_scope_unset`
   * instead of allowing tenant-wide writes. Per the branch-scope hardening
   * contract: a branch-restricted role with no branch grant must NOT widen
   * to tenant scope. Apply to refund, payment, and any branch-scoped
   * mutating action. Ignored when `customAuth` is used — the custom
   * resolver owns its own scope checks.
   */
  requireBranchScope?: boolean;
};

type FormActionOptions<TSchema extends z.ZodType, TData> = BaseActionOptions<
  TSchema,
  TData
> & {
  extract: (fd: FormData) => unknown;
};

type PositionalActionOptions<
  TSchema extends z.ZodType,
  TArgs extends readonly unknown[],
  TData,
> = DirectActionOptions<TSchema, TData> & {
  /**
   * Adapter from positional arguments to the schema's expected input shape.
   * Lets a Server Action keep a stable positional public signature
   * (`(branchId, cart, idempotencyKey?)`) while internally validating
   * through a single Zod object schema.
   *
   * Caller invokes `someAction(branchId, cart, key)`; the wrapper applies
   * `argsToInput(branchId, cart, key)` to get the raw input, then runs
   * `schema.safeParse` on it before auth + handler.
   */
  argsToInput: (...args: TArgs) => unknown;
};

const DEFAULT_VALIDATION_ERROR = "Dữ liệu không hợp lệ";
const FORBIDDEN_ERROR = "Không có quyền";
const BRANCH_SCOPE_UNSET_ERROR = "Tài khoản chưa được gán chi nhánh";

async function resolveActionContext<TSchema extends z.ZodType>(
  opts: AuthOptions<TSchema>,
  data: z.infer<TSchema>,
): Promise<ActionContext | null> {
  if (opts.customAuth) {
    return opts.customAuth(data);
  }

  if (!opts.roles) {
    // Compile-time mistake: caller forgot both `roles` and `customAuth`.
    // Fail closed rather than allowing a wide-open action.
    return null;
  }

  const branchId = opts.permissionBranchId?.(data);

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

function actionFailure<TData = unknown>(
  error: string,
  errorCode?: string,
): ActionResult<TData> {
  if (errorCode === undefined) return { success: false, error };
  return { success: false, error, errorCode };
}

function validationFailure<TData = unknown>(
  message: string | undefined,
  errorCode?: string,
): ActionResult<TData> {
  return actionFailure<TData>(message ?? DEFAULT_VALIDATION_ERROR, errorCode);
}

function lacksRequiredBranchScope(ctx: ActionContext): boolean {
  return (
    (ctx.claims.user_role === "branch_manager" ||
      ctx.claims.user_role === "cashier") &&
    ctx.claims.branch_id == null
  );
}

/**
 * Merge a non-fatal `afterSuccess` warning into the result without flipping
 * the success flag. Existing `meta` is preserved; if both the handler and
 * the hook set a warning, the hook's value wins (the hook ran later and saw
 * the actual state). Accepts any `ActionResult` shape — callers guard
 * `success` before invoking this so the merge is a no-op on the failure
 * branch.
 */
function mergeWarning<TData>(
  result: ActionResult<TData>,
  warning: string | undefined,
): ActionResult<TData> {
  if (!warning) return result;
  return {
    ...result,
    meta: {
      ...(result.meta ?? {}),
      warning,
    },
  };
}

async function runAfterSuccess<TInput, TData>(
  hook: AfterSuccessHook<TInput, TData> | undefined,
  data: TInput,
  result: ActionResult<TData>,
  ctx: ActionContext,
): Promise<ActionResult<TData>> {
  if (!hook || !result.success) return result;
  // Narrow to the success shape for the hook contract. The runtime check
  // above guarantees `success === true`; the cast restores the type info
  // that the boolean check cannot propagate across the function call.
  const hookResult = await hook(
    data,
    result as ActionResult<TData> & { success: true },
    ctx,
  );
  return mergeWarning(result, hookResult?.warning);
}

/**
 * Auth + Zod validation wrapper for direct-input server actions.
 *
 * Eliminates repeated boilerplate: schema.safeParse → getAuthContext → null
 * check → handler call. Handler receives parsed data + authenticated
 * context. `customAuth` swaps the auth resolver wholesale; `afterSuccess`
 * runs a non-fatal hook after a successful handler return.
 *
 * @example Standard:
 *   export const createArea = withAction(
 *     { roles: AREA_ADMIN_ROLES, schema: createAreaSchema },
 *     async (data, { supabase, claims }) => {
 *       const { error } = await supabase.from("areas").insert({...});
 *       if (error) return { success: false, error: "Không thể tạo khu vực." };
 *       return { success: true };
 *     },
 *   );
 *
 * @example Custom auth + afterSuccess (POS void pattern — see WS-1a):
 *   export const voidOrderItem = withActionPositional(
 *     {
 *       argsToInput: (orderItemId, reason) => ({ orderItemId, reason }),
 *       schema: voidItemSchema,
 *       customAuth: posVoidAuth,
 *       afterSuccess: enqueueCancelTicketPrintIfSentToKitchen,
 *     },
 *     async (data, ctx) => { ... },
 *   );
 */
export function withAction<TSchema extends z.ZodType, TData = unknown>(
  opts: DirectActionOptions<TSchema, TData>,
  handler: (
    data: z.infer<TSchema>,
    ctx: ActionContext,
  ) => Promise<ActionResult<TData>>,
): (input: z.infer<TSchema>) => Promise<ActionResult<TData>> {
  return async (input) => {
    const result = opts.schema.safeParse(input);
    if (!result.success) {
      return validationFailure<TData>(
        result.error.issues[0]?.message,
        opts.validationErrorCode,
      );
    }

    const ctx = await resolveActionContext(opts, result.data);
    if (!ctx) {
      return actionFailure<TData>(
        opts.forbiddenError ?? FORBIDDEN_ERROR,
        opts.forbiddenErrorCode,
      );
    }

    if (
      opts.requireBranchScope &&
      !opts.customAuth &&
      lacksRequiredBranchScope(ctx)
    ) {
      return actionFailure<TData>(
        BRANCH_SCOPE_UNSET_ERROR,
        opts.forbiddenErrorCode,
      );
    }

    const handlerResult = await handler(result.data, ctx);
    return runAfterSuccess(opts.afterSuccess, result.data, handlerResult, ctx);
  };
}

/**
 * Variant of `withAction` for Server Actions that expose a positional public
 * signature — `(branchId, cart, idempotencyKey?)` — instead of a single
 * object argument. Internally the same machinery: positional args are mapped
 * to the schema's input via `argsToInput`, then validated, authed, and
 * handled identically to `withAction`.
 *
 * The public function returned by this wrapper takes the same positional
 * args, in the same order, as the caller-facing API. Existing call sites do
 * not need to change.
 *
 * Use this when the caller cannot adopt object-input (e.g. React form
 * actions wired through `<form action={fn}>`, or legacy positional APIs the
 * client already calls in many places).
 */
export function withActionPositional<
  TSchema extends z.ZodType,
  TArgs extends readonly unknown[],
  TData = unknown,
>(
  opts: PositionalActionOptions<TSchema, TArgs, TData>,
  handler: (
    data: z.infer<TSchema>,
    ctx: ActionContext,
  ) => Promise<ActionResult<TData>>,
): (...args: TArgs) => Promise<ActionResult<TData>> {
  return async (...args) => {
    const raw = opts.argsToInput(...args);
    const result = opts.schema.safeParse(raw);
    if (!result.success) {
      return validationFailure<TData>(
        result.error.issues[0]?.message,
        opts.validationErrorCode,
      );
    }

    const ctx = await resolveActionContext(opts, result.data);
    if (!ctx) {
      return actionFailure<TData>(
        opts.forbiddenError ?? FORBIDDEN_ERROR,
        opts.forbiddenErrorCode,
      );
    }

    if (
      opts.requireBranchScope &&
      !opts.customAuth &&
      lacksRequiredBranchScope(ctx)
    ) {
      return actionFailure<TData>(
        BRANCH_SCOPE_UNSET_ERROR,
        opts.forbiddenErrorCode,
      );
    }

    const handlerResult = await handler(result.data, ctx);
    return runAfterSuccess(opts.afterSuccess, result.data, handlerResult, ctx);
  };
}

/**
 * Auth + Zod validation wrapper for FormData server actions (useActionState).
 *
 * Preserves the `(_prev, formData)` signature required by React's
 * useActionState. The `extract` function converts FormData to a plain
 * object for Zod parsing. Supports `customAuth` and `afterSuccess` the same
 * way as `withAction`.
 *
 * @example
 *   export const createCategory = withFormAction(
 *     {
 *       roles: MENU_MANAGER_ROLES,
 *       schema: createCategorySchema,
 *       extract: (fd) => ({
 *         name: fd.get("name"),
 *         type: fd.get("type"),
 *         sort_order: fd.get("sort_order") || 0,
 *       }),
 *     },
 *     async (data, { supabase, claims }) => {
 *       const { error } = await supabase.from("menu_categories").insert({...});
 *       if (error) return { success: false, error: mapDbError(error.code) };
 *       revalidatePath("/menu");
 *       return { success: true };
 *     },
 *   );
 */
export function withFormAction<TSchema extends z.ZodType, TData = unknown>(
  opts: FormActionOptions<TSchema, TData>,
  handler: (
    data: z.infer<TSchema>,
    ctx: ActionContext,
  ) => Promise<ActionResult<TData>>,
): (
  prev: ActionResult<TData> | null,
  formData: FormData,
) => Promise<ActionResult<TData>> {
  return async (_prev, formData) => {
    const raw = opts.extract(formData);
    const result = opts.schema.safeParse(raw);
    if (!result.success) {
      return validationFailure<TData>(
        result.error.issues[0]?.message,
        opts.validationErrorCode,
      );
    }

    const ctx = await resolveActionContext(opts, result.data);
    if (!ctx) {
      return actionFailure<TData>(
        opts.forbiddenError ?? FORBIDDEN_ERROR,
        opts.forbiddenErrorCode,
      );
    }

    const handlerResult = await handler(result.data, ctx);
    return runAfterSuccess(opts.afterSuccess, result.data, handlerResult, ctx);
  };
}
