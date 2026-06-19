"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: supplier returns list keeps warehouse operator copy inline */

import Link from "next/link";
import { Button } from "@comtammatu/ui/components/button";
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
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import type { SupplierReturnRow } from "./page";

import { formatVND as formatVndNumber } from "../_lib/format";
import { StatusBadge } from "../_components/status-badge";
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
  const columns: DataTableColumn<SupplierReturnRow>[] = [
    {
      key: "return_number",
      header: "Số phiếu",
      render: (row) => <span className="font-medium">{row.return_number}</span>,
    },
    {
      key: "supplier",
      header: "Nhà cung cấp",
      render: (row) => row.suppliers?.name ?? "—",
    },
    {
      key: "branch",
      header: "Chi nhánh",
      render: (row) => row.branches?.name ?? "—",
    },
    {
      key: "status",
      header: "Trạng thái",
      render: (row) => <StatusBadge status={row.status} size="sm" />,
    },
    {
      key: "value",
      header: "Giá trị",
      className: "text-right",
      render: (row) => (
        <span className="font-mono">{formatReturnValue(row.total_value)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/inventory/supplier-returns/${row.id}`}>Chi tiết</Link>
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={initialReturns}
      getRowKey={(row) => row.id}
      emptyTitle="Chưa có phiếu trả hàng NCC"
      emptyMode="no-data"
      mobileCardRender={(row) => <SupplierReturnItem row={row} />}
    />
  );
}

function SupplierReturnItem({ row }: { row: SupplierReturnRow }) {
  return (
    <Item variant="outline">
      <ItemHeader>
        <ItemTitle>{row.return_number}</ItemTitle>
        <StatusBadge status={row.status} size="sm" />
      </ItemHeader>
      <ItemContent>
        <ItemDescription>
          {row.suppliers?.name ?? "—"} · {row.branches?.name ?? "—"}
        </ItemDescription>
      </ItemContent>
      <ItemFooter>
        <span className="font-mono text-sm font-semibold">
          {formatReturnValue(row.total_value)}
        </span>
        <ItemActions>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/inventory/supplier-returns/${row.id}`}>Chi tiết</Link>
          </Button>
        </ItemActions>
      </ItemFooter>
    </Item>
  );
}
