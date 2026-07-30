import type { AuditLogRow } from "@/_lib/audit";
import { messages } from "@lib/messages";
import { AppSection } from "@/components/surface";
import { AuditHistoryList } from "@/components/audit-history-list";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";

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
  permissionLabelByKey: Map<string, string>;
};

export function HistoryTab({
  entries,
  branchNameById,
  actorNameById,
  permissionLabelByKey,
}: HistoryTabProps) {
  const logs: AuditLogRow[] = entries.map((entry) => {
    const branchLabel =
      entry.branchId === null
        ? messages.owner.staffPermissions.tenantWide
        : (branchNameById.get(entry.branchId) ??
          messages.owner.staffPermissions.branchFallback(entry.branchId));
    return {
      id: entry.id,
      action: `${messages.owner.staffAudit.actionLabels[entry.action] ?? UNKNOWN_LABEL_VI} · ${permissionLabelByKey.get(entry.permissionKey) ?? UNKNOWN_LABEL_VI} · ${branchLabel}`,
      entityType: "permission",
      entityId: entry.actorUserId,
      userId: entry.actorUserId,
      actorName: actorNameById.get(entry.actorUserId) ?? UNKNOWN_LABEL_VI,
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
