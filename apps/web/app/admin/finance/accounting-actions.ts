"use server";

import { z } from "zod";
import type { StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../_lib/auth";

const FINANCE_ROLES: readonly StaffRole[] = ["owner", "super_manager"];
const REPORT_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
];

/* ─── Chart of Accounts ──────────────────────────────────────────────────── */

export async function fetchChartOfAccounts(): Promise<ActionResult> {
  const ctx = await getAuthContext(FINANCE_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("id, code, name, account_type, parent_id, is_active, created_at")
    .eq("tenant_id", claims.tenant_id)
    .order("code");

  if (error) {
    return { success: false, error: "Không thể tải danh sách tài khoản." };
  }

  return { success: true, data: data ?? [] };
}

const createAccountSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  accountType: z.string().min(1),
  parentId: z.coerce.number().int().positive().optional(),
});

export async function createAccount(
  input: z.infer<typeof createAccountSchema>,
): Promise<ActionResult> {
  const parsed = createAccountSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(FINANCE_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("chart_of_accounts")
    .insert({
      tenant_id: claims.tenant_id,
      account_code: parsed.data.code,
      account_name: parsed.data.name,
      account_type: parsed.data.accountType,
      parent_id: parsed.data.parentId ?? null,
    })
    .select("id, account_code, account_name")
    .single();

  if (error) {
    return { success: false, error: "Không thể tạo tài khoản." };
  }

  return { success: true, data };
}

const updateAccountSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
});

export async function updateAccount(
  input: z.infer<typeof updateAccountSchema>,
): Promise<ActionResult> {
  const parsed = updateAccountSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(FINANCE_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const updatePayload: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updatePayload.name = parsed.data.name;
  if (parsed.data.isActive !== undefined)
    updatePayload.is_active = parsed.data.isActive;

  const { error } = await supabase
    .from("chart_of_accounts")
    .update(updatePayload)
    .eq("id", parsed.data.id)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: "Không thể cập nhật tài khoản." };
  }

  return { success: true };
}

/* ─── Journal Entries ────────────────────────────────────────────────────── */

const fetchJournalEntriesSchema = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

export async function fetchJournalEntries(
  input?: z.infer<typeof fetchJournalEntriesSchema>,
): Promise<ActionResult> {
  const parsed = fetchJournalEntriesSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { success: false, error: "Ngày không hợp lệ (YYYY-MM-DD)" };
  }

  const ctx = await getAuthContext(FINANCE_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  let query = supabase
    .from("journal_entries")
    .select(
      `id, entry_number, entry_date, description, ref_type, ref_id, status, created_at,
       journal_entry_lines(id, account_id, debit, credit, description)`,
    )
    .eq("tenant_id", claims.tenant_id)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (parsed.data.startDate) {
    query = query.gte("entry_date", parsed.data.startDate);
  }
  if (parsed.data.endDate) {
    query = query.lte("entry_date", parsed.data.endDate);
  }

  const { data, error } = await query;

  if (error) {
    return { success: false, error: "Không thể tải danh sách bút toán." };
  }

  return { success: true, data: data ?? [] };
}

const journalLineSchema = z.object({
  accountId: z.coerce.number().int().positive(),
  debit: z.coerce.number().min(0),
  credit: z.coerce.number().min(0),
  description: z.string().max(500).optional(),
});

const createJournalEntrySchema = z.object({
  entryDate: z.string().date(),
  description: z.string().min(1).max(500),
  refType: z.string().max(50).optional(),
  refId: z.coerce.number().int().positive().optional(),
  lines: z.array(journalLineSchema).min(2),
});

export async function createJournalEntry(
  input: z.infer<typeof createJournalEntrySchema>,
): Promise<ActionResult> {
  const parsed = createJournalEntrySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  // Validate balanced: total debit must equal total credit
  const totalDebit = parsed.data.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = parsed.data.lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return {
      success: false,
      error: `Bút toán mất cân đối: tổng nợ (${totalDebit}) ≠ tổng có (${totalCredit})`,
    };
  }

  const ctx = await getAuthContext(FINANCE_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const lines = parsed.data.lines.map((l) => ({
    account_id: l.accountId,
    debit: l.debit,
    credit: l.credit,
    description: l.description ?? null,
  }));

  // RPC create_journal_entry pending migration — cast until db:types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("create_journal_entry", {
    p_tenant_id: claims.tenant_id,
    p_branch_id: claims.branch_id ?? 0,
    p_entry_date: parsed.data.entryDate,
    p_description: parsed.data.description,
    p_ref_type: parsed.data.refType ?? "",
    p_ref_id: parsed.data.refId ?? 0,
    // p_lines type is Json in generated types; cast through unknown for structural compatibility
    p_lines: lines as unknown as string,
  });

  if (error) {
    return { success: false, error: "Không thể tạo bút toán." };
  }

  return { success: true, data: { id: data } };
}

/* ─── Food Cost ──────────────────────────────────────────────────────────── */

const fetchFoodCostSchema = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  branchId: z.coerce.number().int().positive().optional(),
});

export async function fetchFoodCost(
  input?: z.infer<typeof fetchFoodCostSchema>,
): Promise<ActionResult> {
  const parsed = fetchFoodCostSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { success: false, error: "Tham số không hợp lệ" };
  }

  const ctx = await getAuthContext(REPORT_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  let query = supabase
    .from("mv_food_cost")
    .select(
      "date, branch_id, menu_item_id, item_name, qty_sold, revenue, food_cost",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("date", { ascending: false })
    .order("revenue", { ascending: false });

  if (parsed.data.startDate) {
    query = query.gte("date", parsed.data.startDate);
  }
  if (parsed.data.endDate) {
    query = query.lte("date", parsed.data.endDate);
  }
  if (parsed.data.branchId) {
    query = query.eq("branch_id", parsed.data.branchId);
  }

  const { data, error } = await query;

  if (error) {
    return { success: false, error: "Không thể tải dữ liệu food cost." };
  }

  return { success: true, data: data ?? [] };
}

// refreshFoodCostView intentionally omitted — requires pg_cron or superuser
// privilege to run REFRESH MATERIALIZED VIEW CONCURRENTLY. Wire up a Supabase
// scheduled function or pg_cron job instead.
