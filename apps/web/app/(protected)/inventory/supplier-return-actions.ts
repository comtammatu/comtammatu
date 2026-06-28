"use server";

import { z } from "zod";
import {
  PERMISSION_KEYS,
  SUPPLIER_RETURN_ROLES,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "./_lib/auth";

const ROLES = SUPPLIER_RETURN_ROLES;

/* ─── fetchSupplierReturns ─── */

export async function fetchSupplierReturns(
  branchId?: number,
): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.SUPPLIER_RETURN_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  let query = supabase
    .from("supplier_returns")
    .select(
      "id, return_number, status, source, reason, resolution, total_value, created_at, confirmed_at, branch_id, supplier_id, grn_id, suppliers ( id, name ), branches ( id, name ), goods_received_notes ( id, grn_number )",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (branchId != null) query = query.eq("branch_id", branchId);

  const { data, error } = await query;

  if (error) {
    return { success: false, error: "Không thể tải phiếu trả hàng NCC." };
  }
  return { success: true, data: data ?? [] };
}

/* ─── fetchSupplierReturnDetail ─── */

export async function fetchSupplierReturnDetail(
  returnId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(returnId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.SUPPLIER_RETURN_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  const { data: header, error: headerErr } = await supabase
    .from("supplier_returns")
    .select(
      "*, suppliers ( id, name ), branches ( id, name ), goods_received_notes ( id, grn_number )",
    )
    .eq("id", id.data)
    .eq("tenant_id", claims.tenant_id)
    .single();
  if (headerErr || !header) {
    return { success: false, error: "Không tìm thấy phiếu trả hàng." };
  }

  const { data: lines, error: linesErr } = await supabase
    .from("supplier_return_items")
    .select("*, ingredients ( id, name, unit, purchase_unit )")
    .eq("return_id", id.data)
    .eq("tenant_id", claims.tenant_id)
    .order("id");
  if (linesErr) {
    return { success: false, error: "Không thể tải dòng phiếu trả hàng." };
  }

  return { success: true, data: { header, lines: lines ?? [] } };
}

