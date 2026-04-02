"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Pencil, Trash2, UtensilsCrossed } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
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
import { TableFormDialog } from "./table-form-dialog";
import type { ZoneRow } from "./zone-table";
import { toast } from "@comtammatu/ui/components/sonner";

export interface TableRow {
  id: number;
  branch_id: number;
  zone_id: number | null;
  number: number;
  capacity: number;
  status: string;
  zone_name: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  available: "Trống",
  occupied: "Đang dùng",
  reserved: "Đã đặt",
  maintenance: "Bảo trì",
};

const STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  available: "default",
  occupied: "secondary",
  reserved: "outline",
  maintenance: "destructive",
};

interface TableTableProps {
  tables: TableRow[];
  zones: ZoneRow[];
}

export function TableTable({ tables, zones }: TableTableProps) {
  const [editTable, setEditTable] = useState<TableRow | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete(id: number) {
    startTransition(async () => {
      const result = await deleteTable(id);
      if (!result.success) {
        toast.error(result.error);
      } else {
        toast.success("Đã xóa bàn");
      }
      setDeleteId(null);
    });
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TRow>
              <TableHead>Bàn</TableHead>
              <TableHead>Khu vực</TableHead>
              <TableHead className="hidden md:table-cell">Sức chứa</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="w-12" />
            </TRow>
          </TableHeader>
          <TableBody>
            {tables.length === 0 && (
              <TRow>
                <TableCell colSpan={5} className="py-12 text-center">
                  <UtensilsCrossed className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    Chưa có bàn nào
                  </p>
                </TableCell>
              </TRow>
            )}
            {tables.map((table) => (
              <TRow key={table.id} className={isPending ? "opacity-60" : ""}>
                <TableCell>
                  <span className="font-medium">Bàn {table.number}</span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {table.zone_name ?? "—"}
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {table.capacity} người
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANTS[table.status] ?? "outline"}>
                    {STATUS_LABELS[table.status] ?? table.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">Menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditTable(table)}>
                        <Pencil className="mr-2 size-4" />
                        Sửa
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteId(table.id)}
                      >
                        <Trash2 className="mr-2 size-4" />
                        Xóa
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
            <AlertDialogTitle>Xóa bàn?</AlertDialogTitle>
            <AlertDialogDescription>
              Bàn sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isPending}
              onClick={() => deleteId !== null && handleDelete(deleteId)}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
