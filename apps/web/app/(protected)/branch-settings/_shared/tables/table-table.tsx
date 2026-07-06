"use client";

import { useState } from "react";
import {
  Pencil as IconPencil,
  Trash as IconTrash,
  Utensils as IconToolsKitchen,
} from "lucide-react";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { deleteTable } from "./actions";
import { StatusBadge } from "@/components/status-badge";
import { TableFormDialog } from "./table-form-dialog";
import type { ZoneRow } from "./zone-table";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  ACTIONS_VI,
  FORM_VI,
  STATES_VI,
  TABLE_VI,
} from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { RowActionsMenu } from "@/components/row-actions-menu";

export interface TableRow {
  id: number;
  branch_id: number;
  zone_id: number | null;
  number: number;
  status: string;
  zone_name: string | null;
}

interface TableTableProps {
  tables: TableRow[];
  zones: ZoneRow[];
}

export function TableTable({ tables, zones }: TableTableProps) {
  const [editTable, setEditTable] = useState<TableRow | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  async function handleDelete(id: number) {
    const ok = await confirm({
      title: messages.settings.tables.deleteTitle,
      description: messages.settings.tables.deleteDescription,
      confirmText: ACTIONS_VI.delete,
      cancelText: ACTIONS_VI.cancel,
      variant: "destructive",
    });
    if (!ok) return;

    setPendingDeleteId(id);
    const result = await deleteTable({ id });
    setPendingDeleteId(null);
    if (!result.success) {
      toast.error(result.error);
    } else {
      toast.success(`${STATES_VI.deleted} ${TABLE_VI.long.toLowerCase()}`);
    }
  }

  function TableActions({ table }: { table: TableRow }) {
    return (
      <RowActionsMenu
        items={[
          {
            key: "edit",
            label: ACTIONS_VI.edit,
            icon: <IconPencil data-icon="inline-start" />,
            onSelect: () => setEditTable(table),
          },
          {
            key: "delete",
            label: ACTIONS_VI.delete,
            icon: <IconTrash data-icon="inline-start" />,
            destructive: true,
            separatorBefore: true,
            onSelect: () => void handleDelete(table.id),
          },
        ]}
      />
    );
  }

  const columns: DataTableColumn<TableRow>[] = [
    {
      key: "table",
      header: TABLE_VI.long,
      render: (table) => (
        <span className="font-medium">
          {messages.settings.tables.tableLabel(table.number)}
        </span>
      ),
    },
    {
      key: "area",
      header: TABLE_VI.area,
      className: "text-muted-foreground",
      render: (table) => table.zone_name ?? "—",
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (table) => <StatusBadge domain="table" value={table.status} />,
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: (table) => <TableActions table={table} />,
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={tables}
        getRowKey={(table) => table.id}
        emptyTitle={messages.settings.tables.emptyTitle}
        mobileBreakpoint={1024}
        emptyIcon={
          <IconToolsKitchen className="mx-auto size-8 text-muted-foreground" />
        }
        rowClassName={(table) =>
          pendingDeleteId === table.id ? "opacity-60" : undefined
        }
        mobileCardRender={(table) => (
          <Item
            variant="outline"
            className={pendingDeleteId === table.id ? "opacity-60" : ""}
          >
            <ItemContent className="min-w-0">
              <ItemTitle className="line-clamp-none w-full text-sm font-semibold">
                {messages.settings.tables.tableLabel(table.number)}
              </ItemTitle>
              <ItemDescription className="line-clamp-none text-sm leading-6">
                {TABLE_VI.area}: {table.zone_name ?? "—"}
              </ItemDescription>
              <div>
                <StatusBadge domain="table" value={table.status} />
              </div>
            </ItemContent>
            <ItemActions className="self-center">
              <TableActions table={table} />
            </ItemActions>
          </Item>
        )}
      />

      {editTable && (
        <TableFormDialog
          open={!!editTable}
          onOpenChange={(open) => !open && setEditTable(null)}
          branchId={editTable.branch_id}
          zones={zones}
          table={editTable}
        />
      )}
    </>
  );
}
