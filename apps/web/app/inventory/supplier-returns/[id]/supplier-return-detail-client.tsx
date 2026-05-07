"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@comtammatu/ui/components/table";

const STATUS_LABELS: Record<string, string> = {
  draft: "Nháp",
  confirmed: "Đã xác nhận",
  cancelled: "Đã huỷ",
};

const REASON_LABELS: Record<string, string> = {
  damaged: "Hàng hỏng",
  wrong_item: "Sai hàng",
  expired: "Hết hạn",
  quality_fail: "Không đạt chất lượng",
  short_delivery_credit: "Thiếu hàng (ghi nhận)",
  other: "Khác",
};

const RESOLUTION_LABELS: Record<string, string> = {
  replacement: "Đổi hàng",
  credit_note: "Ghi có",
  cash_refund: "Hoàn tiền",
};

const formatVND = (v: number | null | undefined) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
      }).format(v);

interface DetailHeader {
  id: number;
  return_number: string;
  status: string;
  source: string;
  reason: string;
  resolution: string;
  total_value: number | null;
  created_at: string;
  confirmed_at: string | null;
  notes: string | null;
  suppliers: { id: number; name: string } | null;
  branches: { id: number; name: string } | null;
  goods_received_notes: { id: number; grn_number: string } | null;
}

interface DetailLine {
  id: number;
  ingredient_id: number;
  quantity: number;
  unit: string;
  unit_cost: number;
  line_total: number;
  reason_detail: string | null;
  photo_url: string | null;
  ingredients: { id: number; name: string; unit: string } | null;
}

interface Props {
  header: DetailHeader;
  lines: DetailLine[];
}

export function SupplierReturnDetailClient({ header, lines }: Props) {
  const totalValue = lines.reduce((s, l) => s + Number(l.line_total ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Meta */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Trạng thái</p>
          <Badge className="mt-2" variant="secondary">
            {STATUS_LABELS[header.status] ?? header.status}
          </Badge>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Lý do</p>
          <p className="mt-1 text-sm font-medium">
            {REASON_LABELS[header.reason] ?? header.reason}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Xử lý</p>
          <p className="mt-1 text-sm font-medium">
            {RESOLUTION_LABELS[header.resolution] ?? header.resolution}
          </p>
        </div>
      </div>

      {/* Lines table */}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nguyên liệu</TableHead>
              <TableHead className="text-right">Số lượng</TableHead>
              <TableHead className="text-right">Đơn giá</TableHead>
              <TableHead className="text-right">Thành tiền</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-8 text-center text-muted-foreground"
                >
                  Chưa có dòng hàng
                </TableCell>
              </TableRow>
            ) : (
              lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">
                    {l.ingredients?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {Number(l.quantity)}{" "}
                    <span className="text-xs text-muted-foreground">
                      {l.ingredients?.unit ?? l.unit}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatVND(l.unit_cost)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatVND(l.line_total)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {lines.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="font-bold">
                  Tổng
                </TableCell>
                <TableCell className="text-right font-mono font-bold">
                  {formatVND(totalValue)}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      {header.notes && (
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Ghi chú</p>
          <p className="mt-1 text-sm">{header.notes}</p>
        </div>
      )}
    </div>
  );
}
