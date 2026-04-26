"use server";

import { z } from "zod";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext, getAuthContextWithPermission } from "../../_lib/auth";

const POS_ROLES = MODULE_ACL.pos.allowedRoles;

const branchIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Branch ID không hợp lệ" });

/* ─── fetchTablesForBranch ─── */

/**
 * Fetch active tables for a branch (excludes maintenance tables).
 * Used for table selection when order_type = dine_in.
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

  const { supabase, claims } = ctx;

  // Verify branch_id matches JWT claim
  if (claims.branch_id !== parsedBranchId.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const { data: tables, error } = await supabase
    .from("tables")
    .select(
      `
      id,
      number,
      capacity,
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

  const { data: terminals, error } = await supabase
    .from("pos_terminals")
    .select("id, name, device_id")
    .eq("branch_id", parsedBranchId.data)
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    return {
      success: false,
      error: "Không thể tải danh sách máy POS. Vui lòng thử lại.",
    };
  }

  const terminalIds = (terminals ?? []).map((terminal) => terminal.id);

  if (terminalIds.length === 0) {
    return { success: true, data: [] };
  }

  const { data: openSessions, error: sessionError } = await supabase
    .from("pos_sessions")
    .select("terminal_id")
    .eq("branch_id", parsedBranchId.data)
    .eq("tenant_id", claims.tenant_id)
    .eq("status", "open")
    .in("terminal_id", terminalIds);

  if (sessionError) {
    return {
      success: false,
      error: "Không thể tải trạng thái máy POS. Vui lòng thử lại.",
    };
  }

  const occupiedTerminalIds = new Set(
    (openSessions ?? []).map((session) => session.terminal_id),
  );

  return {
    success: true,
    data: (terminals ?? []).map((terminal) => ({
      ...terminal,
      has_open_session: occupiedTerminalIds.has(terminal.id),
    })),
  };
}

/* ─── fetchActiveSession ─── */

/**
 * Trả ca POS đang mở của chi nhánh (bất kỳ ai mở).
 *
 * Semantic: session là per-terminal (DB enforce `UNIQUE(terminal_id) WHERE status='open'`).
 * Cashier mở → waiter/cashier/branch_manager cùng ride. Orders bind `pos_session_id`
 * của ca đó; `orders.created_by` giữ audit "ai ring", `session.opened_by` giữ
 * audit "ai chịu trách nhiệm tiền".
 *
 * `terminalId` (optional): khi caller chuyên biệt 1 máy (ví dụ URL ?terminal=X
 * sau khi user pick từ MultiSessionPicker), filter về session của terminal đó.
 * Khi không truyền, fallback latest-opened — preserve legacy behavior cho
 * single-terminal branches mà không cần URL param.
 *
 * Regression guard: KHÔNG thêm filter `opened_by = user.id` — sẽ chặn waiter
 * (không có `pos:open_cashbox`) khỏi ca cashier đã mở, vỡ luồng take-order.
 */
export async function fetchActiveSession(
  branchId: number,
  terminalId?: number,
): Promise<ActionResult> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  let parsedTerminalId: number | undefined;
  if (terminalId !== undefined) {
    const result = z.coerce
      .number()
      .int()
      .positive({ error: "Terminal ID không hợp lệ" })
      .safeParse(terminalId);
    if (!result.success) {
      return { success: false, error: "Terminal ID không hợp lệ" };
    }
    parsedTerminalId = result.data;
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

  let query = supabase
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
    .eq("status", "open");

  if (parsedTerminalId !== undefined) {
    query = query.eq("terminal_id", parsedTerminalId);
  }

  const { data: session, error } = await query
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      success: false,
      error: "Không thể tải thông tin ca. Vui lòng thử lại.",
    };
  }

  return { success: true, data: session };
}

/* ─── fetchActiveSessionsForBranch ─── */

/**
 * Trả TẤT CẢ ca POS đang mở của chi nhánh — phục vụ multi-terminal disambiguation.
 *
 * Khi branch có 2+ terminal cùng mở, page-level orchestration cần biết để
 * render `MultiSessionPicker` cho cashier chọn terminal họ đang dùng. Sau
 * khi pick, URL được stamp `?terminal=X`; lần load tiếp theo gọi thẳng
 * `fetchActiveSession(branchId, terminalId)` thay vì list này.
 *
 * Sort by opened_at desc để picker hiển thị ca mới nhất trước (UX bias).
 */
export async function fetchActiveSessionsForBranch(
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

  const { data: sessions, error } = await supabase
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
    .order("opened_at", { ascending: false });

  if (error) {
    return {
      success: false,
      error: "Không thể tải danh sách ca. Vui lòng thử lại.",
    };
  }

  return { success: true, data: sessions ?? [] };
}

/* ─── fetchPosPermissionFlags ─── */

/**
 * Lấy cờ quyền thao tác POS của user trên chi nhánh (1 call, 4 RPC song song).
 *
 * - `canOpenShift` (`pos:open_cashbox`): gate render SessionGate ở page-level.
 *   Waiter (chỉ có `pos:use`) không mở ca được → hiện màn "liên hệ thu ngân".
 * - `canCloseShift` (`pos:close_shift`): gate nút "Chốt ca" ở header. Waiter
 *   ride cashier's session nhưng KHÔNG được thấy nút đóng ca.
 * - `canConfirmCash` (`pos:confirm_payment`): gate phương thức "Tiền mặt" trên
 *   bill — cash chạm két vật lý → chỉ cashier/branch_manager+. Waiter vẫn
 *   thấy/chọn VietQR/MoMo (e-wallet không chạm cash drawer).
 * - `canOverrideVariance` (`pos:close_shift_variance_override`): gate hiện
 *   ô nhập "Lý do chênh lệch" + cho phép submit khi |diff| > threshold.
 *   Cashier KHÔNG có quyền này → variance vượt ngưỡng → BM phải đăng nhập
 *   để close (decision D3, 2026-04-26).
 *
 * Defense in depth: server-side RPC vẫn reject bất kỳ bypass UI nào.
 */
export async function fetchPosPermissionFlags(branchId: number): Promise<{
  canOpenShift: boolean;
  canCloseShift: boolean;
  canConfirmCash: boolean;
  canOverrideVariance: boolean;
}> {
  const deny = {
    canOpenShift: false,
    canCloseShift: false,
    canConfirmCash: false,
    canOverrideVariance: false,
  };
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) return deny;

  const ctx = await getAuthContext(POS_ROLES);
  if (!ctx) return deny;
  if (ctx.claims.branch_id !== parsedBranchId.data) return deny;

  const [openRes, closeRes, cashRes, varianceRes] = await Promise.all([
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
    ctx.supabase.rpc("has_permission", {
      p_branch_id: parsedBranchId.data,
      p_key: PERMISSION_KEYS.POS_CLOSE_SHIFT_VARIANCE_OVERRIDE,
    }),
  ]);

  return {
    canOpenShift: !openRes.error && openRes.data === true,
    canCloseShift: !closeRes.error && closeRes.data === true,
    canConfirmCash: !cashRes.error && cashRes.data === true,
    canOverrideVariance:
      !varianceRes.error && varianceRes.data === true,
  };
}

/* ─── openPosSession ─── */

const openSessionSchema = z.object({
  terminalId: z.coerce.number().int().positive({ error: "Chọn máy POS" }),
  openingCash: z.coerce.number().min(0, { error: "Tiền mở ca không hợp lệ" }),
});

// Skip withAction: positional (branchId, terminalId, openingCash) args
export async function openPosSession(
  branchId: number,
  terminalId: number,
  openingCash: number,
): Promise<ActionResult<{ session_id: number }>> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const parsedInput = openSessionSchema.safeParse({ terminalId, openingCash });
  if (!parsedInput.success) {
    return {
      success: false,
      error: parsedInput.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  // Mở ca = ghi tiền đầu ca → yêu cầu quyền thao tác két (cashier / branch_manager).
  // Bất đối xứng với close (POS_CLOSE_SHIFT) đã có — đồng bộ để chặn waiter.
  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_OPEN_CASHBOX,
    parsedBranchId.data,
  );
  if (!ctx) return { success: false, error: "Không có quyền mở ca" };

  const { supabase, claims } = ctx;

  if (claims.branch_id !== parsedBranchId.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Phiên đăng nhập hết hạn" };

  const { data, error } = await supabase
    .from("pos_sessions")
    .insert({
      tenant_id: claims.tenant_id,
      branch_id: parsedBranchId.data,
      terminal_id: parsedInput.data.terminalId,
      opened_by: user.id,
      opening_cash: parsedInput.data.openingCash,
    })
    .select("id")
    .single();

  if (error) {
    // Partial unique index violation: terminal already has an open session
    if (error.code === "23505") {
      return {
        success: false,
        error: "Máy POS này đã có ca đang mở. Vui lòng đóng ca trước.",
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
}

/* ─── closePosSession ─── */

const closeSessionSchema = z.object({
  sessionId: z.coerce
    .number()
    .int()
    .positive({ error: "Session ID không hợp lệ" }),
  closingCash: z.coerce.number().min(0, { error: "Tiền đóng ca không hợp lệ" }),
  note: z.string().optional(),
  varianceNote: z.string().optional(),
});

/**
 * Sentinel error codes used by the close-session UI to switch into the
 * variance-approval sub-flow without re-fetching the summary.
 */
export type CloseSessionErrorCode =
  | "variance_requires_bm_approval"
  | "variance_note_required"
  | "session_not_found"
  | "session_already_closed"
  | "unknown";

export interface CloseSessionErrorPayload {
  code: CloseSessionErrorCode;
  /** Variance VND emitted by RPC when threshold breached; null otherwise. */
  diff?: number;
  /** Threshold VND emitted by RPC when threshold breached; null otherwise. */
  threshold?: number;
}

function parseVarianceContext(message: string | undefined): {
  diff?: number;
  threshold?: number;
} {
  if (!message) return {};
  const m = /diff=(-?[\d.]+),\s*threshold=([\d.]+)/.exec(message);
  if (!m) return {};
  const diff = Number(m[1]);
  const threshold = Number(m[2]);
  return {
    diff: Number.isFinite(diff) ? diff : undefined,
    threshold: Number.isFinite(threshold) ? threshold : undefined,
  };
}

// Skip withAction: positional (sessionId, closingCash, note?, varianceNote?) args
// On failure, `meta` matches CloseSessionErrorPayload (`Record<string, unknown>`
// in the base type — narrowed by callers via meta.code).
export async function closePosSession(
  sessionId: number,
  closingCash: number,
  note?: string,
  varianceNote?: string,
): Promise<ActionResult> {
  const parsed = closeSessionSchema.safeParse({
    sessionId,
    closingCash,
    note,
    varianceNote,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_CLOSE_SHIFT,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("close_pos_session", {
    p_session_id: parsed.data.sessionId,
    p_closing_cash: parsed.data.closingCash,
    p_note: parsed.data.note ?? undefined,
    p_variance_note: parsed.data.varianceNote ?? undefined,
  });

  if (error) {
    const msg = error.message ?? "";

    if (msg.includes("variance_requires_bm_approval")) {
      const ctxMeta = parseVarianceContext(msg);
      return {
        success: false,
        error: "Chênh lệch vượt ngưỡng — cần quản lý chi nhánh đăng nhập để duyệt.",
        meta: { code: "variance_requires_bm_approval", ...ctxMeta },
      };
    }

    if (msg.includes("variance_note_required")) {
      const ctxMeta = parseVarianceContext(msg);
      return {
        success: false,
        error: "Cần nhập lý do chênh lệch ≥ 10 ký tự.",
        meta: { code: "variance_note_required", ...ctxMeta },
      };
    }

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

  return { success: true, data };
}
