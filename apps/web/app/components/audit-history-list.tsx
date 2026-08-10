import {
  formatAuditActionLabel,
  INVENTORY_VI,
} from "@comtammatu/shared/messages";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { formatVNDateTime } from "@comtammatu/shared/time";
import type { AuditLogRow } from "@/_lib/audit";
import { AppEmptyState } from "@/components/surface";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemGroup,
} from "@comtammatu/ui/components/item";

export function AuditHistoryList({ logs }: { logs: AuditLogRow[] }) {
  if (!logs.length) {
    return <AppEmptyState mode="no-data" title={INVENTORY_VI.noAuditHistory} />;
  }
  return (
    <ItemGroup>
      {logs.map((log) => (
        <Item key={log.id}>
          <ItemContent>
            <ItemTitle>{formatAuditActionLabel(log.action)}</ItemTitle>
            <ItemDescription>
              {log.actorName ??
                (log.userId ? UNKNOWN_LABEL_VI : INVENTORY_VI.systemActor)}{" "}
              · {formatVNDateTime(log.createdAt)}
            </ItemDescription>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}
