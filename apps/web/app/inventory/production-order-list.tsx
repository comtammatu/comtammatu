"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CircleCheck as IconCircleCheck,
  ClipboardList as IconClipboardList,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
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
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { toast } from "@comtammatu/ui/components/sonner";
import { DocumentStockCorrectionDialog } from "./_components/document-stock-correction-dialog";
import { TableEmptyStateRow } from "./_components/table-empty-state-row";
import {
  cancelProductionOrder,
  confirmProductionOrder,
} from "./production-actions";
import {
  badgeVariantFromTone,
  orderStatusLabel,
  orderStatusTone,
} from "./production-types";
import type { ProductionOrderRow } from "./production-types";

import { ACTIONS_VI, FORM_VI, PRODUCT_VI } from "@comtammatu/shared/messages";
interface ProductionOrderListProps {
  orders: ProductionOrderRow[];
  canConfirmProduction: boolean;
  canAdjustStock: boolean;
}

function formatOrderDate(value: string) {
  return new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCost(value: number) {
  return `${value.toLocaleString("vi-VN")}đ`;
}

export function ProductionOrderList({
  orders,
  canConfirmProduction,
  canAdjustStock,
}: ProductionOrderListProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const draftCount = orders.filter((order) => order.status === "draft").length;

  function handleConfirm(orderId: number) {
    startTransition(async () => {
      const result = await confirmProductionOrder(orderId);
      if (!result.success) {
        toast.error(result.error ?? "Không thể xác nhận");
        return;
      }
      toast.success("Đã xác nhận lệnh sản xuất");
      router.refresh();
    });
  }

  function handleCancel(orderId: number) {
    startTransition(async () => {
      const result = await cancelProductionOrder(orderId);
      if (!result.success) {
        toast.error(result.error ?? "Không thể hủy");
        return;
      }
      toast.success("Đã hủy lệnh sản xuất");
      router.refresh();
    });
  }

  function renderOrderActions(order: ProductionOrderRow) {
    if (
      order.status === "completed" &&
      canAdjustStock &&
      order.items.length > 0
    ) {
      return (
        <DocumentStockCorrectionDialog
          documentType="production_order"
          documentId={order.id}
          documentCode={order.production_number}
          branchOptions={[{ id: order.branch_id, name: order.branch_name }]}
          itemOptions={order.items.map((item) => ({
            ingredientId: item.finished_good_id,
            name: item.finished_good_name,
            unit: item.unit,
          }))}
          buttonSize="sm"
        />
      );
    }

    if (order.status !== "draft" || !canConfirmProduction) {
      return <span className="text-sm text-muted-foreground">-</span>;
    }

    return (
      <>
        <Button
          type="button"
          size="sm"
          onClick={() => handleConfirm(order.id)}
          disabled={isPending}
        >
          <IconCircleCheck data-icon="inline-start" />
          Xác nhận
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleCancel(order.id)}
          disabled={isPending}
        >
          {ACTIONS_VI.cancel}
        </Button>
      </>
    );
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <IconClipboardList />
          Lệnh sản xuất
        </CardTitle>
        <CardAction>
          <Badge variant={draftCount > 0 ? "warning" : "secondary"}>
            {draftCount} lệnh nháp
          </Badge>
        </CardAction>
      </CardHeader>

      {isMobile ? (
        <CardContent className="flex flex-col gap-3">
          {orders.length === 0 ? (
            <Empty className="border bg-card py-8">
              <EmptyMedia variant="icon">
                <IconClipboardList />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>Chưa có lệnh sản xuất nào</EmptyTitle>
                <EmptyDescription>
                  Tạo lệnh mới khi bếp trung tâm đã có BOM và nguyên liệu sẵn
                  sàng.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ItemGroup>
              {orders.map((order) => (
                <Item
                  key={order.id}
                  variant="outline"
                  className={cn(isPending && "opacity-70")}
                >
                  <ItemHeader>
                    <ItemTitle>{order.production_number}</ItemTitle>
                    <Badge
                      variant={badgeVariantFromTone(
                        orderStatusTone(order.status),
                      )}
                    >
                      {orderStatusLabel(order.status)}
                    </Badge>
                  </ItemHeader>
                  <ItemContent className="basis-full">
                    <ItemDescription>
                      {order.branch_name} · {formatOrderDate(order.created_at)}
                    </ItemDescription>
                    <div className="flex flex-wrap gap-1.5">
                      {order.items.map((item) => (
                        <Badge
                          key={item.id}
                          variant={badgeVariantFromTone("neutral")}
                        >
                          {item.finished_good_name} x {item.quantity}{" "}
                          {item.unit}
                        </Badge>
                      ))}
                    </div>
                  </ItemContent>
                  <ItemFooter>
                    <span className="font-mono text-sm font-semibold tabular-nums">
                      {formatCost(order.total_cost)}
                    </span>
                    <ItemActions>{renderOrderActions(order)}</ItemActions>
                  </ItemFooter>
                </Item>
              ))}
            </ItemGroup>
          )}
        </CardContent>
      ) : (
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Số lệnh</TableHead>
                <TableHead>Bếp trung tâm</TableHead>
                <TableHead>{PRODUCT_VI.finishedGood}</TableHead>
                <TableHead>{FORM_VI.status}</TableHead>
                <TableHead>Tổng chi phí</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableEmptyStateRow
                  colSpan={6}
                  title="Chưa có lệnh sản xuất nào"
                  description="Tạo lệnh mới khi BOM và nguyên liệu đã sẵn sàng cho bếp trung tâm."
                  icon={<IconClipboardList />}
                />
              ) : null}
              {orders.map((order) => (
                <TableRow
                  key={order.id}
                  className={cn(isPending ? "opacity-70" : "")}
                >
                  <TableCell className="font-medium">
                    <div>{order.production_number}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatOrderDate(order.created_at)}
                    </div>
                  </TableCell>
                  <TableCell>{order.branch_name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {order.items.map((item) => (
                        <Badge
                          key={item.id}
                          variant={badgeVariantFromTone("neutral")}
                        >
                          {item.finished_good_name} x {item.quantity}{" "}
                          {item.unit}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={badgeVariantFromTone(
                        orderStatusTone(order.status),
                      )}
                    >
                      {orderStatusLabel(order.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {formatCost(order.total_cost)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      {renderOrderActions(order)}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  );
}
