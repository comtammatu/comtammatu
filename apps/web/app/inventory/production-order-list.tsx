"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { cn } from "@comtammatu/ui";
import { toast } from "@comtammatu/ui/components/sonner";
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

interface ProductionOrderListProps {
  orders: ProductionOrderRow[];
}

export function ProductionOrderList({
  orders,
}: ProductionOrderListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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

  return (
    <Card className="overflow-hidden rounded-lg">
      <CardContent className="px-4 sm:px-5">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Số lệnh</TableHead>
              <TableHead>Bếp trung tâm</TableHead>
              <TableHead>Thành phẩm</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Tổng chi phí</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  Chưa có lệnh sản xuất nào
                </TableCell>
              </TableRow>
            )}
            {orders.map((order) => (
              <TableRow
                key={order.id}
                className={cn(isPending ? "opacity-70" : "")}
              >
                <TableCell className="font-medium">
                  <div>{order.production_number}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleString("vi-VN")}
                  </div>
                </TableCell>
                <TableCell>{order.branch_name}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    {order.items.map((item) => (
                      <Badge
                        key={item.id}
                        variant={badgeVariantFromTone("neutral")}
                        className="px-2 py-1 text-xs"
                      >
                        {item.finished_good_name} x {item.quantity} {item.unit}
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
                  {order.total_cost.toLocaleString("vi-VN")}đ
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    {order.status === "draft" ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleConfirm(order.id)}
                          disabled={isPending}
                        >
                          <CheckCircle2 className="mr-2 size-4" />
                          Xác nhận
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleCancel(order.id)}
                          disabled={isPending}
                        >
                          Hủy
                        </Button>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
