"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
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
import { toast } from "@comtammatu/ui/components/sonner";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { DocumentStockCorrectionDialog } from "./_components/document-stock-correction-dialog";
import {
  cancelProductionOrder,
  confirmProductionOrder,
} from "./production-actions";
import {
  badgeVariantFromTone,
  orderStatusLabel,
  orderStatusTone,
  PRODUCTION_ERROR_CODES,
} from "./production-types";
import type {
  ProductionOrderRow,
  ProductionShortageRow,
} from "./production-types";

import { ACTIONS_VI, FORM_VI, PRODUCT_VI } from "@comtammatu/shared/messages";
import { formatVNDateTime } from "@comtammatu/shared/time";
interface ProductionOrderListProps {
  orders: ProductionOrderRow[];
  canConfirmProduction: boolean;
  canAdjustStock: boolean;
}

function formatOrderDate(value: string) {
  return formatVNDateTime(value);
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
  const [isPending, startTransition] = useTransition();
  const [shortageInfo, setShortageInfo] = useState<{
    productionNumber: string;
    rows: ProductionShortageRow[];
  } | null>(null);
  const draftCount = orders.filter((order) => order.status === "draft").length;

  function handleConfirm(orderId: number, productionNumber: string) {
    startTransition(async () => {
      const result = await confirmProductionOrder(orderId);
      if (!result.success) {
        if (
          result.errorCode === PRODUCTION_ERROR_CODES.INSUFFICIENT_STOCK &&
          Array.isArray(result.meta?.shortages) &&
          result.meta.shortages.length > 0
        ) {
          setShortageInfo({
            productionNumber,
            rows: result.meta.shortages as ProductionShortageRow[],
          });
          toast.error(result.error ?? "Không đủ tồn kho");
          return;
        }
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
          onClick={() => handleConfirm(order.id, order.production_number)}
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

  const columns: DataTableColumn<ProductionOrderRow>[] = [
    {
      key: "production_number",
      header: "Số lệnh",
      render: (order) => (
        <div className="font-medium">
          <div>{order.production_number}</div>
          <div className="text-xs text-muted-foreground">
            {formatOrderDate(order.created_at)}
          </div>
        </div>
      ),
    },
    {
      key: "branch",
      header: "Chi nhánh",
      render: (order) => order.branch_name,
    },
    {
      key: "items",
      header: PRODUCT_VI.finishedGood,
      render: (order) => <ProductionOrderItemBadges order={order} />,
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (order) => (
        <Badge variant={badgeVariantFromTone(orderStatusTone(order.status))}>
          {orderStatusLabel(order.status)}
        </Badge>
      ),
    },
    {
      key: "total_cost",
      header: "Tổng chi phí",
      render: (order) => (
        <span className="font-mono tabular-nums">
          <ProductionOrderCost order={order} />
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-40",
      render: (order) => (
        <div className="flex items-center justify-end gap-2">
          {renderOrderActions(order)}
        </div>
      ),
    },
  ];

  return (
    <>
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

        <CardContent flush className="max-md:px-4">
          <DataTable
            className={cn(isPending && "opacity-70")}
            columns={columns}
            data={orders}
            getRowKey={(order) => order.id}
            emptyTitle="Chưa có lệnh sản xuất nào"
            emptyDescription="Tạo lệnh mới khi BOM và nguyên liệu đã sẵn sàng tại chi nhánh."
            emptyIcon={<IconClipboardList />}
            emptyMode="no-data"
            mobileCardRender={(order) => (
              <ProductionOrderItem
                order={order}
                actions={renderOrderActions(order)}
              />
            )}
          />
        </CardContent>
      </Card>
      <ProductionShortageDialog
        info={shortageInfo}
        onClose={() => setShortageInfo(null)}
      />
    </>
  );
}

function ProductionOrderItemBadges({ order }: { order: ProductionOrderRow }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {order.items.map((item) => (
        <Badge key={item.id} variant={badgeVariantFromTone("neutral")}>
          {item.finished_good_name} x {item.quantity} {item.unit}
        </Badge>
      ))}
    </div>
  );
}

function ProductionOrderCost({ order }: { order: ProductionOrderRow }) {
  return (
    <>
      {formatCost(order.total_cost)}
      {order.status === "draft" ? (
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          (tạm tính)
        </span>
      ) : null}
    </>
  );
}

function ProductionOrderItem({
  order,
  actions,
}: {
  order: ProductionOrderRow;
  actions: ReactNode;
}) {
  return (
    <Item variant="outline">
      <ItemHeader>
        <ItemTitle>{order.production_number}</ItemTitle>
        <Badge variant={badgeVariantFromTone(orderStatusTone(order.status))}>
          {orderStatusLabel(order.status)}
        </Badge>
      </ItemHeader>
      <ItemContent className="basis-full">
        <ItemDescription>
          {order.branch_name} · {formatOrderDate(order.created_at)}
        </ItemDescription>
        <ProductionOrderItemBadges order={order} />
      </ItemContent>
      <ItemFooter>
        <span className="font-mono text-sm font-semibold tabular-nums">
          <ProductionOrderCost order={order} />
        </span>
        <ItemActions>{actions}</ItemActions>
      </ItemFooter>
    </Item>
  );
}

function formatShortageNumber(value: number) {
  return value.toLocaleString("vi-VN", { maximumFractionDigits: 3 });
}

interface ProductionShortageDialogProps {
  info: { productionNumber: string; rows: ProductionShortageRow[] } | null;
  onClose: () => void;
}

function ProductionShortageDialog({
  info,
  onClose,
}: ProductionShortageDialogProps) {
  const open = info !== null;
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Thiếu nguyên liệu để sản xuất</DialogTitle>
          <DialogDescription>
            {info
              ? `Lệnh ${info.productionNumber} chưa đủ nguyên liệu trong kho mặc định của chi nhánh. Nhập kho các nguyên liệu dưới đây trước khi xác nhận lại.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nguyên liệu</TableHead>
                <TableHead className="text-right">Cần</TableHead>
                <TableHead className="text-right">Tồn</TableHead>
                <TableHead className="text-right">Thiếu</TableHead>
                <TableHead>Đơn vị</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {info?.rows.map((row) => (
                <TableRow key={row.ingredient_id}>
                  <TableCell className="font-medium">
                    {row.ingredient_name}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatShortageNumber(row.needed)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatShortageNumber(row.on_hand)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-destructive">
                    {formatShortageNumber(row.missing)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.unit}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
