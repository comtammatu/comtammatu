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

  const ctx = await getAuthContextWithPermission(POS_ROLES, PERMISSION_KEYS.POS_USE);
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

  const ctx = await getAuthContextWithPermission(POS_ROLES, PERMISSION_KEYS.POS_USE);
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
 * Defer: branch có nhiều terminal mở song song → cần picker UX. MVP lấy ca
 * latest-opened (ORDER BY opened_at DESC LIMIT 1) để deterministic.
 *
 * Regression guard: KHÔNG thêm filter `opened_by = user.id` — sẽ chặn waiter
 * (không có `pos:open_cashbox`) khỏi ca cashier đã mở, vỡ luồng take-order.
 */
export async function fetchActiveSession(
  branchId: number,
): Promise<ActionResult> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(POS_ROLES, PERMISSION_KEYS.POS_USE);
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

/* ─── fetchPosPermissionFlags ─── */

/**
 * Lấy cờ quyền thao tác POS của user trên chi nhánh (1 call, 3 RPC song song).
 *
 * - `canOpenShift` (`pos:open_cashbox`): gate render SessionGate ở page-level.
 *   Waiter (chỉ có `pos:use`) không mở ca được → hiện màn "liên hệ thu ngân".
 * - `canCloseShift` (`pos:close_shift`): gate nút "Chốt ca" ở header. Waiter
 *   ride cashier's session nhưng KHÔNG được thấy nút đóng ca.
 * - `canConfirmCash` (`pos:confirm_payment`): gate phương thức "Tiền mặt" trên
 *   bill — cash chạm két vật lý → chỉ cashier/branch_manager+. Waiter vẫn
 *   thấy/chọn VietQR/MoMo (e-wallet không chạm cash drawer).
 *
 * Defense in depth: server-side RPC vẫn reject bất kỳ bypass UI nào.
 */
export async function fetchPosPermissionFlags(branchId: number): Promise<{
  canOpenShift: boolean;
  canCloseShift: boolean;
  canConfirmCash: boolean;
}> {
  const deny = {
    canOpenShift: false,
    canCloseShift: false,
    canConfirmCash: false,
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
  closingCash: z.coerce
    .number()
    .min(0, { error: "Tiền đóng ca không hợp lệ" }),
  note: z.string().optional(),
});

// Skip withAction: positional (sessionId, closingCash, note?) args
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
    if (error.message?.includes("not found")) {
      return { success: false, error: "Không tìm thấy ca" };
    }
    if (error.message?.includes("not open")) {
      return { success: false, error: "Ca đã được đóng" };
    }
    return {
      success: false,
      error: "Không thể đóng ca. Vui lòng thử lại.",
    };
  }

  return { success: true, data };
}
