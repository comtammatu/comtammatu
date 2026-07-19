import type { AuditLogRow } from "@/_lib/audit";
import { messages } from "@lib/messages";
import { AppSection } from "@/components/surface";
import { AuditHistoryList } from "@/components/audit-history-list";

type PermissionAuditEntry = {
  id: number;
  action: string;
  permissionKey: string;
  branchId: number | null;
  at: string;
  actorUserId: string;
};

type HistoryTabProps = {
  entries: PermissionAuditEntry[];
  branchNameById: Map<number, string>;
  actorNameById: Map<string, string>;
};

export function HistoryTab({
  entries,
  branchNameById,
  actorNameById,
}: HistoryTabProps) {
  // Project the permission audit rows onto the shared AuditLogRow contract.
  // The composite `action` label carries the permission key and branch scope,
  // and passes through the shared renderer's action map unchanged.
  const logs: AuditLogRow[] = entries.map((entry) => {
    const branchLabel =
      entry.branchId === null
        ? messages.owner.staffPermissions.tenantWide
        : (branchNameById.get(entry.branchId) ??
          messages.owner.staffPermissions.branchFallback(entry.branchId));
    return {
      id: entry.id,
      action: `${entry.action} · ${entry.permissionKey} · ${branchLabel}`,
      entityType: "permission",
      entityId: entry.actorUserId,
      userId: actorNameById.get(entry.actorUserId) ?? entry.actorUserId.slice(0, 8),
      createdAt: entry.at,
    };
  });

  return (
    <AppSection
      title={messages.owner.staffPermissions.historyTitle(entries.length)}
    >
      <AuditHistoryList logs={logs} />
    </AppSection>
  );
}
