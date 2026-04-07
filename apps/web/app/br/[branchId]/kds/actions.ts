"use server";

import { z } from "zod";
import { createClient } from "@comtammatu/database/supabase/server";
import { MODULE_ACL } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../../_lib/auth";

/* ─── Constants ─── */

const KDS_ROLES = MODULE_ACL.kds.allowedRoles;

/**
 * Typed wrapper for supabase.from() on KDS tables not yet in generated types.
 * Remove after migrations applied + pnpm db:types.
 */
function fromTable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  return (supabase.from as CallableFunction)(table);
}

/* ─── Input Schemas ─── */

const branchIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Branch ID không hợp lệ" });

const ticketIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Ticket ID không hợp lệ" });

/* ─── fetchKdsTickets ─── */

/**
 * Fetch KDS tickets for a branch, joined with order and item info.
 * Only returns non-served tickets (pending, preparing, ready).
 * Optionally filter by stationId.
 */
export async function fetchKdsTickets(
  branchId: number,
  stationId?: number,
): Promise<ActionResult> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContext(KDS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // Verify branch_id matches JWT claim
  if (claims.branch_id !== parsedBranchId.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // kds_tickets not yet in generated types — remove cast after pnpm db:types
  let query = fromTable(supabase, "kds_tickets")
    .select(
      `
      id,
      station_id,
      order_id,
      order_item_id,
      status,
      bumped_at,
      created_at,
      orders (
        order_number,
        order_type,
        table_id,
        tables (
          number
        )
      ),
      order_items (
        item_name,
        variant_name,
        quantity,
        modifiers,
        sides,
        note
      )
    `,
    )
    .eq("branch_id", parsedBranchId.data)
    .eq("tenant_id", claims.tenant_id)
    .neq("status", "served")
    .order("created_at", { ascending: true });

  // Optionally filter by station
  if (stationId !== undefined) {
    const parsedStationId = z.coerce
      .number()
      .int()
      .positive()
      .safeParse(stationId);
    if (!parsedStationId.success) {
      return { success: false, error: "Station ID không hợp lệ" };
    }
    query = query.eq("station_id", parsedStationId.data);
  }

  const { data: tickets, error } = await query;

  if (error) {
    return {
      success: false,
      error: "Không thể tải danh sách ticket KDS. Vui lòng thử lại.",
    };
  }

  return { success: true, data: tickets ?? [] };
}

/* ─── fetchKdsStations ─── */

/**
 * Fetch active KDS stations for a branch.
 */
export async function fetchKdsStations(
  branchId: number,
): Promise<ActionResult> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContext(KDS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // Verify branch_id matches JWT claim
  if (claims.branch_id !== parsedBranchId.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // kds_stations not yet in generated types — remove cast after pnpm db:types
  const { data: stations, error } = await fromTable(supabase, "kds_stations")
    .select("id, name, position")
    .eq("branch_id", parsedBranchId.data)
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("position", { ascending: true });

  if (error) {
    return {
      success: false,
      error: "Không thể tải danh sách trạm KDS. Vui lòng thử lại.",
    };
  }

  return { success: true, data: stations ?? [] };
}

/* ─── bumpTicket ─── */

/**
 * Bump a KDS ticket to the next status (pending -> preparing -> ready).
 * Uses the bump_kds_ticket RPC which handles status transitions atomically.
 */
export async function bumpTicket(
  ticketId: number,
): Promise<ActionResult<{ status: string }>> {
  const parsedId = ticketIdSchema.safeParse(ticketId);
  if (!parsedId.success) {
    return { success: false, error: "Ticket ID không hợp lệ" };
  }

  const ctx = await getAuthContext(KDS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  const { data, error } = await (supabase.rpc as CallableFunction)(
    "bump_kds_ticket",
    { p_ticket_id: parsedId.data },
  );

  if (error) {
    if (error.message?.includes("not found")) {
      return { success: false, error: "Không tìm thấy ticket" };
    }
    if (error.message?.includes("cannot be bumped")) {
      return { success: false, error: "Ticket không thể chuyển trạng thái" };
    }
    return {
      success: false,
      error: "Không thể cập nhật ticket. Vui lòng thử lại.",
    };
  }

  const newStatus = data as string | null;

  return {
    success: true,
    data: { status: newStatus ?? "unknown" },
  };
}

/* ─── recallTicket ─── */

/**
 * Recall a KDS ticket to the previous status (ready -> preparing -> pending).
 * Uses the recall_kds_ticket RPC which handles status transitions atomically.
 */
export async function recallTicket(
  ticketId: number,
): Promise<ActionResult<{ status: string }>> {
  const parsedId = ticketIdSchema.safeParse(ticketId);
  if (!parsedId.success) {
    return { success: false, error: "Ticket ID không hợp lệ" };
  }

  const ctx = await getAuthContext(KDS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  const { data, error } = await (supabase.rpc as CallableFunction)(
    "recall_kds_ticket",
    { p_ticket_id: parsedId.data },
  );

  if (error) {
    if (error.message?.includes("not found")) {
      return { success: false, error: "Không tìm thấy ticket" };
    }
    if (error.message?.includes("cannot be recalled")) {
      return { success: false, error: "Ticket không thể thu hồi" };
    }
    return {
      success: false,
      error: "Không thể thu hồi ticket. Vui lòng thử lại.",
    };
  }

  const newStatus = data as string | null;

  return {
    success: true,
    data: { status: newStatus ?? "unknown" },
  };
}
