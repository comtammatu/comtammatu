"use server";

import { z } from "zod";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { StaffRole } from "@comtammatu/shared/auth";
import { createServiceClient } from "@comtammatu/database";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  getAuthContext,
  getAuthContextWithPermission,
  probePermission,
} from "../../_lib/auth";
import { withActionPositional } from "@/_lib/with-action";

const POS_ROLES = MODULE_ACL.pos.allowedRoles;
// Opening/closing a shift is an owner-capable operation: the DB already
// authorizes owner (owner short-circuit in `has_permission` + owner holds
// `pos:open_cashbox`/`pos:close_shift` tenant-wide), but `MODULE_ACL.pos`
// omits owner from the operational POS roster. Widen the role gate for the
// two shift actions only so the role check in `getAuthContext` does not
// reject owner before the permission probe runs.
const POS_SHIFT_ROLES: readonly StaffRole[] = [...POS_ROLES, "owner"];
const MENU_LIMIT_ROLES = MODULE_ACL.branch_menu_limits.allowedRoles;

const branchIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Branch ID không hợp lệ" });

/* ─── fetchTablesForBranch ─── */

/**
 * Fetch active tables for a branch (excludes maintenance tables).
 * Used for table selection when order_type = dine_in.
 *
 * Table occupancy is live operational state. Keep this query uncached:
 * a POS terminal can miss past realtime events and needs a fresh cold-load
 * snapshot.
 */
export async function fetchTablesForBranch(
  branchId: number,
): Promise<ActionResult> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { claims } = ctx;

  // Verify branch_id matches JWT claim
  if (claims.branch_id !== parsedBranchId.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const sb = createServiceClient();
  const { data: tables, error } = await sb
    .from("tables")
    .select(
      `
      id,
      number,
      status,
      zone_id,
      branch_zones (
        id,
        name
      )
    `,
    )
    .eq("branch_id", parsedBranchId.data)
    .eq("tenant_id", claims.tenant_id)
    .neq("status", "maintenance")
    .order("number", { ascending: true });

  if (error) {
    return {
      success: false,
      error: "Không thể tải danh sách bàn. Vui lòng thử lại.",
    };
  }

  return { success: true, data: tables ?? [] };
}

/* ─── fetchPosTerminals ─── */

/**
 * Fetch active POS terminals for a branch.
 */
export async function fetchPosTerminals(
  branchId: number,
): Promise<ActionResult> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (claims.branch_id !== parsedBranchId.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // Parallelize: terminal list + open-session probe have no data dependency.
  // Each query is ~80-150ms on the pilot plan; sequencing them stretched the
  // shift-gate page out for no reason. Promise.all collapses to one RTT.
  const [terminalsRes, openSessionRes] = await Promise.all([
    supabase
      .from("pos_terminals")
      .select("id, name, device_id")
      .eq("branch_id", parsedBranchId.data)
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    // Per-branch model (D7): one open session per branch — the open flag
    // belongs to the branch, not the terminal.
    supabase
      .from("pos_sessions")
      .select("id")
      .eq("branch_id", parsedBranchId.data)
      .eq("tenant_id", claims.tenant_id)
      .eq("status", "open")
      .limit(1)
      .maybeSingle(),
  ]);

  const { data: terminals, error } = terminalsRes;
  if (error) {
    return {
      success: false,
      error: "Không thể tải danh sách máy POS. Vui lòng thử lại.",
    };
  }

  const { data: openSession, error: sessionError } = openSessionRes;
  if (sessionError) {
    return {
      success: false,
      error: "Không thể tải trạng thái máy POS. Vui lòng thử lại.",
    };
  }

  const branchHasOpenSession = openSession !== null;

  return {
    success: true,
    data: (terminals ?? []).map((terminal) => ({
      ...terminal,
      // Backward-compat field shape — flag now reflects branch-level state.
      has_open_session: branchHasOpenSession,
    })),
  };
}

/* ─── fetchActiveSession ─── */

/**
 * Returns the branch's open POS session, whoever opened it.
 *
 * Per-branch model (D7): DB enforces `UNIQUE(branch_id) WHERE status='open'`,
 * so at most one row matches. Same-branch staff ride that session; orders bind
 * its `pos_session_id`, `orders.created_by` keeps the ring audit and
 * `session.opened_by` keeps the cash-responsibility audit.
 *
 * Regression guard (POS-SESSION-SCOPE-PER-BRANCH): do NOT filter by
 * `opened_by = user.id` — it locks waiters out of the cashier's session.
 */
export async function fetchActiveSession(
  branchId: number,
): Promise<ActionResult> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (claims.branch_id !== parsedBranchId.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const { data: session, error } = await supabase
    .from("pos_sessions")
    .select(
      `
      id,
      terminal_id,
      opened_by,
      opened_at,
      opening_cash,
      status,
      note,
      pos_terminals (
        id,
        name
      )
    `,
    )
    .eq("branch_id", parsedBranchId.data)
    .eq("tenant_id", claims.tenant_id)
    .eq("status", "open")
    .maybeSingle();

  if (error) {
    return {
      success: false,
      error: "Không thể tải thông tin ca. Vui lòng thử lại.",
    };
  }

  return { success: true, data: session };
}

/* ─── fetchPosPermissionFlags ─── */

/**
 * POS permission flags for the user on a branch (3 RPCs in parallel + 1
 * module-ACL flag).
 *
 * - `canOpenShift` (`pos:open_cashbox`): gates SessionGate at page level.
 * - `canCloseShift` (`pos:close_shift`): gates the close-shift button.
 * - `canConfirmCash` (`pos:confirm_payment`): gates the cash method on the
 *   bill — cash touches the physical drawer; e-wallets stay available.
 * - `canManageMenuLimits` (module ACL `branch_menu_limits`): gates menu
 *   lock/limit controls on POS.
 *
 * Defense in depth: server-side RPCs still reject any UI bypass.
 */
export async function fetchPosPermissionFlags(branchId: number): Promise<{
  canOpenShift: boolean;
  canCloseShift: boolean;
  canConfirmCash: boolean;
  canManageMenuLimits: boolean;
}> {
  const deny = {
    canOpenShift: false,
    canCloseShift: false,
    canConfirmCash: false,
    canManageMenuLimits: false,
  };
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) return deny;

  const ctx = await getAuthContext(POS_ROLES);
  if (!ctx) return deny;
  if (ctx.claims.branch_id !== parsedBranchId.data) return deny;

  const [openRes, closeRes, cashRes] = await Promise.all([
    ctx.supabase.rpc("has_permission", {
      p_branch_id: parsedBranchId.data,
      p_key: PERMISSION_KEYS.POS_OPEN_CASHBOX,
    }),
    ctx.supabase.rpc("has_permission", {
      p_branch_id: parsedBranchId.data,
      p_key: PERMISSION_KEYS.POS_CLOSE_SHIFT,
    }),
    ctx.supabase.rpc("has_permission", {
      p_branch_id: parsedBranchId.data,
      p_key: PERMISSION_KEYS.POS_CONFIRM_PAYMENT,
    }),
  ]);

  return {
    canOpenShift: !openRes.error && openRes.data === true,
    canCloseShift: !closeRes.error && closeRes.data === true,
    canConfirmCash: !cashRes.error && cashRes.data === true,
    canManageMenuLimits: MENU_LIMIT_ROLES.includes(ctx.claims.user_role),
  };
}

/* ─── openPosSession ─── */

const openPosSessionSchema = z.object({
  branchId: branchIdSchema,
  // Optional since D7: audit metadata only (which device opened the shift).
  terminalId: z.coerce
    .number()
    .int()
    .positive({ error: "Terminal ID không hợp lệ" })
    .optional(),
  openingCash: z.coerce.number().min(0, { error: "Tiền mở ca không hợp lệ" }),
});

// Opening a shift writes opening cash → requires cashbox permission,
// symmetric with close (POS_CLOSE_SHIFT) so waiters are blocked on both.
export const openPosSession = withActionPositional(
  {
    argsToInput: (
      branchId: number,
      openingCash: number,
      terminalId?: number,
    ) => ({ branchId, openingCash, terminalId }),
    schema: openPosSessionSchema,
    roles: POS_SHIFT_ROLES,
    permission: PERMISSION_KEYS.POS_OPEN_CASHBOX,
    permissionBranchId: (data) => data.branchId,
    forbiddenError: "Không có quyền mở ca",
  },
  async (
    { branchId, openingCash, terminalId },
    { supabase, claims, user },
  ): Promise<ActionResult<{ session_id: number }>> => {
    // A tenant-wide owner (claims.branch_id === null) is authorized on every
    // branch — skip the branch-mismatch check for that case, mirroring
    // `closePosSession`. Branch-scoped roles still must match their branch.
    if (claims.branch_id !== null && claims.branch_id !== branchId) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    // ctx.user is the JWT-validated user from getAuthContext — no need for a
    // second getUser() HTTP roundtrip. Saves ~150ms on shift-open perceived
    // latency (peer to the auth Promise.all in _lib/auth.ts).

    const { data, error } = await supabase
      .from("pos_sessions")
      .insert({
        tenant_id: claims.tenant_id,
        branch_id: branchId,
        terminal_id: terminalId ?? null,
        opened_by: user.id,
        opening_cash: openingCash,
      })
      .select("id")
      .single();

    if (error) {
      // Partial unique index violation: the branch already has an open
      // session (per-branch invariant, migration 20260503000000).
      if (error.code === "23505") {
        return {
          success: false,
          error:
            "Chi nhánh này đã có ca POS đang mở. Tải lại trang để vào ca hiện tại, hoặc đóng ca cũ trước khi mở ca mới.",
        };
      }
      return {
        success: false,
        error: "Không thể mở ca. Vui lòng thử lại.",
      };
    }

    if (!data) {
      return { success: false, error: "Không thể mở ca. Vui lòng thử lại." };
    }

    return { success: true, data: { session_id: data.id } };
  },
);

/* ─── closePosSession ─── */

const closeSessionSchema = z.object({
  sessionId: z.coerce
    .number()
    .int()
    .positive({ error: "Session ID không hợp lệ" }),
  closingCash: z.coerce.number().min(0, { error: "Tiền đóng ca không hợp lệ" }),
  note: z.string().optional(),
});

/**
 * Variance gate does not block close (D8). The RPC only raises real errors
 * (session_not_found, session_already_closed, unknown); on failure
 * `meta.code` carries one of those sentinels for the UI to branch on, and
 * variance breaches arrive via notifications instead.
 */
export const closePosSession = withActionPositional(
  {
    argsToInput: (sessionId: number, closingCash: number, note?: string) => ({
      sessionId,
      closingCash,
      note,
    }),
    schema: closeSessionSchema,
    roles: POS_SHIFT_ROLES,
    permission: PERMISSION_KEYS.POS_CLOSE_SHIFT,
  },
  async ({ sessionId, closingCash, note }, ctx): Promise<ActionResult> => {
    const { supabase, claims } = ctx;
    const { data: session, error: sessionFetchError } = await supabase
      .from("pos_sessions")
      .select("id, branch_id, status")
      .eq("id", sessionId)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle();

    if (sessionFetchError) {
      return {
        success: false,
        error: "Không thể tải thông tin ca. Vui lòng thử lại.",
        meta: { code: "unknown" },
      };
    }

    if (!session) {
      return {
        success: false,
        error: "Không tìm thấy ca",
        meta: { code: "session_not_found" },
      };
    }

    if (
      (claims.user_role === "branch_manager" ||
        claims.user_role === "cashier") &&
      claims.branch_id == null
    ) {
      return {
        success: false,
        error: "Tài khoản chưa được gán chi nhánh",
        meta: { code: "branch_scope_unset" },
      };
    }

    if (claims.branch_id !== null && session.branch_id !== claims.branch_id) {
      return {
        success: false,
        error: "Không có quyền truy cập chi nhánh này",
        meta: { code: "branch_mismatch" },
      };
    }

    if (
      !(await probePermission(
        ctx,
        PERMISSION_KEYS.POS_CLOSE_SHIFT,
        session.branch_id,
      ))
    ) {
      return {
        success: false,
        error: "Không có quyền đóng ca",
        meta: { code: "no_permission" },
      };
    }

    if (session.status !== "open") {
      return {
        success: false,
        error: "Ca đã được đóng",
        meta: { code: "session_already_closed" },
      };
    }

    const { data, error } = await supabase.rpc("close_pos_session", {
      p_session_id: sessionId,
      p_closing_cash: closingCash,
      p_note: note ?? undefined,
    });

    if (error) {
      const msg = error.message ?? "";

      if (msg.includes("session_not_found")) {
        return {
          success: false,
          error: "Không tìm thấy ca",
          meta: { code: "session_not_found" },
        };
      }

      if (msg.includes("session_already_closed")) {
        return {
          success: false,
          error: "Ca đã được đóng",
          meta: { code: "session_already_closed" },
        };
      }

      return {
        success: false,
        error: "Không thể đóng ca. Vui lòng thử lại.",
        meta: { code: "unknown" },
      };
    }

    // Best-effort shift-close print. Failure must NEVER undo the close —
    // money/audit are already committed in DB. UI surfaces print_warning
    // as a toast and offers re-print later.
    const { data: printRes, error: printErr } = await supabase.rpc(
      "enqueue_shift_close_print",
      { p_session_id: sessionId },
    );
    let printWarning: string | undefined;
    if (printErr) {
      const m = String(printErr.message ?? "").toLowerCase();
      if (m.includes("permission denied")) {
        printWarning =
          "Đã chốt ca. Không có quyền in phiếu chốt — báo quản lý.";
      } else if (m.includes("no active") && m.includes("printer")) {
        printWarning =
          "Đã chốt ca. Chi nhánh chưa có máy in hóa đơn — không in được phiếu chốt.";
      } else {
        printWarning =
          "Đã chốt ca. Không in được phiếu chốt — kiểm tra máy in.";
      }
    } else {
      const skipReason = (
        printRes as { skipped?: boolean; reason?: string } | null
      )?.skipped
        ? (printRes as { reason?: string }).reason
        : undefined;
      if (skipReason === "no_printer") {
        printWarning = "Đã chốt ca. Máy in offline — không in được phiếu chốt.";
      }
    }

    return {
      success: true,
      data: {
        ...(data as Record<string, unknown>),
        print_warning: printWarning,
      },
    };
  },
);
