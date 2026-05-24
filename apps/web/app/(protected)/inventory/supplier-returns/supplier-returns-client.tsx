"use client";

import Link from "next/link";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { Button } from "@comtammatu/ui/components/button";
import type { SupplierReturnRow } from "./page";

const STATUS_LABELS: Record<string, string> = {
  draft: "Nháp",
  confirmed: "Đã xác nhận",
  cancelled: "Đã huỷ",
};

const STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "secondary",
  confirmed: "default",
  cancelled: "destructive",
};

import { formatVND as formatVndNumber } from "../_lib/format";
import { messages as inventoryMessages } from "@lib/messages";

const formatReturnValue = (v: number | null) =>
  v == null
    ? inventoryMessages.inventory.common.noValue
    : inventoryMessages.inventory.common.currency(formatVndNumber(v));

export function SupplierReturnsClient({
  initialReturns,
}: {
  initialReturns: SupplierReturnRow[];
}) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Số phiếu</TableHead>
            <TableHead>Nhà cung cấp</TableHead>
            <TableHead>Chi nhánh</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead className="text-right">Giá trị</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {initialReturns.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.return_number}</TableCell>
              <TableCell>{r.suppliers?.name ?? "—"}</TableCell>
              <TableCell>{r.branches?.name ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANTS[r.status] ?? "secondary"}>
                  {STATUS_LABELS[r.status] ?? r.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatReturnValue(r.total_value)}
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/inventory/supplier-returns/${r.id}`}>
                    Chi tiết
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
