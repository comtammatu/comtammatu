"use client";

import { useState } from "react";
import {
  Ellipsis as IconDots,
  Pencil as IconPencil,
  Trash as IconTrash,
  Utensils as IconToolsKitchen,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow as TRow,
} from "@comtammatu/ui/components/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@comtammatu/ui/components/alert-dialog";
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
import { TableEmptyStateRow } from "@/components/table-empty-state-row";

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
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  async function handleDelete(e: React.MouseEvent, id: number) {
    e.preventDefault();
    setPendingDeleteId(id);
    const result = await deleteTable({ id });
    setPendingDeleteId(null);
    if (!result.success) {
      toast.error(result.error);
    } else {
      toast.success(`${STATES_VI.deleted} ${TABLE_VI.long.toLowerCase()}`);
      setDeleteId(null);
    }
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TRow>
              <TableHead>{TABLE_VI.long}</TableHead>
              <TableHead>{TABLE_VI.area}</TableHead>
              <TableHead>{FORM_VI.status}</TableHead>
              <TableHead className="w-12" />
            </TRow>
          </TableHeader>
          <TableBody>
            {tables.length === 0 && (
              <TableEmptyStateRow
                colSpan={4}
                title={messages.settings.tables.emptyTitle}
                icon={
                  <IconToolsKitchen className="mx-auto size-8 text-muted-foreground" />
                }
              />
            )}
            {tables.map((table) => (
              <TRow
                key={table.id}
                className={pendingDeleteId === table.id ? "opacity-60" : ""}
              >
                <TableCell>
                  <span className="font-medium">
                    {messages.settings.tables.tableLabel(table.number)}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {table.zone_name ?? "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge domain="table" value={table.status} />
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-lg">
                        <IconDots className="size-4" />
                        <span className="sr-only">Menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditTable(table)}>
                        <IconPencil className="mr-2 size-4" />
                        {ACTIONS_VI.edit}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onSelect={() => setDeleteId(table.id)}
                      >
                        <IconTrash className="mr-2 size-4" />
                        {ACTIONS_VI.delete}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editTable && (
        <TableFormDialog
          open={!!editTable}
          onOpenChange={(open) => !open && setEditTable(null)}
          branchId={editTable.branch_id}
          zones={zones}
          table={editTable}
        />
      )}

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {messages.settings.tables.deleteTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {messages.settings.tables.deleteDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingDeleteId !== null}>
              {ACTIONS_VI.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={pendingDeleteId !== null}
              onClick={(e) => deleteId !== null && handleDelete(e, deleteId)}
            >
              {ACTIONS_VI.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
