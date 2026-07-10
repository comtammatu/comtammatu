"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search as IconSearch } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { matchesSearch } from "@lib/search";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppToolbar,
} from "@/components/surface";
import {
  BRANCH_VI,
  FORM_VI,
  INVENTORY_VI,
} from "@comtammatu/shared/messages";
import type { SupplierReturnRow } from "./page";

import { formatVND as formatVndNumber } from "../_lib/format";
import { StatusBadge } from "@/components/status-badge";
import { messages as inventoryMessages } from "@lib/messages";

const RETURNS_VI = inventoryMessages.inventory.supplierReturns;

const formatReturnValue = (v: number | null) =>
  v == null
    ? inventoryMessages.inventory.common.noValue
    : inventoryMessages.inventory.common.currency(formatVndNumber(v));

interface Props {
  initialReturns: SupplierReturnRow[];
  basePath?: string;
  embedded?: boolean;
}

export function SupplierReturnsClient({
  initialReturns,
  basePath = "/inventory/supplier-returns",
  embedded = false,
}: Props) {
  const [search, setSearch] = useState("");

  const filteredReturns = useMemo(() => {
    const query = search.trim();
    if (!query) return initialReturns;
    return initialReturns.filter((row) =>
      matchesSearch(
        [row.return_number, row.suppliers?.name, row.branches?.name],
        query,
      ),
    );
  }, [initialReturns, search]);

  const showNoResults =
    filteredReturns.length === 0 && search.trim().length > 0;

  const columns: DataTableColumn<SupplierReturnRow>[] = [
    {
      key: "return_number",
      header: RETURNS_VI.returnNumber,
      render: (row) => <span className="font-medium">{row.return_number}</span>,
    },
    {
      key: "supplier",
      header: INVENTORY_VI.supplier,
      render: (row) => row.suppliers?.name ?? "—",
    },
    {
      key: "branch",
      header: BRANCH_VI.long,
      render: (row) => row.branches?.name ?? "—",
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (row) => (
        <StatusBadge domain="inventory" value={row.status} size="sm" />
      ),
    },
    {
      key: "value",
      header: FORM_VI.value,
      className: "text-right",
      render: (row) => (
        <span className="font-mono">{formatReturnValue(row.total_value)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <Button variant="ghost" size={embedded ? "touch" : "sm"} asChild>
          <Link href={`${basePath}/${row.id}`}>{RETURNS_VI.viewDetail}</Link>
        </Button>
      ),
    },
  ];

  const content = (
    <>
      {!embedded ? (
        <AppPageHeader
          eyebrow={INVENTORY_VI.warehouse}
          title={INVENTORY_VI.supplierReturnsTitle}
          description={INVENTORY_VI.supplierReturnsDescription}
        />
      ) : null}
      {initialReturns.length === 0 ? (
        <AppEmptyState
          mode="no-data"
          title={INVENTORY_VI.noSupplierReturns}
          symbol="riceGrain"
        />
      ) : (
        <>
          {!embedded ? (
            <AppToolbar
              search={
                <InputGroup className="min-w-0 flex-1">
                  <InputGroupAddon>
                    <IconSearch />
                  </InputGroupAddon>
                  <InputGroupInput
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={RETURNS_VI.searchPlaceholder}
                  />
                </InputGroup>
              }
            />
          ) : null}
          <DataTable
            columns={columns}
            data={filteredReturns}
            getRowKey={(row) => row.id}
            emptyTitle={
              showNoResults ? RETURNS_VI.emptyFiltered : RETURNS_VI.emptyNoData
            }
            emptyMode={showNoResults ? "no-results" : "no-data"}
            mobileCardRender={(row) => (
              <SupplierReturnItem
                row={row}
                basePath={basePath}
                embedded={embedded}
              />
            )}
          />
        </>
      )}
    </>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  return (
    <AppPage width="xwide" density="compact">
      {content}
    </AppPage>
  );
}

function SupplierReturnItem({
  row,
  basePath,
  embedded,
}: {
  row: SupplierReturnRow;
  basePath: string;
  embedded: boolean;
}) {
  return (
    <Item variant="outline">
      <ItemHeader>
        <ItemTitle>{row.return_number}</ItemTitle>
        <StatusBadge domain="inventory" value={row.status} size="sm" />
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
          <Button variant="ghost" size={embedded ? "touch" : "sm"} asChild>
            <Link href={`${basePath}/${row.id}`}>{RETURNS_VI.viewDetail}</Link>
          </Button>
        </ItemActions>
      </ItemFooter>
    </Item>
  );
}
