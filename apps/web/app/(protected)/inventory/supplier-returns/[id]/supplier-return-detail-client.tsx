"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: supplier return detail keeps warehouse operator copy inline */

import { StatusBadge } from "../../_components/status-badge";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFooterRow,
} from "@/components/data-table/data-table";
import { AppSection } from "@/components/surface";

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

import { formatVND as formatVndNumber } from "../../_lib/format";
import { messages as inventoryMessages } from "@lib/messages";

const formatReturnValue = (v: number | null | undefined) =>
  v == null
    ? inventoryMessages.inventory.common.noValue
    : inventoryMessages.inventory.common.currency(formatVndNumber(v));

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
  const columns: DataTableColumn<DetailLine>[] = [
    {
      key: "ingredient",
      header: "Nguyên liệu",
      render: (line) => (
        <span className="font-medium">{line.ingredients?.name ?? "—"}</span>
      ),
    },
    {
      key: "quantity",
      header: "Số lượng",
      className: "text-right",
      render: (line) => (
        <span className="font-mono">
          {Number(line.quantity)}{" "}
          <span className="text-xs text-muted-foreground">
            {line.ingredients?.unit ?? line.unit}
          </span>
        </span>
      ),
    },
    {
      key: "unit_cost",
      header: "Đơn giá",
      className: "text-right",
      render: (line) => (
        <span className="font-mono">{formatReturnValue(line.unit_cost)}</span>
      ),
    },
    {
      key: "line_total",
      header: "Thành tiền",
      className: "text-right",
      render: (line) => (
        <span className="font-mono">{formatReturnValue(line.line_total)}</span>
      ),
    },
  ];
  const footerRows: DataTableFooterRow[] =
    lines.length > 0
      ? [
          {
            key: "total",
            cells: [
              { key: "label", content: "Tổng", colSpan: 3, className: "font-bold" },
              {
                key: "value",
                content: formatReturnValue(totalValue),
                className: "text-right font-mono font-bold",
              },
            ],
          },
        ]
      : [];

  return (
    <div className="space-y-4">
      {/* Meta */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Trạng thái</p>
          <StatusBadge status={header.status} className="mt-2" />
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

      <AppSection title="Dòng trả hàng" contentFlush>
        <DataTable
          columns={columns}
          data={lines}
          getRowKey={(line) => line.id}
          emptyTitle="Chưa có dòng hàng"
          emptyMode="no-data"
          desktopFooterRows={footerRows}
          mobileFooter={
            lines.length > 0 ? (
              <div className="flex justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span className="font-bold">Tổng</span>
                <span className="font-mono font-bold">
                  {formatReturnValue(totalValue)}
                </span>
              </div>
            ) : null
          }
          mobileCardRender={(line) => <SupplierReturnLineItem line={line} />}
        />
      </AppSection>

      {header.notes && (
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Ghi chú</p>
          <p className="mt-1 text-sm">{header.notes}</p>
        </div>
      )}
    </div>
  );
}

function SupplierReturnLineItem({ line }: { line: DetailLine }) {
  return (
    <Item variant="outline">
      <ItemHeader>
        <ItemTitle>{line.ingredients?.name ?? "—"}</ItemTitle>
      </ItemHeader>
      <ItemContent>
        <ItemDescription>
          {Number(line.quantity)} {line.ingredients?.unit ?? line.unit} · Đơn giá{" "}
          {formatReturnValue(line.unit_cost)}
        </ItemDescription>
      </ItemContent>
      <ItemFooter>
        <span className="font-mono text-sm font-semibold">
          {formatReturnValue(line.line_total)}
        </span>
      </ItemFooter>
    </Item>
  );
}
