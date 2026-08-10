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
        ? messages.controlSurface.staffPermissions.tenantWide
        : (branchNameById.get(entry.branchId) ??
          messages.controlSurface.staffPermissions.branchFallback(entry.branchId));
    const actionLabel =
      messages.controlSurface.staffAudit.actionLabels[entry.action] ??
      "Cập nhật phân quyền";
    return {
      id: entry.id,
      // Precomposed " · " string bypasses the dictionary map in AuditHistoryList.
      action: `${actionLabel} · ${permissionLabelByKey.get(entry.permissionKey) ?? UNKNOWN_LABEL_VI} · ${branchLabel}`,
      entityType: "permission",
      entityId: entry.actorUserId,
      userId: entry.actorUserId,
      actorName: actorNameById.get(entry.actorUserId) ?? UNKNOWN_LABEL_VI,
      createdAt: entry.at,
    };
  });

  return (
    <AppSection
      title={messages.controlSurface.staffPermissions.historyTitle(entries.length)}
    >
      <AuditHistoryList logs={logs} />
    </AppSection>
  );
}
