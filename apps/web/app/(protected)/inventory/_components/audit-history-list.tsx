import { INVENTORY_VI } from "@comtammatu/shared/messages";
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
            <ItemTitle>{formatAction(log.action)}</ItemTitle>
            <ItemDescription>
              {log.userId ?? INVENTORY_VI.systemActor} · {formatVNDateTime(log.createdAt)}
            </ItemDescription>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    create: "Tạo mới",
    update: "Cập nhật",
    confirm: "Xác nhận",
    cancel: "Huỷ",
    approve: "Duyệt",
    reject: "Từ chối",
    complete: "Hoàn thành",
    void: "Vô hiệu",
    "inventory.grn.created_from_po": "Tạo phiếu nhập từ đơn đặt hàng",
    "inventory.grn.line_amended": "Sửa dòng phiếu nhập",
  };
  return action.includes(" · ") ? action : (map[action] ?? UNKNOWN_LABEL_VI);
}
