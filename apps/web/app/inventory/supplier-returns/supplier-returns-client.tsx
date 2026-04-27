"use client";

import Link from "next/link";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { Button } from "@comtammatu/ui/components/button";
import { Plus as IconPlus } from "lucide-react";
import { InventoryHeader } from "../_components/inventory-header";
import { InventoryPageContent } from "../_components/inventory-page-layout";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { formatVND } from "../_lib/format";

type ReturnRow = {
  id: number;
  return_number: string;
  status: string;
  source: string;
  reason: string;
  resolution: string;
  total_value: number;
  created_at: string;
  confirmed_at: string | null;
  suppliers: { id: number; name: string } | null;
  branches: { id: number; name: string } | null;
  goods_received_notes: { id: number; grn_number: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  sent: "Đã gửi NCC",
  credited: "Đã nhận credit",
  refunded: "Đã hòan tiền",
  cancelled: "Đã hủy",
};

const SOURCE_LABEL: Record<string, string> = {
  grn_reject: "Từ chối nhập",
  post_receipt: "Trả hàng đã nhập",
};

const REASON_LABEL: Record<string, string> = {
  damaged: "Hư hỏng",
  wrong_item: "Sai mặt hàng",
  expired: "Hết hạn",
  quality_fail: "Không đạt QC",
  short_delivery_credit: "Thiếu hàng (credit)",
  other: "Khác",
};

const RESOLUTION_LABEL: Record<string, string> = {
  replacement: "Giao bù",
  credit_note: "Credit note",
  cash_refund: "Hòan tiền",
};

function statusVariant(s: string) {
  if (s === "draft") return "secondary" as const;
  if (s === "cancelled") return "outline" as const;
  if (s === "sent") return "default" as const;
  return "default" as const;
}

export function SupplierReturnsClient({
  rows,
  error,
}: {
  rows: ReturnRow[];
  error: string | null;
}) {
  return (
    <>
      <InventoryHeader
        title="Phiếu trả hàng nhà cung cấp"
        actions={
          <Button asChild>
            <Link href="/inventory/supplier-returns/new">
              <IconPlus className="size-4" /> Tạo phiếu trả
            </Link>
          </Button>
        }
      />
      <InventoryPageContent>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã phiếu</TableHead>
                  <TableHead>NCC</TableHead>
                  <TableHead>Kho</TableHead>
                  <TableHead>GRN</TableHead>
                  <TableHead>Nguồn</TableHead>
                  <TableHead>Lý do</TableHead>
                  <TableHead>Cách xử lý</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Giá trị</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableEmptyStateRow
                    colSpan={9}
                    title="Chưa có phiếu trả hàng nào"
                    description="Phiếu sẽ tự sinh khi GRN có hàng bị từ chối, hoặc tạo thủ công khi cần trả hàng đã nhập kho."
                  />
                ) : null}
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        href={`/inventory/supplier-returns/${r.id}`}
                        className="font-mono font-medium text-primary hover:underline"
                      >
                        {r.return_number}
                      </Link>
                    </TableCell>
                    <TableCell>{r.suppliers?.name ?? "—"}</TableCell>
                    <TableCell>{r.branches?.name ?? "—"}</TableCell>
                    <TableCell>
                      {r.goods_received_notes ? (
                        <Link
                          href={`/inventory/grn/${r.goods_received_notes.id}`}
                          className="font-mono text-xs text-primary hover:underline"
                        >
                          {r.goods_received_notes.grn_number}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {SOURCE_LABEL[r.source] ?? r.source}
                    </TableCell>
                    <TableCell className="text-xs">
                      {REASON_LABEL[r.reason] ?? r.reason}
                    </TableCell>
                    <TableCell className="text-xs">
                      {RESOLUTION_LABEL[r.resolution] ?? r.resolution}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(r.status)}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatVND(Number(r.total_value ?? 0))} ₫
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </InventoryPageContent>
    </>
  );
}
