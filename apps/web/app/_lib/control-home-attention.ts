import {
  canAccess,
  MODULE_ACL,
  PERMISSION_KEYS,
  type ModuleKey,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { formatCount } from "@comtammatu/shared/format";
import { loadAuthState, probePermission } from "@/_lib/auth";
import {
  parseFinanceParams,
  resolveFinanceRange,
} from "@/(protected)/finance/_lib/finance-params";
import { fetchFinanceCockpit } from "@/(protected)/finance/_lib/finance-cockpit";
import {
  countOpenGrns,
  countOpenPurchaseOrders,
  countOpenPurchaseRequests,
  countOpenSupplierInvoices,
} from "@/(protected)/inventory/_lib/receiving-counts";
import { fetchHrAttentionSummary } from "@/(protected)/hr/hr-attention";
import { getUnreadCount } from "@/(protected)/notifications/actions";
import { countPrintJobsNeedingAttention } from "@/_lib/print-attention";
import { countMyWorkTasksDue } from "@/(protected)/work/actions";
import { messages } from "@lib/messages";

export type ControlHomeAttentionItem = {
  id: string;
  moduleKey: ModuleKey;
  label: string;
  count: number;
  href: string;
  tone?: "warning" | "destructive";
};

const copy = messages.controlSurface.dashboard;

async function settledCount(
  promise: Promise<number>,
): Promise<number> {
  try {
    return await promise;
  } catch {
    return 0;
  }
}

async function loadFinanceAttention(
  role: StaffRole,
): Promise<ControlHomeAttentionItem[]> {
  if (!canAccess(role, "finance")) return [];
  try {
    const params = parseFinanceParams({});
    const resolved = resolveFinanceRange(params);
    const cockpit = await fetchFinanceCockpit(params, resolved);
    return cockpit.exceptions
      .filter(
        (item): item is typeof item & { href: string } =>
          item.tone !== "neutral" && item.href != null && item.href.length > 0,
      )
      .map((item, index) => ({
        id: `finance:${index}:${item.href}`,
        moduleKey: "finance" as const,
        label: item.label,
        count: Number.parseInt(item.value.replace(/\D/g, ""), 10) || 1,
        href: item.href,
        tone: item.tone === "destructive" ? "destructive" : "warning",
      }));
  } catch {
    return [];
  }
}

async function loadInventoryAttention(
  role: StaffRole,
): Promise<ControlHomeAttentionItem[]> {
  if (!canAccess(role, "inventory")) return [];
  const [po, grn, ycm, invoices] = await Promise.all([
    settledCount(countOpenPurchaseOrders()),
    settledCount(countOpenGrns()),
    settledCount(countOpenPurchaseRequests()),
    settledCount(countOpenSupplierInvoices()),
  ]);
  const items: ControlHomeAttentionItem[] = [];
  if (po > 0) {
    items.push({
      id: "inventory:po",
      moduleKey: "inventory",
      label: copy.attention.purchaseOrders,
      count: po,
      href: "/inventory/purchase-orders",
      tone: "warning",
    });
  }
  if (grn > 0) {
    items.push({
      id: "inventory:grn",
      moduleKey: "inventory",
      label: copy.attention.grn,
      count: grn,
      href: "/inventory/grn",
      tone: "warning",
    });
  }
  if (ycm > 0) {
    items.push({
      id: "inventory:ycm",
      moduleKey: "inventory",
      label: copy.attention.purchaseRequests,
      count: ycm,
      href: "/inventory/purchase-requests",
      tone: "warning",
    });
  }
  if (invoices > 0 && canAccess(role, "finance")) {
    items.push({
      id: "inventory:supplier-invoices",
      moduleKey: "finance",
      label: copy.attention.supplierInvoices,
      count: invoices,
      href: "/finance/supplier-invoices",
      tone: "warning",
    });
  }
  return items;
}

async function loadHrAttention(
  role: StaffRole,
): Promise<ControlHomeAttentionItem[]> {
  void role;
  const { supabase, claims } = await loadAuthState();
  const canViewHr = await probePermission(
    { supabase, claims },
    PERMISSION_KEYS.HR_VIEW_EMPLOYEE,
    null,
  );
  if (!canViewHr) return [];

  try {
    const summary = await fetchHrAttentionSummary(
      supabase,
      claims.tenant_id,
      "all",
    );
    const items: ControlHomeAttentionItem[] = [];
    if (summary.pendingApprovals > 0) {
      items.push({
        id: "hr:approvals",
        moduleKey: "hr",
        label: copy.attention.hrApprovals,
        count: summary.pendingApprovals,
        href: "/hr/attendance?tab=approvals",
        tone: "warning",
      });
    }
    if (summary.missingContractOrSalary > 0) {
      items.push({
        id: "hr:salary",
        moduleKey: "hr",
        label: copy.attention.hrMissingSalary,
        count: summary.missingContractOrSalary,
        href: "/hr?salary=missing",
        tone: "warning",
      });
    }
    return items;
  } catch {
    return [];
  }
}

async function loadOrdersAttention(
  role: StaffRole,
): Promise<ControlHomeAttentionItem[]> {
  if (!canAccess(role, "orders")) return [];
  try {
    const { supabase, claims } = await loadAuthState();
    const { count, error } = await supabase
      .from("refunds")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("status", "pending");
    if (error || !count) return [];
    return [
      {
        id: "orders:refunds",
        moduleKey: "orders",
        label: copy.attention.pendingRefunds,
        count,
        href: "/orders?tab=refunds",
        tone: "warning",
      },
    ];
  } catch {
    return [];
  }
}

async function loadPrintAttention(
  role: StaffRole,
): Promise<ControlHomeAttentionItem[]> {
  if (!canAccess(role, "settings")) return [];
  const count = await settledCount(countPrintJobsNeedingAttention());
  if (count <= 0) return [];
  return [
    {
      id: "settings:print",
      moduleKey: "settings",
      label: copy.attention.printJobs,
      count,
      href: "/settings/printers/jobs?status=needs_attention",
      tone: "destructive",
    },
  ];
}

async function loadWorkAttention(
  role: StaffRole,
): Promise<ControlHomeAttentionItem[]> {
  if (!canAccess(role, "work")) return [];
  try {
    const result = await countMyWorkTasksDue({});
    if (!result.success || !result.data || result.data.count <= 0) return [];
    return [
      {
        id: "work:mine-due",
        moduleKey: "work",
        label: copy.attention.workMineDue,
        count: result.data.count,
        href: MODULE_ACL.work.path,
        tone: "warning",
      },
    ];
  } catch {
    return [];
  }
}

async function loadNotificationAttention(): Promise<ControlHomeAttentionItem[]> {
  try {
    const result = await getUnreadCount();
    if (!result.success || !result.data || result.data.count <= 0) return [];
    return [
      {
        id: "notifications:unread",
        moduleKey: "notifications",
        label: copy.attention.unreadNotifications,
        count: result.data.count,
        href: MODULE_ACL.notifications.path,
        tone: "warning",
      },
    ];
  } catch {
    return [];
  }
}

/**
 * ACL-gated cross-module attention for Control home (`/`).
 * Soft-fails per bucket so one domain outage does not blank the page.
 */
export async function loadControlHomeAttention(
  role: StaffRole,
): Promise<ControlHomeAttentionItem[]> {
  const results = await Promise.allSettled([
    loadFinanceAttention(role),
    loadInventoryAttention(role),
    loadHrAttention(role),
    loadOrdersAttention(role),
    loadPrintAttention(role),
    loadWorkAttention(role),
    loadNotificationAttention(),
  ]);

  const items: ControlHomeAttentionItem[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") items.push(...result.value);
  }
  return items.filter((item) => item.count > 0);
}

export function formatAttentionCount(count: number): string {
  return formatCount(count);
}
