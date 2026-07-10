"use client";

import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
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
import { AppSection, DescriptionList } from "@/components/surface";
import { AuditHistoryList } from "../../_components/audit-history-list";
import type { AuditLogRow } from "@/_lib/audit";
import { formatQuantity } from "@comtammatu/shared/format";
import { FORM_VI, PRODUCT_VI } from "@comtammatu/shared/messages";

import { formatVND as formatVndNumber, formatDateTime } from "../../_lib/format";
import { messages as inventoryMessages } from "@lib/messages";

const RETURNS_VI = inventoryMessages.inventory.supplierReturns;

const labelTicketInfo = "Thông tin phiếu";
const labelSourceTransaction = "Giao dịch gốc";
const labelCreatedAt = "Ngày tạo";
const labelApprovedAt = "Ngày duyệt";
const labelAuditHistory = "Lịch sử hoạt động";

const REASON_LABELS: Record<string, string> = RETURNS_VI.reasonLabels;

const RESOLUTION_LABELS: Record<string, string> = RETURNS_VI.resolutionLabels;

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
  total_cost: number;
  reason_detail: string | null;
  photo_url: string | null;
  ingredients: { id: number; name: string; unit: string } | null;
}

interface Props {
  header: DetailHeader;
  lines: DetailLine[];
  auditLogs: AuditLogRow[];
  embedded?: boolean;
}

export function SupplierReturnDetailClient({
  header,
  lines,
  auditLogs,
  embedded = false,
}: Props) {
  const totalValue = lines.reduce((s, l) => s + Number(l.total_cost ?? 0), 0);
  const columns: DataTableColumn<DetailLine>[] = [
    {
      key: "ingredient",
      header: PRODUCT_VI.rawIngredient,
      render: (line) => (
        <span className="font-medium">{line.ingredients?.name ?? "—"}</span>
      ),
    },
    {
      key: "quantity",
      header: FORM_VI.quantity,
      className: "text-right",
      render: (line) => (
        <span className="font-mono">
          {formatQuantity(line.quantity)}{" "}
          <span className="text-xs text-muted-foreground">
            {line.ingredients?.unit ?? line.unit}
          </span>
        </span>
      ),
    },
    {
      key: "unit_cost",
      header: FORM_VI.unitPrice,
      className: "text-right",
      render: (line) => (
        <span className="font-mono">{formatReturnValue(line.unit_cost)}</span>
      ),
    },
    {
      key: "total_cost",
      header: FORM_VI.amount,
      className: "text-right",
      render: (line) => (
        <span className="font-mono">{formatReturnValue(line.total_cost)}</span>
      ),
    },
  ];

  const footerRows: DataTableFooterRow[] =
    lines.length > 0
      ? [
          {
            key: "total",
            cells: [
              {
                key: "label",
                content: FORM_VI.total,
                colSpan: 3,
                className: "font-bold",
              },
              {
                key: "value",
                content: formatReturnValue(totalValue),
                className: "text-right font-mono font-bold",
              },
            ],
          },
        ]
      : [];

  const metaSection = (
    <AppSection title={labelTicketInfo}>
      <DescriptionList
        items={[
          {
            term: FORM_VI.status,
            description: (
              <StatusBadge domain="inventory" value={header.status} />
            ),
          },
          {
            term: FORM_VI.reason,
            description: REASON_LABELS[header.reason] ?? header.reason,
          },
          {
            term: RETURNS_VI.resolutionLabel,
            description:
              RESOLUTION_LABELS[header.resolution] ?? header.resolution,
          },
          {
            term: labelSourceTransaction,
            description: header.goods_received_notes ? (
              <Link
                href={`/inventory/grn/${header.goods_received_notes.id}`}
                className="font-medium text-primary hover:underline"
              >
                {header.goods_received_notes.grn_number}
              </Link>
            ) : (
              "—"
            ),
          },
          {
            term: labelCreatedAt,
            description: formatDateTime(header.created_at),
          },
          {
            term: labelApprovedAt,
            description: header.confirmed_at
              ? formatDateTime(header.confirmed_at)
              : "—",
          },
          {
            term: FORM_VI.notes,
            description: header.notes ?? "—",
          },
        ]}
      />
    </AppSection>
  );

  const linesSection = (
    <AppSection title={RETURNS_VI.linesTitle} contentFlush>
      <DataTable
        columns={columns}
        data={lines}
        getRowKey={(line) => line.id}
        emptyTitle={RETURNS_VI.emptyLines}
        emptyMode="no-data"
        desktopFooterRows={footerRows}
        mobileFooter={
          lines.length > 0 ? (
            <Item
              variant="outline"
              size="sm"
              className="bg-muted/30 flex justify-between px-3 py-2 text-sm"
            >
              <span className="font-bold">{FORM_VI.total}</span>
              <span className="font-mono font-bold">
                {formatReturnValue(totalValue)}
              </span>
            </Item>
          ) : null
        }
        mobileCardRender={(line) => <SupplierReturnLineItem line={line} />}
      />
    </AppSection>
  );

  const auditSection = (
    <AppSection title={labelAuditHistory} collapsible defaultOpen={false}>
      <AuditHistoryList logs={auditLogs} />
    </AppSection>
  );

  if (embedded) {
    return (
      <div className="flex flex-col gap-3">
        {metaSection}
        {linesSection}
        {auditSection}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div className="flex flex-col gap-3 lg:col-span-2">
        {linesSection}
        {auditSection}
      </div>
      <div className="flex flex-col gap-3">{metaSection}</div>
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
          {formatQuantity(line.quantity)} {line.ingredients?.unit ?? line.unit} ·{" "}
          {FORM_VI.unitPrice} {formatReturnValue(line.unit_cost)}
        </ItemDescription>
      </ItemContent>
      <ItemFooter>
        <span className="font-mono text-sm font-semibold">
          {formatReturnValue(line.total_cost)}
        </span>
      </ItemFooter>
    </Item>
  );
}
