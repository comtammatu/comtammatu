"use server";

import { z } from "zod";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { getVNDateString, getVNDayUtcRange } from "@comtammatu/shared/time";
import { getAuthContextWithPermission } from "../_lib/auth";

// Mirrors MODULE_ACL.dashboard.allowedRoles: /admin/dashboard is L0 tenant
// command; branch managers use /br/[branchId]/dashboard instead (D017).
const DASHBOARD_ROLES: readonly StaffRole[] = ["owner"];

// Mirrors PrinterStatusBadge: an agent is online when its heartbeat is
// younger than this threshold.
const AGENT_OFFLINE_THRESHOLD_MS = 60_000;

const branchOperatingStatusSchema = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

export interface BranchOperatingRow {
  branchId: number;
  branchName: string;
  todayRevenue: number;
  paidOrders: number;
  posOpenedAt: string | null;
  printerHasAgent: boolean;
  printerOnline: boolean;
  printerFailed24h: number;
}

/**
 * Live per-branch operating status for the L0 tenant command surface:
 * period paid orders/revenue, the open POS session, and print-agent
 * health for every active branch. Read-only; every block fails soft to
 * zeros so one broken source never blanks the dashboard.
 *
 * pos_sessions RLS is keyed on `pos:use`, so that single read goes
 * through the service client with an explicit tenant filter; the action
 * itself is role+permission gated to the dashboard audience.
 */
export async function fetchBranchOperatingStatus(input?: {
  startDate?: string;
  endDate?: string;
}): Promise<BranchOperatingRow[]> {
  const parsed = branchOperatingStatusSchema.safeParse(input ?? {});
  if (!parsed.success) return [];

  const ctx = await getAuthContextWithPermission(
    DASHBOARD_ROLES,
    PERMISSION_KEYS.DASHBOARD_VIEW,
  );
  if (!ctx) return [];

  const { supabase, claims } = ctx;
  const todayDate = getVNDateString();
  const periodStartDate = parsed.data.startDate ?? todayDate;
  const periodEndDate = parsed.data.endDate ?? todayDate;
  const periodStartRange = getVNDayUtcRange(periodStartDate);
  const periodEndRange = getVNDayUtcRange(periodEndDate);
  const failedSinceIso = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();
  const service = createServiceClient();

  const [branchesRes, paymentsRes, agentsRes, failedRes, sessionsRes] =
    await Promise.all([
      supabase
        .from("branches")
        .select("id, name")
        .eq("tenant_id", claims.tenant_id)
        .eq("is_active", true)
        .order("id"),
      supabase
        .from("payments")
        .select("amount, branch_id, orders!inner(status)")
        .eq("tenant_id", claims.tenant_id)
        .eq("status", "completed")
        .not("paid_at", "is", null)
        .neq("orders.status", "cancelled")
        .gte("paid_at", periodStartRange.startIso)
        .lt("paid_at", periodEndRange.endIso),
      supabase.from("printer_agent_status").select("branch_id, last_seen_at"),
      supabase
        .from("print_jobs")
        .select("branch_id")
        .eq("tenant_id", claims.tenant_id)
        .in("status", ["failed", "expired"])
        .gte("created_at", failedSinceIso),
      service
        .from("pos_sessions")
        .select("branch_id, opened_at")
        .eq("tenant_id", claims.tenant_id)
        .eq("status", "open"),
    ]);

  const revenueByBranch = new Map<
    number,
    { revenue: number; orders: number }
  >();
  for (const row of paymentsRes.data ?? []) {
    const entry = revenueByBranch.get(row.branch_id) ?? {
      revenue: 0,
      orders: 0,
    };
    entry.revenue += Number(row.amount);
    entry.orders += 1;
    revenueByBranch.set(row.branch_id, entry);
  }

  const agentByBranch = new Map<number, string | null>();
  for (const row of agentsRes.data ?? []) {
    if (row.branch_id !== null) {
      agentByBranch.set(row.branch_id, row.last_seen_at);
    }
  }

  const failedByBranch = new Map<number, number>();
  for (const row of failedRes.data ?? []) {
    failedByBranch.set(
      row.branch_id,
      (failedByBranch.get(row.branch_id) ?? 0) + 1,
    );
  }

  const sessionByBranch = new Map<number, string>();
  for (const row of sessionsRes.data ?? []) {
    sessionByBranch.set(row.branch_id, row.opened_at);
  }

  return (branchesRes.data ?? []).map((branch) => {
    const sales = revenueByBranch.get(branch.id);
    const lastSeenAt = agentByBranch.get(branch.id) ?? null;
    return {
      branchId: branch.id,
      branchName: branch.name,
      todayRevenue: sales?.revenue ?? 0,
      paidOrders: sales?.orders ?? 0,
      posOpenedAt: sessionByBranch.get(branch.id) ?? null,
      printerHasAgent: lastSeenAt !== null,
      printerOnline:
        lastSeenAt !== null &&
        Date.now() - new Date(lastSeenAt).getTime() <
          AGENT_OFFLINE_THRESHOLD_MS,
      printerFailed24h: failedByBranch.get(branch.id) ?? 0,
    };
  });
}
