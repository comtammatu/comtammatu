import {
  canAccess,
  MODULE_ACL,
  PERMISSION_KEYS,
  type ModuleKey,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { getVNDateString, getVNDayUtcRange } from "@comtammatu/shared/time";
import { loadAuthState, probePermission } from "@/_lib/auth";
import {
  parseFinanceParams,
  resolveFinanceRange,
} from "@/(protected)/finance/_lib/finance-params";
import { fetchFinanceAttentionExceptions } from "@/(protected)/finance/_lib/finance-cockpit";
import {
  countOpenPurchaseOrders,
  countOpenSupplierInvoices,
  listOpenGrnsForAttention,
} from "@/(protected)/inventory/_lib/receiving-counts";
import { listMyWorkTasks } from "@/(protected)/work/actions";
import { fetchHrAttentionSummary } from "@/(protected)/hr/hr-attention";
import { getUnreadCount } from "@/(protected)/notifications/actions";
import { countPrintJobsNeedingAttention } from "@/_lib/print-attention";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { messages } from "@lib/messages";

export type ControlHomeAttentionItem = {
  id: string;
  moduleKey: ModuleKey;
  label: string;
  count: number;
  href: string;
  tone?: "warning" | "destructive";
  documentTitle?: string;
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
  if (!(await currentUserHasPermissionAny(PERMISSION_KEYS.FINANCE_VIEW))) {
    return [];
  }
  try {
    const params = parseFinanceParams({});
    const resolved = resolveFinanceRange(params);
    const exceptions = await fetchFinanceAttentionExceptions(params, resolved);
    return exceptions
      .filter(
        (item): item is typeof item & { href: string } =>
          item.href != null && item.href.length > 0,
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
  const [po, grn, invoices] = await Promise.all([
    settledCount(countOpenPurchaseOrders()),
    listOpenGrnsForAttention().catch(() => ({ count: 0, items: [] })),
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
  if (grn.count === 1 && grn.items[0]) {
    const row = grn.items[0];
    items.push({
      id: "inventory:grn",
      moduleKey: "inventory",
      label: copy.attention.grn,
      documentTitle: row.code,
      count: 1,
      href: `/inventory/grn/${row.id}`,
      tone: "warning",
    });
  } else if (grn.count > 1) {
    items.push({
      id: "inventory:grn",
      moduleKey: "inventory",
      label: copy.attention.grn,
      count: grn.count,
      href: "/inventory/grn",
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
    const result = await listMyWorkTasks({ includeDone: false });
    if (!result.success || !result.data) return [];
    const { endIso } = getVNDayUtcRange(getVNDateString());
    const beforeIso = new Date(new Date(endIso).getTime() - 1).toISOString();
    const due = result.data.items.filter((task) => {
      if (task.dueAt == null) return false;
      if (task.status === "done" || task.status === "canceled") return false;
      return task.dueAt <= beforeIso;
    });
    const first = due[0];
    if (due.length === 1 && first) {
      return [
        {
          id: "work:mine-due",
          moduleKey: "work",
          label: copy.attention.workMineDue,
          documentTitle: first.title,
          count: 1,
          href: `/work/tasks/${first.id}`,
          tone: "warning",
        },
      ];
    }
    if (due.length <= 0) return [];
    return [
      {
        id: "work:mine-due",
        moduleKey: "work",
        label: copy.attention.workMineDue,
        count: due.length,
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
