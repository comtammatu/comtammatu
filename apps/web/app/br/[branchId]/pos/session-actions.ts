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

  // Per-branch model (Owner D7, 2026-04-27): branch chỉ có 1 ca mở duy
  // nhất → flag mở-ca thuộc branch, không thuộc terminal. UI giờ chỉ
  // dùng list để hiển thị tên máy (audit/preference); việc 1 trong các
  // máy "đang có ca mở" không còn block các máy khác.
  const { data: openSession, error: sessionError } = await supabase
    .from("pos_sessions")
    .select("id")
    .eq("branch_id", parsedBranchId.data)
    .eq("tenant_id", claims.tenant_id)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();

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
 * Trả ca POS đang mở của chi nhánh (bất kỳ ai mở).
 *
 * Per-branch model (Owner D7, 2026-04-27): DB enforce
 * `UNIQUE(branch_id) WHERE status='open'` → tối đa 1 row khớp.
 * Cashier mở → waiter / cashier / branch_manager cùng branch ride session
 * đó. Orders bind `pos_session_id` của ca đó; `orders.created_by` giữ
 * audit "ai ring", `session.opened_by` giữ audit "ai chịu trách nhiệm tiền".
 *
 * Regression guard (rule POS-SESSION-SCOPE-PER-BRANCH): KHÔNG filter
 * `opened_by = user.id` — sẽ chặn waiter (không có `pos:open_cashbox`)
 * khỏi ca cashier đã mở, vỡ luồng take-order.
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
  // terminalId optional sau D7 (2026-04-27): chỉ là metadata audit (máy nào
  // physically mở ca). NULL = ca chung của chi nhánh.
  terminalId: z.coerce
    .number()
    .int()
    .positive({ error: "Terminal ID không hợp lệ" })
    .optional(),
  openingCash: z.coerce.number().min(0, { error: "Tiền mở ca không hợp lệ" }),
});

// Skip withAction: positional (branchId, openingCash, terminalId?) args
export async function openPosSession(
  branchId: number,
  openingCash: number,
  terminalId?: number,
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
      // terminal_id nullable sau D7 — UI mở ca không bắt buộc chọn máy.
      terminal_id: parsedInput.data.terminalId ?? null,
      opened_by: user.id,
      opening_cash: parsedInput.data.openingCash,
    })
    .select("id")
    .single();

  if (error) {
    // Partial unique index violation: branch đã có session đang mở
    // (per-branch invariant từ migration 20260503000000_pos_session_per_branch).
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
}

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
 * D8 (2026-04-27): variance gate retired — close không còn block. RPC chỉ
 * raise các lỗi "thực sự" (session_not_found, session_already_closed, hoặc
 * unknown). UI đọc `meta.code` để tách path; variance breach giờ được
 * server emit qua notifications, không qua exception.
 */
export type CloseSessionErrorCode =
  | "session_not_found"
  | "session_already_closed"
  | "unknown";

export interface CloseSessionErrorPayload {
  code: CloseSessionErrorCode;
}

// Skip withAction: positional (sessionId, closingCash, note?) args
// On failure, `meta` matches CloseSessionErrorPayload (`Record<string, unknown>`
// in the base type — narrowed by callers via meta.code).
//
// D8 (2026-04-27): variance note retired — RPC no longer requires it. UI
// no longer renders the variance approval sub-step. Variance breach now
// emits a notification to managers via trg_notify_pos_shift_variance.
export async function closePosSession(
  sessionId: number,
  closingCash: number,
  note?: string,
): Promise<ActionResult> {
  const parsed = closeSessionSchema.safeParse({
    sessionId,
    closingCash,
    note,
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
    { p_session_id: parsed.data.sessionId },
  );
  let printWarning: string | undefined;
  if (printErr) {
    const m = String(printErr.message ?? "").toLowerCase();
    if (m.includes("permission denied")) {
      printWarning = "Đã chốt ca. Không có quyền in phiếu chốt — báo quản lý.";
    } else if (m.includes("no active") && m.includes("printer")) {
      printWarning =
        "Đã chốt ca. Chi nhánh chưa có máy in hóa đơn — không in được phiếu chốt.";
    } else {
      printWarning = "Đã chốt ca. Không in được phiếu chốt — kiểm tra máy in.";
    }
  } else {
    const skipReason = (printRes as { skipped?: boolean; reason?: string } | null)
      ?.skipped
      ? (printRes as { reason?: string }).reason
      : undefined;
    if (skipReason === "no_printer") {
      printWarning = "Đã chốt ca. Máy in offline — không in được phiếu chốt.";
    }
  }

  return {
    success: true,
    data: { ...(data as Record<string, unknown>), print_warning: printWarning },
  };
}
