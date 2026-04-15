"use server";

import { z } from "zod";
import { MODULE_ACL } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../../_lib/auth";

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

  const ctx = await getAuthContext(POS_ROLES);
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

  const ctx = await getAuthContext(POS_ROLES);
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
 * Fetch the currently open POS session for a branch.
 * Returns null in data if no open session exists.
 */
export async function fetchActiveSession(
  branchId: number,
): Promise<ActionResult> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContext(POS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (claims.branch_id !== parsedBranchId.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // Get current user to filter sessions by opener
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Phiên đăng nhập hết hạn" };

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
    .eq("opened_by", user.id)
    .maybeSingle();

  if (error) {
    return {
      success: false,
      error: "Không thể tải thông tin ca. Vui lòng thử lại.",
    };
  }

  return { success: true, data: session };
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

  const ctx = await getAuthContext(POS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

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

  const ctx = await getAuthContext(POS_ROLES);
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
