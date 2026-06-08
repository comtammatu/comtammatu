"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { canAccessBranch } from "@/_lib/branch-scope";
import { logAudit } from "@/_lib/audit";
import { cashEntrySchema } from "./_lib/cash-book";

// Sổ quỹ is an owner/manager back-office tool. The real per-branch gate is
// the permission key (RLS: finance:view to read, finance:expense_create to
// write); the role list is a coarse defence-in-depth filter. Add "staff" here
// later if cashiers should record petty cash directly.
const CASH_BOOK_VIEW_ROLES: readonly StaffRole[] = ["owner", "manager"];
const CASH_BOOK_WRITE_ROLES: readonly StaffRole[] = ["owner", "manager"];

/** Ghi một khoản thu/chi vào sổ quỹ (append-only). */
export async function createCashEntry(
  input: z.infer<typeof cashEntrySchema>,
): Promise<ActionResult> {
  const parsed = cashEntrySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  // Branch-scoped permission check: has_permission(branchId, finance:expense_create).
  const ctx = await getAuthContextWithPermission(
    CASH_BOOK_WRITE_ROLES,
    PERMISSION_KEYS.FINANCE_EXPENSE_CREATE,
    parsed.data.branchId,
  );
  if (!ctx) return { success: false, error: "Không có quyền ghi sổ quỹ." };

  const { supabase, claims, user } = ctx;

  if (!(await canAccessBranch(supabase, claims, parsed.data.branchId))) {
    return {
      success: false,
      error: "Không có quyền ghi sổ quỹ cho chi nhánh này.",
    };
  }

  const insertRow: {
    tenant_id: number;
    branch_id: number;
    direction: string;
    category: string;
    amount: number;
    note: string | null;
    created_by: string;
    entry_date?: string;
  } = {
    tenant_id: claims.tenant_id,
    branch_id: parsed.data.branchId,
    direction: parsed.data.direction,
    category: parsed.data.category,
    amount: Number(parsed.data.amount),
    note: parsed.data.note?.trim() || null,
    created_by: user.id,
  };
  // Let the DB default (today, Asia/Ho_Chi_Minh) apply when no date is given.
  if (parsed.data.entryDate) insertRow.entry_date = parsed.data.entryDate;

  const { data, error } = await supabase
    .from("cash_entries")
    .insert(insertRow)
    .select("id")
    .single();

  if (error) {
    return { success: false, error: "Không thể ghi sổ quỹ." };
  }

  await logAudit(supabase, {
    action: "create",
    entityType: "cash_entry",
    entityId: data?.id ?? null,
    newData: {
      direction: parsed.data.direction,
      category: parsed.data.category,
      amount: Number(parsed.data.amount),
    },
  });

  return { success: true, data };
}

/** Danh sách khoản thu/chi trong khoảng ngày (RLS lọc theo finance:view). */
export async function fetchCashEntries(
  branchId: number | null,
  startDate: string,
  endDate: string,
): Promise<ActionResult> {
  const parsedBranch = z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const parsedStart = z.string().date().safeParse(startDate);
  const parsedEnd = z.string().date().safeParse(endDate);
  if (!parsedStart.success || !parsedEnd.success) {
    return { success: false, error: "Ngày không hợp lệ (YYYY-MM-DD)" };
  }

  const ctx = await getAuthContextWithPermission(
    CASH_BOOK_VIEW_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  let query = supabase
    .from("cash_entries")
    .select("id, entry_date, direction, category, amount, note, created_at")
    .eq("tenant_id", claims.tenant_id)
    .gte("entry_date", parsedStart.data)
    .lte("entry_date", parsedEnd.data)
    .order("entry_date", { ascending: false })
    .order("id", { ascending: false });

  if (parsedBranch.data) {
    query = query.eq("branch_id", parsedBranch.data);
  }

  const { data, error } = await query;

  if (error) {
    return { success: false, error: "Không thể tải sổ quỹ." };
  }

  return { success: true, data: data ?? [] };
}
