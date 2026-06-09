"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2 as IconCheck,
  ClipboardCheck as IconClipboardCheck,
} from "lucide-react";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { approveCheckoutRequest } from "../clock/actions";

export interface CheckoutApprovalItem {
  id: number;
  employeeName: string;
  employeeCode: string | null;
  branchName: string | null;
  dateLabel: string;
  checkInLabel: string;
  requestedLabel: string;
  shiftLabel: string;
  requestKindLabel: string;
}

interface CheckoutApprovalsClientProps {
  items: CheckoutApprovalItem[];
  canApprove: boolean;
}

export function CheckoutApprovalsClient({
  items,
  canApprove,
}: CheckoutApprovalsClientProps) {
  const [localItems, setLocalItems] = useState(items);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  function approve(item: CheckoutApprovalItem) {
    setPendingId(item.id);
    startTransition(async () => {
      const result = await approveCheckoutRequest({ attendanceId: item.id });
      setPendingId(null);

      if (!result.success) {
        toast.error(result.error ?? "Không thể duyệt kết ca.");
        return;
      }

      setLocalItems((current) =>
        current.filter((currentItem) => currentItem.id !== item.id),
      );
      toast.success(`Đã duyệt kết ca cho ${item.employeeName}`);
    });
  }

  if (localItems.length === 0) {
    return (
      <Empty>
        <EmptyMedia variant="icon">
          <IconClipboardCheck />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>Không có yêu cầu chờ duyệt</EmptyTitle>
          <EmptyDescription>
            Khi nhân viên gửi kết ca, yêu cầu sẽ xuất hiện tại đây.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!canApprove ? (
        <Alert className="border-warning/20 bg-warning/10">
          <AlertDescription>
            Tài khoản này chưa có quyền duyệt kết ca cho chi nhánh hiện tại.
          </AlertDescription>
        </Alert>
      ) : null}

      <ItemGroup className="gap-2">
        {localItems.map((item) => {
          const approving = pendingId === item.id && isPending;
          return (
            <Item key={item.id} variant="outline" className="items-start">
              <ItemMedia variant="icon">
                <IconClipboardCheck />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>
                  {item.employeeName}
                  {item.employeeCode ? (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {item.employeeCode}
                    </span>
                  ) : null}
                </ItemTitle>
                <ItemDescription>
                  {item.requestKindLabel}
                  {item.branchName ? ` · ${item.branchName}` : ""}
                  {" · "}
                  {item.shiftLabel}
                </ItemDescription>
                <div className="grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Ngày</p>
                    <p className="font-mono">{item.dateLabel}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Vào ca</p>
                    <p className="font-mono">{item.checkInLabel}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Yêu cầu ra</p>
                    <p className="font-mono">{item.requestedLabel}</p>
                  </div>
                </div>
              </ItemContent>
              <ItemActions>
                <Badge variant="warning">Chờ duyệt</Badge>
                <Button
                  size="sm"
                  disabled={!canApprove || approving || isPending}
                  onClick={() => approve(item)}
                >
                  {approving ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <IconCheck data-icon="inline-start" />
                  )}
                  Duyệt
                </Button>
              </ItemActions>
            </Item>
          );
        })}
      </ItemGroup>
    </div>
  );
}
