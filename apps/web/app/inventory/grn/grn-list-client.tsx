"use client";

import Link from "next/link";
import { MoreVertical, Plus, Receipt } from "lucide-react";
import { cn } from "@comtammatu/ui";
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
import { InventoryHeader } from "../_components/inventory-header";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { formatVND } from "../_lib/format";
import {
  getInventoryStatusBadgeVariant,
  getInventoryStatusLabel,
} from "../_lib/ui";

export type GrnRow = {
  id: number;
  code: string;
  supplierName: string;
  poCode: string;
  date: string;
  total: number;
  status: string;
};

export function GrnListClient({ grns }: { grns: GrnRow[] }) {
  return (
    <>
      <InventoryHeader
        title="Phiếu nhập kho"
        actions={
          <Button asChild size="sm">
            <Link href="/inventory/purchase-orders">
              <Plus className="size-4" />
              Chọn PO để tạo GRN
            </Link>
          </Button>
        }
      />
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-7xl space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã GRN</TableHead>
                    <TableHead>Nhà cung cấp</TableHead>
                    <TableHead>PO liên kết</TableHead>
                    <TableHead>Ngày kiểm nhận</TableHead>
                    <TableHead>Tổng tiền</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grns.length === 0 && (
                    <TableEmptyStateRow
                      colSpan={7}
                      icon={<Receipt className="size-5" />}
                      title="Chưa có phiếu nhập kho nào"
                    />
                  )}
                  {grns.map((g) => (
                    <TableRow
                      key={g.id}
                      className={cn(g.status === "cancelled" && "opacity-60")}
                    >
                      <TableCell>
                        <Link
                          href={`/inventory/grn/${g.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {g.code}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {g.supplierName}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {g.poCode || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {g.date || "—"}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {formatVND(g.total)} ₫
                      </TableCell>
                      <TableCell>
                        <Badge variant={getInventoryStatusBadgeVariant(g.status)}>
                          {getInventoryStatusLabel(g.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="ghost" size="icon-sm">
                          <Link href={`/inventory/grn/${g.id}`}>
                            <MoreVertical className="size-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
