"use server";

import { z } from "zod";
import type { StaffRole } from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";

const STATEMENT_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
];

/* ─── Schemas ─── */

const balanceSheetSchema = z.object({
  asOfDate: z.string().date("Ngày không hợp lệ (YYYY-MM-DD)"),
});

const incomeStatementSchema = z.object({
  startDate: z.string().date("Ngày không hợp lệ (YYYY-MM-DD)"),
  endDate: z.string().date("Ngày không hợp lệ (YYYY-MM-DD)"),
});

const vatSummarySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "Kỳ không hợp lệ (YYYY-MM)"),
});

/* ─── Balance Sheet — Bảng Cân Đối Kế Toán ─── */

export const generateBalanceSheet = withAction(
  { roles: STATEMENT_ROLES, schema: balanceSheetSchema },
  async (data, { supabase, claims }) => {
    const { data: postedEntries } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("tenant_id", claims.tenant_id)
      .eq("status", "posted")
      .lte("entry_date", data.asOfDate);

    const postedIds = new Set((postedEntries ?? []).map((e) => e.id));

    const { data: allLines, error: linesErr } = await supabase
      .from("journal_entry_lines")
      .select(
        `
        journal_entry_id,
        account_id,
        debit_amount,
        credit_amount,
        chart_of_accounts ( account_code, account_name, account_type )
      `,
      )
      .eq("tenant_id", claims.tenant_id);

    if (linesErr) {
      return { success: false, error: "Không thể tải dữ liệu chi tiết." };
    }

    const accountMap = new Map<
      number,
      {
        account_code: string;
        account_name: string;
        account_type: string;
        debit_total: number;
        credit_total: number;
      }
    >();

    for (const line of allLines ?? []) {
      if (!postedIds.has(line.journal_entry_id)) continue;

      const acct = line.chart_of_accounts as {
        account_code: string;
        account_name: string;
        account_type: string;
      } | null;
      if (!acct) continue;

      const cur = accountMap.get(line.account_id) ?? {
        account_code: acct.account_code,
        account_name: acct.account_name,
        account_type: acct.account_type,
        debit_total: 0,
        credit_total: 0,
      };
      cur.debit_total += Number(line.debit_amount);
      cur.credit_total += Number(line.credit_amount);
      accountMap.set(line.account_id, cur);
    }

    const accounts = Array.from(accountMap.values());

    const assets = accounts
      .filter((a) => a.account_type === "asset")
      .map((a) => ({ ...a, balance: a.debit_total - a.credit_total }));
    const liabilities = accounts
      .filter((a) => a.account_type === "liability")
      .map((a) => ({ ...a, balance: a.credit_total - a.debit_total }));
    const equity = accounts
      .filter((a) => a.account_type === "equity")
      .map((a) => ({ ...a, balance: a.credit_total - a.debit_total }));

    const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
    const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
    const totalEquity = equity.reduce((s, a) => s + a.balance, 0);

    const revenue = accounts
      .filter((a) => a.account_type === "revenue")
      .reduce((s, a) => s + (a.credit_total - a.debit_total), 0);
    const expenses = accounts
      .filter((a) => a.account_type === "expense")
      .reduce((s, a) => s + (a.debit_total - a.credit_total), 0);
    const retainedEarnings = revenue - expenses;

    return {
      success: true,
      data: {
        asOfDate: data.asOfDate,
        assets,
        liabilities,
        equity,
        totalAssets,
        totalLiabilities,
        totalEquity: totalEquity + retainedEarnings,
        retainedEarnings,
        isBalanced:
          Math.abs(
            totalAssets - (totalLiabilities + totalEquity + retainedEarnings),
          ) < 1,
      },
    };
  },
);

/* ─── Income Statement — Kết Quả Kinh Doanh ─── */

export const generateIncomeStatement = withAction(
  { roles: STATEMENT_ROLES, schema: incomeStatementSchema },
  async (data, { supabase, claims }) => {
    const { data: entries } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("tenant_id", claims.tenant_id)
      .eq("status", "posted")
      .gte("entry_date", data.startDate)
      .lte("entry_date", data.endDate);

    const entryIds = (entries ?? []).map((e) => e.id);

    if (entryIds.length === 0) {
      return {
        success: true,
        data: {
          startDate: data.startDate,
          endDate: data.endDate,
          revenue: [],
          expenses: [],
          totalRevenue: 0,
          totalExpenses: 0,
          netProfit: 0,
        },
      };
    }

    const { data: lines, error } = await supabase
      .from("journal_entry_lines")
      .select(
        `
        journal_entry_id,
        account_id,
        debit_amount,
        credit_amount,
        chart_of_accounts ( account_code, account_name, account_type )
      `,
      )
      .eq("tenant_id", claims.tenant_id)
      .in("journal_entry_id", entryIds);

    if (error) {
      return { success: false, error: "Không thể tải dữ liệu bút toán." };
    }

    const accountMap = new Map<
      number,
      {
        account_code: string;
        account_name: string;
        account_type: string;
        amount: number;
      }
    >();

    for (const line of lines ?? []) {
      const acct = line.chart_of_accounts as {
        account_code: string;
        account_name: string;
        account_type: string;
      } | null;
      if (!acct) continue;
      if (acct.account_type !== "revenue" && acct.account_type !== "expense")
        continue;

      const cur = accountMap.get(line.account_id) ?? {
        account_code: acct.account_code,
        account_name: acct.account_name,
        account_type: acct.account_type,
        amount: 0,
      };

      if (acct.account_type === "revenue") {
        cur.amount += Number(line.credit_amount) - Number(line.debit_amount);
      } else {
        cur.amount += Number(line.debit_amount) - Number(line.credit_amount);
      }
      accountMap.set(line.account_id, cur);
    }

    const all = Array.from(accountMap.values());
    const revenueItems = all.filter((a) => a.account_type === "revenue");
    const expenseItems = all.filter((a) => a.account_type === "expense");
    const totalRevenue = revenueItems.reduce((s, a) => s + a.amount, 0);
    const totalExpenses = expenseItems.reduce((s, a) => s + a.amount, 0);

    return {
      success: true,
      data: {
        startDate: data.startDate,
        endDate: data.endDate,
        revenue: revenueItems,
        expenses: expenseItems,
        totalRevenue,
        totalExpenses,
        netProfit: totalRevenue - totalExpenses,
      },
    };
  },
);

/* ─── VAT Summary — Tổng hợp thuế GTGT ─── */

export const generateVatSummary = withAction(
  { roles: STATEMENT_ROLES, schema: vatSummarySchema },
  async (data, { supabase, claims }) => {
    const [year, month] = data.period.split("-").map(Number);
    const startDate = `${data.period}-01`;
    const endDate = new Date(year!, month!, 0).toISOString().split("T")[0];

    const { data: vatOut } = await supabase
      .from("tax_invoices")
      .select("vat_amount, subtotal, total_amount")
      .eq("tenant_id", claims.tenant_id)
      .eq("status", "issued")
      .gte("issued_at", startDate)
      .lte("issued_at", `${endDate}T23:59:59`);

    const totalVatOut = (vatOut ?? []).reduce(
      (s, r) => s + Number(r.vat_amount),
      0,
    );
    const totalRevenueBeforeVat = (vatOut ?? []).reduce(
      (s, r) => s + Number(r.subtotal),
      0,
    );

    const { data: vatIn } = await supabase
      .from("supplier_invoices")
      .select("vat_amount, subtotal, invoice_date")
      .eq("tenant_id", claims.tenant_id)
      .eq("matching_status", "matched")
      .gte("invoice_date", startDate)
      .lte("invoice_date", `${endDate}T23:59:59`);

    const totalVatIn = (vatIn ?? []).reduce(
      (s, r) => s + Number(r.vat_amount),
      0,
    );
    const totalPurchaseBeforeVat = (vatIn ?? []).reduce(
      (s, r) => s + Number(r.subtotal),
      0,
    );

    return {
      success: true,
      data: {
        period: data.period,
        output: {
          invoiceCount: (vatOut ?? []).length,
          subtotal: totalRevenueBeforeVat,
          vatAmount: totalVatOut,
        },
        input: {
          invoiceCount: (vatIn ?? []).length,
          subtotal: totalPurchaseBeforeVat,
          vatAmount: totalVatIn,
        },
        vatPayable: totalVatOut - totalVatIn,
      },
    };
  },
);
