"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  MODULE_ACL,
  PERMISSION_KEYS,
} from "@comtammatu/shared/auth";
import { getVNMonthEndDateString } from "@comtammatu/shared/time";
import { withAction } from "@/_lib/with-action";
import { logAudit } from "@/_lib/audit";

const FINANCE_ROLES = MODULE_ACL.finance.allowedRoles;

const periodLaborCostSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  branchId: z.coerce.number().int().positive().nullable().optional(),
});

const postLaborCostSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  paymentMethod: z.enum(["transfer", "unpaid"]).default("transfer"),
});

export interface BranchLaborCostItem {
  branchId: number | null;
  branchName: string;
  employeeCount: number;
  totalGross: number;
  totalEmployerInsurance: number;
  laborCost: number;
  postedExpenseId: number | null;
  isPosted: boolean;
}

export interface PeriodLaborCostSummary {
  hasPayroll: boolean;
  status: string | null;
  totalLaborCost: number;
  totalGross: number;
  totalEmployerInsurance: number;
  branchBreakdown: BranchLaborCostItem[];
  allPosted: boolean;
}

export const fetchPeriodLaborCostAction = withAction(
  {
    roles: FINANCE_ROLES,
    permission: PERMISSION_KEYS.FINANCE_VIEW,
    schema: periodLaborCostSchema,
  },
  async (data, { supabase, claims }): Promise<{ success: true; data: PeriodLaborCostSummary }> => {
    const { data: period } = await supabase
      .from("payroll_periods")
      .select("id, status")
      .eq("tenant_id", claims.tenant_id)
      .eq("period_year", data.year)
      .eq("period_month", data.month)
      .maybeSingle();

    if (!period || (period.status !== "approved" && period.status !== "paid")) {
      return {
        success: true,
        data: {
          hasPayroll: false,
          status: period?.status ?? null,
          totalLaborCost: 0,
          totalGross: 0,
          totalEmployerInsurance: 0,
          branchBreakdown: [],
          allPosted: false,
        },
      };
    }

    // Query entries joined with employees and profiles
    const { data: rawEntries } = await supabase
      .from("payroll_entries")
      .select(`
        id,
        gross_total,
        total_insurance_employer,
        employees!inner (
          id,
          profiles!inner (
            id,
            branch_id
          )
        )
      `)
      .eq("payroll_period_id", period.id)
      .eq("tenant_id", claims.tenant_id);

    // Query active branches to get branch names
    const { data: branches } = await supabase
      .from("branches")
      .select("id, name")
      .eq("tenant_id", claims.tenant_id);

    const branchNameMap = new Map<number, string>();
    for (const b of branches ?? []) {
      branchNameMap.set(b.id, b.name);
    }

    const lastDate = getVNMonthEndDateString(data.year, data.month);
    const noteTag = `[Lương-T${String(data.month).padStart(2, "0")}/${data.year}]`;

    // Query existing posted salary expenses for this month
    const { data: existingExpenses } = await supabase
      .from("expenses")
      .select("id, branch_id, amount, note")
      .eq("tenant_id", claims.tenant_id)
      .eq("category", "salary")
      .eq("expense_date", lastDate)
      .ilike("note", `${noteTag}` + "%");

    const postedExpenseMap = new Map<string, number>();
    for (const exp of existingExpenses ?? []) {
      const key = exp.branch_id != null ? String(exp.branch_id) : "office";
      postedExpenseMap.set(key, exp.id);
    }

    // Group payroll entries by branch
    const branchAccumulator = new Map<
      string,
      {
        branchId: number | null;
        branchName: string;
        employeeCount: number;
        gross: number;
        insurance: number;
      }
    >();

    for (const entry of (rawEntries as unknown as Array<{
      id: number;
      gross_total: number | string;
      total_insurance_employer: number | string;
      employees: {
        id: number;
        profiles: {
          id: string;
          branch_id: number | null;
        };
      };
    }>) ?? []) {
      const bId = entry.employees?.profiles?.branch_id ?? null;
      const key = bId != null ? String(bId) : "office";
      const bName = bId != null ? (branchNameMap.get(bId) ?? `Chi nhánh ${bId}`) : "Văn phòng";

      const current = branchAccumulator.get(key) ?? {
        branchId: bId,
        branchName: bName,
        employeeCount: 0,
        gross: 0,
        insurance: 0,
      };

      current.employeeCount += 1;
      current.gross += Number(entry.gross_total ?? 0);
      current.insurance += Number(entry.total_insurance_employer ?? 0);
      branchAccumulator.set(key, current);
    }

    let totalGross = 0;
    let totalEmployerInsurance = 0;
    let totalLaborCost = 0;
    let allPosted = branchAccumulator.size > 0;

    const branchBreakdown: BranchLaborCostItem[] = [];

    for (const [key, item] of branchAccumulator.entries()) {
      const laborCost = Math.round(item.gross + item.insurance);
      const postedExpenseId = postedExpenseMap.get(key) ?? null;
      const isPosted = postedExpenseId != null;

      if (!isPosted) {
        allPosted = false;
      }

      totalGross += item.gross;
      totalEmployerInsurance += item.insurance;
      totalLaborCost += laborCost;

      branchBreakdown.push({
        branchId: item.branchId,
        branchName: item.branchName,
        employeeCount: item.employeeCount,
        totalGross: Math.round(item.gross),
        totalEmployerInsurance: Math.round(item.insurance),
        laborCost,
        postedExpenseId,
        isPosted,
      });
    }

    return {
      success: true,
      data: {
        hasPayroll: true,
        status: period.status,
        totalLaborCost: Math.round(totalLaborCost),
        totalGross: Math.round(totalGross),
        totalEmployerInsurance: Math.round(totalEmployerInsurance),
        branchBreakdown,
        allPosted,
      },
    };
  },
);

export const postLaborCostToExpensesAction = withAction(
  {
    roles: FINANCE_ROLES,
    permission: PERMISSION_KEYS.FINANCE_EXPENSE_CREATE,
    schema: postLaborCostSchema,
  },
  async (data, { supabase, claims, userId }) => {
    // 1. Fetch current labor cost summary
    const summaryRes = await fetchPeriodLaborCostAction({
      year: data.year,
      month: data.month,
    });

    if (!summaryRes.success || !summaryRes.data || !summaryRes.data.hasPayroll) {
      return {
        success: false,
        error: "Bảng lương tháng này chưa được duyệt hoặc chưa tồn tại.",
      };
    }

    const { branchBreakdown } = summaryRes.data;
    if (branchBreakdown.length === 0) {
      return {
        success: false,
        error: "Không tìm thấy dữ liệu nhân sự để kết chuyển.",
      };
    }

    const lastDate = getVNMonthEndDateString(data.year, data.month);
    const noteTag = `[Lương-T${String(data.month).padStart(2, "0")}/${data.year}]`;
    let postedCount = 0;

    for (const item of branchBreakdown) {
      if (item.laborCost <= 0) continue;

      const note = `${noteTag} ${item.branchName}`;
      const paidAt = data.paymentMethod === "transfer" ? new Date().toISOString() : null;

      if (item.postedExpenseId != null) {
        // Update existing expense row idempotently
        const { error: updateError } = await supabase
          .from("expenses")
          .update({
            amount: item.laborCost,
            subtotal: item.laborCost,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.postedExpenseId)
          .eq("tenant_id", claims.tenant_id);

        if (updateError) {
          console.error(
            "[finance/postLaborCostToExpensesAction] Update expense failed",
            updateError.code,
          );
        } else {
          postedCount++;
        }
      } else {
        // Insert new expense row
        const { data: inserted, error: insertError } = await supabase
          .from("expenses")
          .insert({
            tenant_id: claims.tenant_id,
            branch_id: item.branchId,
            expense_date: lastDate,
            category: "salary",
            amount: item.laborCost,
            subtotal: item.laborCost,
            vat_amount: 0,
            vat_breakdown: [],
            payment_method: data.paymentMethod,
            paid_at: paidAt,
            vendor_name: null,
            note,
            invoice_attachment_url: null,
            created_by: userId,
          })
          .select("id")
          .single();

        if (insertError || !inserted) {
          console.error(
            "[finance/postLaborCostToExpensesAction] Insert expense failed",
            insertError?.code,
          );
        } else {
          postedCount++;
          await logAudit(supabase, {
            action: "finance.post_labor_cost",
            entityType: "expense",
            entityId: inserted.id,
            newData: {
              branchId: item.branchId,
              branchName: item.branchName,
              amount: item.laborCost,
              month: data.month,
              year: data.year,
            },
          });
        }
      }
    }

    revalidatePath("/finance");
    revalidatePath("/finance/expenses");

    return {
      success: true,
      data: { postedCount },
    };
  },
);
