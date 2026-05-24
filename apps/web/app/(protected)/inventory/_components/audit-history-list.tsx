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
    return (
      <AppEmptyState mode="no-data" title="Chưa có lịch sử thao tác" />
    );
  }
  return (
    <ItemGroup>
      {logs.map((log) => (
        <Item key={log.id}>
          <ItemContent>
            <ItemTitle>{formatAction(log.action)}</ItemTitle>
            <ItemDescription>
              {log.userId ?? "Hệ thống"} · {formatVnTimestamp(log.createdAt)}
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
  };
  return map[action] ?? action;
}

function formatVnTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
