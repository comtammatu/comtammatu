import { formatVND } from "@comtammatu/shared/format";
import { EmployeePanel } from "@lib/staff-runtime/components/staff-runtime-page";
import { KpiCard } from "@/components/kpi/kpi-card";
import { messages } from "@lib/messages";
import { loadAuthState } from "@/_lib/auth";
import { getUnreadCount } from "@/(protected)/notifications/actions";
import { fetchBranchDayStatus } from "../../dashboard/data";

export async function HubOverviewSection({
  branchId,
}: {
  branchId: number;
}) {
  const { supabase, claims } = await loadAuthState();
  
  const [day, unreadResult] = await Promise.all([
    fetchBranchDayStatus(supabase, claims, branchId),
    getUnreadCount().catch(() => null),
  ]);

  const unreadCount = unreadResult?.success
    ? (unreadResult.data?.count ?? 0)
    : 0;

  if (!day) return null;

  const basePath = `/br/${branchId}`;

  return (
    <EmployeePanel
      title={messages.settings.branch.hubOverviewTitle}
      size="sm"
    >
      <div className="grid grid-cols-2 gap-2">
        <KpiCard
          label={messages.settings.branch.dayRevenueLabel}
          value={formatVND(day.todayRevenue)}
          density="compact"
          href={`${basePath}/dashboard`}
        />
        <KpiCard
          label={messages.settings.branch.hubOverviewUnreadLabel}
          value={String(unreadCount)}
          density="compact"
          tone={unreadCount > 0 ? "warning" : "neutral"}
          href="/notifications"
        />
      </div>
    </EmployeePanel>
  );
}
